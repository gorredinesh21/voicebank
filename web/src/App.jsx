import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { initialState, reducer } from './lib/state'
import { useVoice } from './lib/voice'
import { handleUtterance } from './lib/agent'
import Phone from './components/Phone'
import Console from './components/Console'
import Toasts from './components/Toasts'

export default function App() {
  const [state, dispatch] = React.useReducer(reducer, undefined, initialState)
  const [micOn, setMicOn] = useState(false)
  const [log, setLog] = useState([])
  const [history, setHistory] = useState([])
  const [toasts, setToasts] = useState([])
  const [highlight, setHighlight] = useState(null)
  const [typed, setTyped] = useState('')

  const stateRef = useRef(state)
  const historyRef = useRef(history)
  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { historyRef.current = history }, [history])

  const toast = useCallback((msg) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000)
  }, [])

  const logFn = useCallback((entry) => {
    setLog((l) => [...l.slice(-40), { ts: new Date().toLocaleTimeString(), ...entry }])
  }, [])

  const resetAll = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [])

  // useVoice must be created before onUtterance (which needs say/setThinking),
  // and onUtterance must reach useVoice — break the cycle with a ref.
  const handleRef = useRef(null)
  const voice = useVoice({ enabled: micOn, onUtterance: (t) => handleRef.current?.(t) })
  const { say, setThinking } = voice

  const onUtterance = useCallback(
    (text) => {
      handleUtterance({
        utterance: text,
        stateRef,
        dispatch,
        historyRef,
        setHistory,
        say,
        setThinking,
        log: logFn,
        highlight: setHighlight,
        toast,
        resetAll,
      }).catch((e) => toast('Unexpected error: ' + e.message))
    },
    [logFn, resetAll, say, setThinking, toast]
  )
  handleRef.current = onUtterance

  const submitTyped = (e) => {
    e.preventDefault()
    const text = typed.trim()
    if (!text) return
    setTyped('')
    onUtterance(text)
  }

  const startDemo = () => {
    setMicOn(true)
    dispatch({ type: 'NAVIGATE', screen: 'login' })
    voice.enableMic()
    say('Hi Dinesh. What would you like to do today?')
  }

  const statusLabel = useMemo(() => {
    if (!micOn) return { text: 'Mic off', cls: 'idle' }
    switch (voice.status) {
      case 'listening': return { text: 'Listening…', cls: 'listening' }
      case 'thinking': return { text: 'Thinking…', cls: 'thinking' }
      case 'speaking': return { text: 'Speaking…', cls: 'speaking' }
      case 'mic_error': return { text: 'Mic blocked', cls: 'error' }
      case 'unsupported': return { text: 'Needs Chrome/Edge', cls: 'error' }
      default: return { text: 'Idle', cls: 'idle' }
    }
  }, [micOn, voice.status])

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-inner">
          <div className="brand">🎙️ VoiceBank</div>
          <h1>A bank you operate entirely by voice.</h1>
          <p className="tagline">
            An AI agent that listens, navigates the app, fills the forms, and confirms every step
            out loud — the same architecture voice-first banking runs on: speech recognition →
            LLM intent → UI automation → spoken confirmation.
          </p>
          <ol className="howto">
            <li><b>Click Start</b> (Chrome or Edge, allow the microphone)</li>
            <li><b>Just talk</b> — “what’s my balance?”, “send 500 rupees to Mom”, “pay my wifi bill”</li>
            <li><b>Confirm by voice</b> — money only moves after you say so and speak your PIN</li>
          </ol>
          {!micOn && (
            <button className="cta" onClick={startDemo}>Start voice banking</button>
          )}
          <p className="fineprint">
            No keyboard needed — but there is a typed-command box in the console if you prefer.
            This is a demo bank with play money; no real payments happen.
          </p>
        </div>
      </header>

      <main className="workspace">
        <Phone state={state} highlight={highlight} dispatch={dispatch} />
        <Console
          statusLabel={statusLabel}
          transcript={voice.transcript}
          micError={voice.micError}
          log={log}
          micOn={micOn}
          supported={voice.supported}
          onRestartMic={() => voice.enableMic()}
          typed={typed}
          setTyped={setTyped}
          submitTyped={submitTyped}
        />
      </main>

      <footer className="footer">
        VoiceBank — a voice-first banking demo · React + Web Speech API + Gemini (function-calling
        agent loop) · built by <a href="https://github.com/gorredinesh21" target="_blank" rel="noreferrer">Dinesh Gorre</a>
      </footer>

      <Toasts toasts={toasts} />
    </div>
  )
}
