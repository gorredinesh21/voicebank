import React, { useEffect, useRef } from 'react'

// The agent console: mic status, live transcript, action log, typed fallback.
export default function Console({
  statusLabel, transcript, micError, log, micOn, supported,
  onRestartMic, typed, setTyped, submitTyped,
}) {
  const logEndRef = useRef(null)
  useEffect(() => { logEndRef.current?.scrollIntoView({ block: 'end' }) }, [log])

  return (
    <section className="console" aria-label="Voice agent console">
      <div className="console-head">
        <span className={`status-dot ${statusLabel.cls}`} />
        <span className="status-text">{statusLabel.text}</span>
        <span className="console-title">Agent console</span>
      </div>

      {micError && (
        <div className="mic-error" role="alert">
          {micError}{' '}
          <button className="linkish" onClick={onRestartMic}>Restart listening</button>
        </div>
      )}
      {!supported && (
        <div className="mic-error" role="alert">
          Voice input needs Chrome or Edge — the typed box below drives the exact same agent.
        </div>
      )}

      <div className="transcript" data-id="transcript">
        {transcript ? <span className="interim">“{transcript}”</span> : <span className="transcript-idle">Your words will appear here…</span>}
      </div>

      <form className="typed-bar" onSubmit={submitTyped}>
        <input
          className="typed-input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder='No mic? Type a command — "send 500 rupees to Mom"'
          aria-label="Type a command for the voice agent"
        />
        <button className="btn btn-small" type="submit" disabled={!typed.trim()}>Run</button>
      </form>

      <div className="action-log" aria-live="polite">
        {log.length === 0 && <div className="log-empty">The agent’s steps will be listed here — every tap, every fill, visible.</div>}
        {log.map((l, i) => (
          <div key={i} className={`log-line log-${l.role}`}>
            {l.role === 'user' && <span className="who you">You</span>}
            {l.role === 'agent' && <span className="who agent">Agent</span>}
            {l.role === 'error' && <span className="who err">Error</span>}
            <span className="lt">{l.ts}</span>
            <div className="ltext">{l.text}</div>
            {l.did && <div className="ldid">{l.did}</div>}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      {!micOn && (
        <p className="console-hint">Mic is off — voice starts when you click “Start voice banking”.</p>
      )}
    </section>
  )
}
