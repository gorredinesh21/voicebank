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

// Spoken PIN digits: deterministic single-breath completion, no LLM round trip.
// "one two three four" finishes whatever confirmation stages remain.
const DIGIT_WORDS = {
  zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
}

function parseSpokenDigits(text) {
  const words = text.toLowerCase().replace(/[\s,]+/g, ' ').trim().split(' ')
  if (words.length === 1 && /^[0-9]{4}$/.test(words[0])) return words[0]
  if (words.length < 3 || words.length > 5) return null
  const digits = words.map((w) => DIGIT_WORDS[w])
  if (digits.some((d) => !d)) return null
  return digits.join('')
}

async function pinRail(state, dispatch, highlight, text) {
  const pin = parseSpokenDigits(text)
  if (!pin) return null
  const { money } = await import('./state')
  const tx =
    state.screen === 'confirm' || state.screen === 'pin'
      ? state.pendingTx
      : state.form.payee && state.form.amount
        ? { payee: state.form.payee, amount: state.form.amount }
        : null
  if (!tx) return null // digits with no payment in flight -> let the LLM handle
  if (state.screen === 'transfer') {
    highlight({ kind: 'tap', id: 'btn_continue' })
    await sleep(500)
    dispatch({ type: 'TAP', target: 'btn_continue' })
    await sleep(400)
  }
  if (state.screen === 'transfer' || state.screen === 'confirm') {
    highlight({ kind: 'tap', id: 'btn_confirm' })
    await sleep(500)
    dispatch({ type: 'TAP', target: 'btn_confirm' })
    await sleep(400)
  }
  dispatch({ type: 'FILL', field: 'pin', value: pin })
  highlight({ kind: 'fill', id: 'pin' })
  await sleep(400)
  return { speak: `Done. ${money(tx.amount)} sent to ${tx.payee}.` }
}

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
  setStage,
  setTurnDone,
}) {
  const text = utterance.trim()
  if (!text) return
  setStage?.('ears')
  log({ role: 'user', text })
  const state = stateRef.current
  const saw = describeState(state)

  try {
    for (const rail of LOCAL_RAILS) {
      if (rail.test.test(text)) {
        setStage?.('brain')
        const out = await rail.run(state, dispatch)
        if (out.reset) {
          resetAll()
        }
        setStage?.('hands')
        log({ role: 'agent', text: out.speak, did: '● local rail (offline, no AI call)', saw })
        setStage?.('mouth')
        await say(out.speak)
        return
      }
    }

    // Deterministic PIN completion — runs before the LLM.
    if (state.screen === 'transfer' || state.screen === 'confirm' || state.screen === 'pin') {
      const out = await pinRail(state, dispatch, highlight, text)
      if (out) {
        setStage?.('hands')
        log({ role: 'agent', text: out.speak, did: '● pin rail — completed payment (offline)', saw })
        setStage?.('mouth')
        await say(out.speak)
        return
      }
    }

    setStage?.('brain')
    setThinking()
    let reply
    try {
      reply = await callAgent(text, state, historyRef.current)
    } catch (e) {
      toast(`Agent error: ${e.message}`)
      log({ role: 'error', text: e.message })
      setStage?.('mouth')
      await say('Sorry, my brain hiccupped. Please try again.')
      return
    }

    setStage?.('hands')
    await executeActions(reply.actions, dispatch, highlight)
    log({ role: 'agent', text: reply.speak, did: describeActions(reply.actions) || '(speak only)', saw })
    setHistory([...historyRef.current, { user: text, did: describeActions(reply.actions) }].slice(-3))
    setStage?.('mouth')
    await say(reply.speak)
  } finally {
    setStage?.(null)
    setTurnDone?.()
  }
}
