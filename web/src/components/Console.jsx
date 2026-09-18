import React, { useEffect, useRef } from 'react'

const STAGES = [
  { id: 'ears', icon: '🎙️', label: 'Heard' },
  { id: 'brain', icon: '🧠', label: 'Thinking' },
  { id: 'hands', icon: '🖐️', label: 'Acting' },
  { id: 'mouth', icon: '🔊', label: 'Speaking' },
]

// The agent console: pipeline chips, mic status, live transcript, action log,
// typed fallback. Everything the agent does is visible here on purpose.
export default function Console({
  statusLabel, transcript, micError, endingTurn, stage, log, micOn, supported,
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

      <div className="stages" aria-label="Pipeline stages">
        {STAGES.map((s, i) => (
          <React.Fragment key={s.id}>
            {i > 0 && <span className="stage-arrow">›</span>}
            <span className={'stage-chip' + (stage === s.id ? ' active' : '')}>
              <span className="stage-ic">{s.icon}</span> {s.label}
            </span>
          </React.Fragment>
        ))}
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
        {transcript ? (
          <span className="interim">
            “{transcript}”
            {endingTurn && <span className="ending"> … got it, sending</span>}
            {!endingTurn && micOn && <span className="keepgoing"> …keep talking, pause when done</span>}
          </span>
        ) : (
          <span className="transcript-idle">
            {micOn ? 'Listening — your words appear here as you speak. Pause ~2s to finish.' : 'Your words will appear here…'}
          </span>
        )}
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
            {l.saw && (
              <div className="lsaw" title={JSON.stringify(l.saw)}>
                saw: {JSON.stringify(l.saw).slice(0, 110)}…
              </div>
            )}
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
