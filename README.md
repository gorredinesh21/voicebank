# 🎙️ VoiceBank — a bank you operate entirely by voice

A voice-first banking demo: an AI agent that **listens, navigates the app, fills the forms, and confirms every step out loud**. Say *"send 500 rupees to Mom"* and watch the app open transfers, type the payee and amount, ask you to confirm, take your spoken PIN, and read back the receipt.

This is the same architecture voice-first banking runs on:

```
mic ──► speech-to-text ──► LLM intent (function calling) ──► UI automation ──► text-to-speech ──► mic
ears        (Web Speech API)      (Gemini)                    (typed actions      (speechSynthesis)
                                    │                          on a state machine)
                                    └── sees a machine-readable description of the current screen
```

## Why it's more than a chat window

- **The agent physically drives the UI.** Every action it takes is a typed command (`NAVIGATE` / `FILL` / `TAP`) executed by the same reducer a human tap goes through — and you *see* each tap glow and each field flash.
- **Its decisions are visible.** The agent console logs every utterance, every action, every reply — no magic.
- **Money can't move without you.** Payments go through a confirmation screen and a spoken PIN. The LLM is *not allowed* to jump to a receipt; the server strips any action that tries.
- **Instant cancel.** "Cancel" / "stop" is handled locally, offline, mid-flow.
- **No mic? No problem.** A typed-command box drives the exact same agent loop (also how this repo is tested end-to-end).

## Try it

1. Open the app in **Chrome or Edge** (speech recognition needs them).
2. Click **Start voice banking**, allow the microphone.
3. Just talk:
   - *"what's my balance?"*
   - *"send 500 rupees to Mom"* → *"confirm"* → *"one two three four"*
   - *"pay my wifi bill"*
   - *"cancel"* — anytime, mid-flow

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 18 (Vite), no state library — one reducer, typed actions |
| Speech in | Web Speech API (`SpeechRecognition`, en-IN, continuous) |
| Speech out | `speechSynthesis` with echo guard (mic pauses while speaking) |
| Agent brain | Gemini on Vertex AI — one structured-output call per utterance |
| Backend | FastAPI (`POST /api/act`), action sanitiser + JSON repair retry |
| Deploy | Cloud Run (single container serves the built frontend + API) |

No API keys in the repo: the backend authenticates to Vertex AI via the
metadata server on Cloud Run (or `gcloud auth print-access-token` locally).

## Run locally

```bash
# backend (FastAPI on :8000)
cd server
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
uvicorn app:app --port 8000

# frontend (Vite on :5173, proxies /api -> :8000)
cd web
npm install && npm run dev
```

## Run with Docker

```bash
docker build -t voicebank .
docker run -p 8080:8080 -e VB_PROJECT=your-gcp-project -e GOOGLE_APPLICATION_CREDENTIALS=/path/key.json voicebank
# needs a GCP identity with Vertex AI User rights
```

## Repo layout

```
server/app.py          agent endpoint + Gemini client + action safety sanitiser
web/src/lib/state.js   the whole bank: state machine, reducer, screen descriptors
web/src/lib/voice.js   mic + speaker ownership, echo guard, auto-restart
web/src/lib/agent.js   utterance loop: local rails -> API -> visible action execution
web/src/components/    phone screens, agent console, toasts
```

Built by [Dinesh Gorre](https://github.com/gorredinesh21). Play money only — no real payments, no real bank.
