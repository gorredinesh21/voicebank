import React from 'react'
import { money, words } from '../lib/state'

// ---------------------------------------------------------------------------
// All phone screens. Every interactive element carries data-id so the agent's
// glow animation can find it, and voice + touch share the same dispatch path.
// ---------------------------------------------------------------------------

const Btn = ({ id, label, kind = 'primary', dispatch, hl, disabled }) => (
  <button
    data-id={id}
    className={`btn btn-${kind} ${hl(id)}`}
    disabled={disabled}
    onClick={() => dispatch({ type: 'TAP', target: id })}
  >
    {label}
  </button>
)

export function WelcomeScreen({ dispatch, hl }) {
  return (
    <div className="scr scr-welcome">
      <div className="welcome-art">🎙️</div>
      <h2>Welcome to VoiceBank</h2>
      <p>A bank you operate entirely by voice. Say or tap to begin.</p>
      <Btn id="btn_start" label="Get started" dispatch={dispatch} hl={hl} />
    </div>
  )
}

export function LoginScreen({ state, dispatch, hl }) {
  return (
    <div className="scr">
      <h2>Log in</h2>
      <div className="login-card">
        <div className="avatar">DG</div>
        <div>
          <div className="login-name">{state.user.name} Gorre</div>
          <div className="login-sub">Savings ****4821 · demo account</div>
        </div>
      </div>
      <p className="hint">Demo login — no password needed. Say “log in”.</p>
      <Btn id="btn_login" label="Log in" dispatch={dispatch} hl={hl} />
    </div>
  )
}

export function HomeScreen({ state, dispatch, hl }) {
  return (
    <div className="scr">
      <div className="greeting">Good day, {state.user.name} 👋</div>
      {state.accounts.map((a) => (
        <div key={a.id} className="account" data-id={`account_${a.id}`}>
          <div>
            <div className="acct-name">{a.name}</div>
            <div className="acct-num">{a.number}</div>
          </div>
          <div className={'acct-balance' + (a.id === 'sav' ? ' primary' : '')}>{money(a.balance)}</div>
        </div>
      ))}
      <div className="actions">
        <Btn id="btn_transfer" label="↗ Transfer" dispatch={dispatch} hl={hl} />
        <Btn id="btn_bills" label="🧾 Pay bills" kind="ghost" dispatch={dispatch} hl={hl} />
      </div>
      {state.lastTx && (
        <div className="last-tx" data-id="last_tx">
          <div className="lt-label">Last transaction</div>
          <div className="lt-row">
            <span>{money(state.lastTx.amount)} → {state.lastTx.payee}</span>
            <span className="lt-ref">{state.lastTx.ref}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export function TransferScreen({ state, dispatch, hl, typing }) {
  const { form, formError } = state
  // while the agent types into a field, show the partial text + block caret
  const tv = (id, real) =>
    typing && typing.field === id
      ? { value: typing.text + '▍', cls: 'input typing' }
      : { value: real ?? '', cls: 'input' }
  return (
    <div className="scr">
      <h2>Transfer money</h2>
      <p className="hint">From Savings ****4821</p>
      <label className="field">
        <span>To</span>
        <input data-id="payee" className={`${tv('payee', form.payee).cls} ${hl('payee')}`}
          value={tv('payee', form.payee).value} placeholder="Mom" readOnly />
      </label>
      <label className="field">
        <span>Amount (₹)</span>
        <input data-id="amount" className={`${tv('amount', form.amount).cls} ${hl('amount')}`}
          value={tv('amount', form.amount).value} placeholder="500" readOnly inputMode="decimal" />
      </label>
      <label className="field">
        <span>Note (optional)</span>
        <input data-id="note" className={`${tv('note', form.note).cls} ${hl('note')}`}
          value={tv('note', form.note).value} placeholder="Rent for October" readOnly />
      </label>
      {formError && <div className="form-error" role="alert">{formError}</div>}
      <div className="actions">
        <Btn id="btn_continue" label="Continue" dispatch={dispatch} hl={hl}
          disabled={!form.payee || !form.amount} />
        <Btn id="btn_back" label="Back" kind="ghost" dispatch={dispatch} hl={hl} />
      </div>
      <p className="hint">Voice fills these for you — try “send 500 rupees to Mom”.</p>
    </div>
  )
}

export function ConfirmScreen({ state, dispatch, hl }) {
  const tx = state.pendingTx
  if (!tx) return <div className="scr"><h2>Nothing to confirm</h2></div>
  return (
    <div className="scr scr-confirm">
      <h2>Confirm transfer</h2>
      <div className="confirm-card" data-id="confirm_card">
        <div className="cf-amount">{money(tx.amount)}</div>
        <div className="cf-to">to <b>{tx.payee}</b></div>
        <div className="cf-from">from {tx.from}</div>
        {tx.note && <div className="cf-note">“{tx.note}”</div>}
      </div>
      <p className="hint">Say “confirm” to continue, or “cancel” to stop. Nothing moves without your confirmation.</p>
      <div className="actions">
        <Btn id="btn_confirm" label="Confirm" dispatch={dispatch} hl={hl} />
        <Btn id="btn_cancel" label="Cancel" kind="ghost" dispatch={dispatch} hl={hl} />
      </div>
    </div>
  )
}

export function PinScreen({ state, dispatch, hl }) {
  return (
    <div className="scr scr-pin">
      <h2>Enter your PIN</h2>
      <p className="hint">Speak your 4-digit PIN, one digit at a time: “one two three four”.</p>
      <div className="pin-dots" data-id="pin">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`pin-dot ${hl('pin')} ${state.pin.length > i ? 'filled' : ''}`}>•</span>
        ))}
      </div>
      <Btn id="btn_back_confirm" label="← Back to confirm" kind="ghost" dispatch={dispatch} hl={hl} />
      <p className="hint subtle">(any 4 digits work in this demo)</p>
    </div>
  )
}

export function ReceiptScreen({ state, dispatch, hl }) {
  const tx = state.lastTx
  if (!tx) return <div className="scr"><h2>No receipt yet</h2></div>
  return (
    <div className="scr scr-receipt">
      <div className="receipt-check" data-id="receipt">✓</div>
      <h2>Payment successful</h2>
      <div className="receipt-lines">
        <div><span>Amount</span><b>{money(tx.amount)}</b></div>
        <div><span>To</span><b>{tx.payee}</b></div>
        <div><span>From</span><b>{tx.from}</b></div>
        <div><span>Reference</span><b>{tx.ref}</b></div>
        <div><span>Balance now</span><b>{money(tx.balanceAfter)}</b></div>
      </div>
      <Btn id="btn_done" label="Done" dispatch={dispatch} hl={hl} />
    </div>
  )
}

export function BillsScreen({ state, dispatch, hl }) {
  return (
    <div className="scr">
      <h2>Pay bills</h2>
      {state.bills.map((b) => {
        const paid = !!state.paidBills[b.id]
        return (
          <div key={b.id} className={'bill' + (paid ? ' paid' : '')} data-id={`bill_${b.id}`}>
            <div>
              <div className="bill-name">{b.name}</div>
              <div className="bill-due">due {b.due}</div>
            </div>
            {paid ? (
              <span className="bill-paid">Paid ✓</span>
            ) : (
              <Btn id={`btn_pay_${b.id}`} label={`Pay ${money(b.amount)}`} kind="small"
                dispatch={dispatch} hl={hl} />
            )}
          </div>
        )
      })}
      <Btn id="btn_back" label="← Back" kind="ghost" dispatch={dispatch} hl={hl} />
    </div>
  )
}

export function HelpScreen({ dispatch }) {
  const examples = [
    '“What’s my balance?”',
    '“Send 500 rupees to Mom”',
    '“Pay my wifi bill”',
    '“Cancel” — anytime, mid-flow',
    '“What can I say?”',
  ]
  return (
    <div className="scr">
      <h2>What you can say</h2>
      <ul className="help-list">
        {examples.map((e) => <li key={e}>{e}</li>)}
      </ul>
      <Btn id="btn_back" label="← Back" kind="ghost" dispatch={dispatch} hl={() => ''} />
    </div>
  )
}
