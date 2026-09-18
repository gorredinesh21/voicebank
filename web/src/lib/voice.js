import { useCallback, useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// useVoice — one hook owning the mic and the speaker.
//
// STT: Web Speech API (Chrome/Edge), en-IN, continuous with auto-restart.
// TTS: speechSynthesis, preferred English voice.
// Echo guard: recognition is stopped while we speak, resumed after.
// ---------------------------------------------------------------------------

const VoiceStatus = {
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  MIC_ERROR: 'mic_error',
  UNSUPPORTED: 'unsupported',
}

function getRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) return null
  const rec = new SR()
  rec.lang = 'en-IN'
  rec.continuous = true
  rec.interimResults = true
  return rec
}

export function useVoice({ enabled, onUtterance, onSpeakStart, onSpeakEnd }) {
  const [status, setStatus] = useState(VoiceStatus.IDLE)
  const [transcript, setTranscript] = useState('')
  const [micError, setMicError] = useState('')
  const recRef = useRef(null)
  const wantListeningRef = useRef(false)
  const speakingRef = useRef(false)
  const onUtteranceRef = useRef(onUtterance)
  const voiceRef = useRef(null)
  const supported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  useEffect(() => { onUtteranceRef.current = onUtterance }, [onUtterance])

  // pick a decent English voice once available
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const pick = () => {
      const voices = window.speechSynthesis.getVoices()
      voiceRef.current =
        voices.find((v) => /en[-_]IN/i.test(v.lang) && /female|google/i.test(v.name)) ||
        voices.find((v) => /en[-_]IN/i.test(v.lang)) ||
        voices.find((v) => /^en/i.test(v.lang)) ||
        voices[0] || null
    }
    pick()
    window.speechSynthesis.onvoiceschanged = pick
    return () => { window.speechSynthesis.onvoiceschanged = null }
  }, [])

  const startListening = useCallback(() => {
    if (!supported || speakingRef.current || !wantListeningRef.current) return
    const rec = recRef.current
    if (!rec) return
    try {
      rec.start()
      setStatus(VoiceStatus.LISTENING)
      setMicError('')
    } catch {
      /* start() throws if already running — fine */
    }
  }, [supported])

  const stopListening = useCallback(() => {
    const rec = recRef.current
    if (rec) { try { rec.stop() } catch { /* ignore */ } }
  }, [])

  // wire recognition events once
  useEffect(() => {
    if (!enabled || !supported) {
      if (!supported) setStatus(VoiceStatus.UNSUPPORTED)
      return
    }
    const rec = getRecognition()
    recRef.current = rec

    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const text = res[0].transcript.trim()
        if (res.isFinal) {
          if (text) {
            setTranscript('')
            onUtteranceRef.current(text)
          }
        } else {
          interim += text + ' '
        }
      }
      if (interim) setTranscript(interim.trim())
    }

    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantListeningRef.current = false
        setMicError(
          'Microphone blocked. Click the mic icon in the address bar, allow it, then click Restart listening.'
        )
        setStatus(VoiceStatus.MIC_ERROR)
      } else if (e.error === 'no-speech' || e.error === 'aborted') {
        // benign — onend will restart us
      } else {
        setMicError('Voice error: ' + e.error)
      }
    }

    rec.onend = () => {
      if (wantListeningRef.current && !speakingRef.current) {
        setTimeout(() => startListening(), 250) // auto-restart continuous mode
      } else if (!wantListeningRef.current) {
        setStatus(VoiceStatus.IDLE)
      }
    }

    return () => {
      wantListeningRef.current = false
      try { rec.abort() } catch { /* ignore */ }
      recRef.current = null
    }
  }, [enabled, supported, startListening])

  const enableMic = useCallback(() => {
    wantListeningRef.current = true
    startListening()
  }, [startListening])

  const say = useCallback(
    (text) =>
      new Promise((resolve) => {
        if (!('speechSynthesis' in window) || !text) return resolve()
        speakingRef.current = true
        stopListening()
        setStatus(VoiceStatus.SPEAKING)
        onSpeakStart?.()
        const u = new SpeechSynthesisUtterance(text)
        if (voiceRef.current) u.voice = voiceRef.current
        u.lang = voiceRef.current?.lang || 'en-IN'
        u.rate = 1.02
        u.onend = () => {
          speakingRef.current = false
          onSpeakEnd?.()
          setTimeout(() => {
            startListening()
            resolve()
          }, 150)
        }
        u.onerror = () => {
          speakingRef.current = false
          onSpeakEnd?.()
          setTimeout(() => {
            startListening()
            resolve()
          }, 150)
        }
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(u)
      }),
    [onSpeakEnd, onSpeakStart, startListening, stopListening]
  )

  const setThinking = useCallback(() => {
    stopListening()
    setStatus(VoiceStatus.THINKING)
  }, [stopListening])

  const pauseMic = stopListening
  const resumeMic = startListening

  return { status, transcript, micError, supported, enableMic, say, setThinking, pauseMic, resumeMic, VoiceStatus }
}
