import { describeState } from './state'

// ---------------------------------------------------------------------------
// Agent orchestration: utterance -> (local rails | /api/act) -> actions -> TTS.
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Instant, offline commands that must never wait for a network round trip.
const LOCAL_RAILS = [
  {
    test: /\b(cancel|stop it|stop this|never ?mind|abort|forget it)\b/i,
    run: async (state, dispatch) => {
      if (state.screen === 'confirm' || state.screen === 'pin') {
        dispatch({ type: 'TAP', target: 'btn_cancel' }) // clears pendingTx + form
      } else if (state.screen === 'transfer') {
        dispatch({ type: 'CLEAR_FORM' })
        dispatch({ type: 'NAVIGATE', screen: 'home' })
      } else {
        dispatch({ type: 'NAVIGATE', screen: 'home' })
      }
      return { speak: 'Okay, cancelled. Nothing was sent.' }
    },
  },
  {
    test: /\b(help|what can (i|you) say|commands?)\b/i,
    run: async (state, dispatch) => {
      dispatch({ type: 'NAVIGATE', screen: 'help' })
      return {
        speak:
          'You can ask for your balance, send money, or pay a bill. For example: what is my balance, send 500 rupees to Mom, or pay my electricity bill.',
      }
    },
  },
  {
    test: /\b(log ?out|sign ?out)\b/i,
    run: async () => ({ speak: 'Goodbye!', reset: true }),
  },
  {
    test: /^(done|go home|home|main menu|home screen)$/i,
    run: async (state, dispatch) => {
      if (state.screen === 'confirm' || state.screen === 'pin') {
        dispatch({ type: 'TAP', target: 'btn_cancel' })
      } else {
        dispatch({ type: 'NAVIGATE', screen: 'home' })
      }
      return { speak: 'Back on your accounts.' }
    },
  },
]

async function callAgent(utterance, state, history) {
  const res = await fetch('/api/act', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance,
      state: describeState(state),
      history,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`agent error (${res.status}) ${detail.slice(0, 160)}`)
  }
  return res.json()
}

/**
 * Execute agent actions one by one so the user SEES the agent operate the UI.
 * highlight({kind, id}) triggers the glow/flash animation on the element.
 */
async function executeActions(actions, dispatch, highlight) {
  for (const a of actions) {
    if (a.type === 'TAP') {
      highlight({ kind: 'tap', id: a.target })
      await sleep(550)
      dispatch(a)
      await sleep(300)
    } else if (a.type === 'FILL') {
      await sleep(180)
      dispatch(a)
      highlight({ kind: 'fill', id: a.field })
      await sleep(480)
    } else if (a.type === 'NAVIGATE') {
      dispatch(a)
      await sleep(420)
    } else {
      dispatch(a)
      await sleep(200)
    }
  }
}

export function describeActions(actions) {
  return actions
    .map((a) => {
      if (a.type === 'NAVIGATE') return `→ ${a.screen}`
      if (a.type === 'FILL') return `✎ ${a.field} = ${a.value}`
      if (a.type === 'TAP') return `● press ${a.target.replace(/^btn_/, '').replace(/_/g, ' ')}`
      if (a.type === 'CLEAR_FORM') return '✕ clear form'
      if (a.type === 'RESET') return '⟲ reset'
      return a.type
    })
    .join('  ')
}

export async function handleUtterance({
  utterance,
  stateRef,
  dispatch,
  historyRef,
  setHistory,
  say,
  setThinking,
  log,
  highlight,
  toast,
  resetAll,
}) {
  const text = utterance.trim()
  if (!text) return
  log({ role: 'user', text })
  const state = stateRef.current

  for (const rail of LOCAL_RAILS) {
    if (rail.test.test(text)) {
      const out = await rail.run(state, dispatch)
      if (out.reset) {
        resetAll()
      }
      log({ role: 'agent', text: out.speak, did: 'local rail' })
      await say(out.speak)
      return
    }
  }

  setThinking()
  let reply
  try {
    reply = await callAgent(text, state, historyRef.current)
  } catch (e) {
    toast(`Agent error: ${e.message}`)
    log({ role: 'error', text: e.message })
    await say('Sorry, my brain hiccupped. Please try again.')
    return
  }

  await executeActions(reply.actions, dispatch, highlight)
  log({ role: 'agent', text: reply.speak, did: describeActions(reply.actions) })
  setHistory([...historyRef.current, { user: text, did: describeActions(reply.actions) }].slice(-3))
  await say(reply.speak)
}
