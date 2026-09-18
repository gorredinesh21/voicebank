"""VoiceBank agent backend.

POST /api/act  {utterance, state, history} -> {actions, speak}
GET  /api/health

The LLM call goes to Gemini on Vertex AI using the same auth pattern as
quackquery/support-copilot: metadata-server token on Cloud Run, `gcloud auth
print-access-token` on a laptop. No API keys anywhere.
"""
from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import time

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("voicebank")

MODEL = os.environ.get("VB_MODEL", "gemini-2.5-flash")
GCP_PROJECT = os.environ.get("VB_PROJECT", "personal-project-dg21")
GCP_REGION = os.environ.get("VB_REGION", "asia-south1")
LLM_TIMEOUT_S = 30
MAX_ATTEMPTS = 4

VALID_SCREENS = ["welcome", "login", "home", "transfer", "confirm",
                 "pin", "receipt", "bills", "help"]
VALID_ACTIONS = {"NAVIGATE", "FILL", "TAP", "CLEAR_FORM", "RESET"}

SYSTEM_PROMPT = """You are the voice agent inside VoiceBank, a demo banking web app that the user operates entirely by voice. You receive the user's spoken utterance plus a machine-readable description of the current screen, and you reply with ONE JSON object that advances the user's request.

Reply with ONLY this JSON, no markdown fences:
{"actions": [ {"type": "...", ...}, ... ], "speak": "..."}

Valid actions:
- {"type":"NAVIGATE","screen":"<screen>"}  — move to a screen
- {"type":"FILL","field":"<field>","value":"<value>"}  — fill a field on the CURRENT screen (payee/amount/note/pin)
- {"type":"TAP","target":"<button id>"}  — press a button on the CURRENT screen
- {"type":"CLEAR_FORM"}
- {"type":"RESET"}  — back to home, clear everything

Hard rules:
1. Payments complete ONLY through the flow transfer/confirm -> TAP btn_confirm -> PIN screen -> fill pin. NEVER navigate to "receipt" or claim money moved unless the receipt screen is already active. You filling the PIN is the final step; the app itself then shows the receipt.
2. When the transfer form is complete, end your turn with a confirmation question, e.g. speak: "Sending 500 rupees to Mom. Say confirm to continue, or cancel to stop."
3. Answer lookups IMMEDIATELY using the "app" snapshot (balances, unpaid bills, last transaction) regardless of which screen is active: NAVIGATE to the relevant screen so the user sees it, and SPEAK the answer with numbers in natural words ("Your Savings balance is 42 thousand 300 rupees"). For "balance" without a specific account, read the Savings balance and offer the others. Never ask a clarifying question when the answer is already in the data.
4. One intent per reply: fill/navigate what is needed for THIS utterance, then stop. Do not chain extra steps the user did not ask for.
5. Unknown payees: you may fill any name the user says (it is a demo), but prefer the known payees listed when they match.
6. If the utterance is not banking-related, briefly say what you can do (balances, transfers, pay bills) and take no actions.
7. "speak" is short, warm, plain English (max ~2 sentences). Never mention screens by id; describe naturally ("opening transfers").
8. Amounts: the user may say words ("five hundred") — always emit numeric values in FILL ("500").
9. PIN: when on the PIN screen, digits arrive as spoken words ("one two three four") — FILL {"field":"pin","value":"1234"}. If the user speaks PIN digits while still on the CONFIRM screen, chain both in one reply: first TAP btn_confirm, then FILL pin — the app executes actions in order.
11. Never claim a payment succeeded unless your actions this turn actually complete it (PIN filled / receipt already showing). If you did not complete it, describe what you did and what you need next.
10. For "cancel"/"stop"/"never mind" mid-flow: CLEAR_FORM + NAVIGATE home + a reassuring speak. (The app also has a local fast-cancel; you are the fallback.)
"""

app = FastAPI(title="VoiceBank", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ActRequest(BaseModel):
    utterance: str = Field(min_length=1, max_length=500)
    state: dict
    history: list[dict] = []


# --------------------------------------------------------------------------
# Gemini on Vertex AI (auth pattern from quackquery/support-copilot)
# --------------------------------------------------------------------------

def _fetch_token() -> str:
    try:
        r = requests.get(
            "http://metadata.google.internal/computeMetadata/v1/instance/"
            "service-accounts/default/token",
            headers={"Metadata-Flavor": "Google"}, timeout=3)
        if r.status_code == 200:
            return r.json()["access_token"]
    except requests.RequestException:
        pass
    out = subprocess.run(["gcloud", "auth", "print-access-token"],
                         capture_output=True, text=True, timeout=30)
    if out.returncode != 0:
        raise RuntimeError(f"gcloud auth failed: {out.stderr[:200]}")
    return out.stdout.strip()


_token_cache = {"tok": None, "exp": 0.0}


def _auth_header() -> dict:
    now = time.time()
    if _token_cache["tok"] is None or now > _token_cache["exp"]:
        _token_cache["tok"] = _fetch_token()
        _token_cache["exp"] = now + 45 * 60
    return {"Authorization": f"Bearer {_token_cache['tok']}"}


def _gemini(prompt: str) -> str:
    url = (f"https://{GCP_REGION}-aiplatform.googleapis.com/v1/projects/"
           f"{GCP_PROJECT}/locations/{GCP_REGION}/publishers/google/"
           f"models/{MODEL}:generateContent")
    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 1024,
            "response_mime_type": "application/json",
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    r = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        r = requests.post(url, headers=_auth_header(), json=payload,
                          timeout=LLM_TIMEOUT_S)
        if r.status_code in (429, 500, 503):
            wait = int(r.headers.get("Retry-After", "10")) + (attempt - 1) * 5
            log.warning("LLM %s; backoff %ss (attempt %s)",
                        r.status_code, wait, attempt)
            time.sleep(wait)
            continue
        break
    if r is None or r.status_code != 200:
        raise RuntimeError(f"LLM API {getattr(r, 'status_code', '?')}: "
                           f"{getattr(r, 'text', '')[:200]}")
    cand = r.json()["candidates"][0]
    for part in cand.get("content", {}).get("parts", []):
        if "text" in part:
            return part["text"].strip()
    raise RuntimeError(f"LLM returned no text (finishReason="
                       f"{cand.get('finishReason', '?')})")


# --------------------------------------------------------------------------
# Response parsing + safety validation
# --------------------------------------------------------------------------

def _sanitize_actions(raw: list) -> list:
    out = []
    for a in raw or []:
        if not isinstance(a, dict):
            continue
        t = str(a.get("type", "")).upper()
        if t not in VALID_ACTIONS:
            continue
        act = {"type": t}
        if t == "NAVIGATE":
            screen = str(a.get("screen", "")).lower()
            if screen not in VALID_SCREENS:
                continue
            act["screen"] = screen
        elif t == "FILL":
            field, value = str(a.get("field", "")), a.get("value")
            if not field or value is None:
                continue
            act["field"], act["value"] = field, value
        elif t == "TAP":
            target = str(a.get("target", ""))
            if not target:
                continue
            act["target"] = target
        out.append(act)
        if len(out) >= 6:      # one intent per turn; cap runaway replies
            break
    return out


def _parse_agent_reply(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("no JSON object in reply")
    obj = json.loads(m.group(0))
    actions = _sanitize_actions(obj.get("actions"))
    speak = str(obj.get("speak", "")).strip()[:400]
    if not speak:
        speak = "Sorry, I did not catch that. You can ask for your balance, make a transfer, or pay a bill."
    # LLM must never fast-forward past the money gate itself
    if any(a["type"] == "NAVIGATE" and a["screen"] in ("receipt", "pin")
           for a in actions):
        actions = [a for a in actions
                   if not (a["type"] == "NAVIGATE" and a["screen"] in ("receipt", "pin"))]
        speak = ("I can't skip the confirmation steps. "
                 + ("Let's confirm first. " if "confirm" not in speak.lower() else "")
                 + speak)
    return {"actions": actions, "speak": speak}


def _build_prompt(req: ActRequest) -> str:
    state = json.dumps(req.state, ensure_ascii=False)
    history = ""
    for h in req.history[-3:]:
        history += (f'- user: "{str(h.get("user",""))[:120]}" -> '
                    f'{str(h.get("did",""))[:160]}\n')
    return (f"CURRENT SCREEN STATE:\n{state}\n\n"
            f"RECENT TURNS (oldest first):\n{history or '(none)'}\n\n"
            f'USER SAID: "{req.utterance}"\n\n'
            f"Reply with the JSON object now.")


@app.post("/api/act")
def act(req: ActRequest):
    prompt = _build_prompt(req)
    try:
        raw = _gemini(prompt)
        parsed = _parse_agent_reply(raw)
    except (ValueError, json.JSONDecodeError):
        # one repair retry with a stricter nudge
        try:
            raw = _gemini(prompt + '\nYour previous reply was not valid '
                           'JSON of the required shape. Output ONLY the JSON object.')
            parsed = _parse_agent_reply(raw)
        except Exception as e:                      # noqa: BLE001
            log.exception("agent repair failed")
            raise HTTPException(502, f"agent error: {e}") from e
    except Exception as e:                          # noqa: BLE001
        log.exception("agent call failed")
        raise HTTPException(502, f"agent error: {e}") from e
    log.info("utterance=%r -> %s", req.utterance[:80], parsed["actions"])
    return parsed


@app.get("/api/health")
def health():
    return {"ok": True, "model": MODEL}


# Serve the built frontend in production (same origin -> mic works on HTTPS).
# Docker copies server/ flat next to web/dist; the repo keeps server/ and web/ apart.
_BASE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(_BASE, "web", "dist")
if not os.path.isdir(DIST):
    DIST = os.path.join(os.path.dirname(_BASE), "web", "dist")
if os.path.isdir(DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")

    @app.get("/")
    def index():
        return FileResponse(os.path.join(DIST, "index.html"))

    @app.get("/{path:path}")
    def spa(path: str):
        candidate = os.path.join(DIST, path)
        if os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(DIST, "index.html"))
