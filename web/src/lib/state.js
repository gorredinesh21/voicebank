// VoiceBank application state machine.
// The agent (LLM) never mutates state directly — it returns typed actions
// (NAVIGATE / FILL / TAP / CLEAR_FORM / RESET) and this reducer executes
// them through the same path a human tap would take.

export const SCREENS = {
  welcome: 'welcome',
  login: 'login',
  home: 'home',
  transfer: 'transfer',
  confirm: 'confirm',
  pin: 'pin',
  receipt: 'receipt',
  bills: 'bills',
  help: 'help',
}

export function initialState() {
  return {
    screen: 'welcome',
    loggedIn: false,
    user: { name: 'Dinesh' },
    accounts: [
      { id: 'sav', name: 'Savings', number: '****4821', balance: 42300.0 },
      { id: 'cur', name: 'Current', number: '****7702', balance: 18560.5 },
      { id: 'dep', name: 'Fixed Deposit', number: '****9013', balance: 200000.0 },
    ],
    payees: [
      { id: 'mom', name: 'Mom', account: '****2299' },
      { id: 'dad', name: 'Dad', account: '****3145' },
      { id: 'ramesh', name: 'Ramesh (rent)', account: '****8807' },
    ],
    form: { payee: '', amount: null, note: '' },
    formError: '',
    pendingTx: null,
    pin: [],
    lastTx: null,
    bills: [
      { id: 'power', name: 'Tata Power', due: '28 Sep', amount: 1240 },
      { id: 'wifi', name: 'ACT Fibernet', due: '30 Sep', amount: 999 },
      { id: 'mobile', name: 'Jio Postpaid', due: '05 Oct', amount: 399 },
    ],
    paidBills: {},
    txCount: 0,
  }
}

export const money = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: Number(n) % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })

export const words = (n) => {
  // "42300" -> "42 thousand 300 rupees" (simple, good enough for speech)
  const num = Math.round(Number(n) || 0)
  if (num < 1000) return `${num} rupees`
  const lakh = Math.floor(num / 100000)
  const thousand = Math.floor((num % 100000) / 1000)
  const rest = num % 1000
  const parts = []
  if (lakh) parts.push(`${lakh} lakh`)
  if (thousand) parts.push(`${thousand} thousand`)
  if (rest) parts.push(`${rest}`)
  return parts.join(' ') + ' rupees'
}

function parseAmount(v) {
  if (v === null || v === undefined) return null
  const cleaned = String(v).replace(/[^0-9.]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

function normalizePayee(v, state) {
  const raw = String(v || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  const hit = state.payees.find(
    (p) => p.name.toLowerCase().includes(lower) || lower.includes(p.name.split(' ')[0].toLowerCase())
  )
  return hit ? hit.name : raw
}

function digitsOnly(v) {
  return String(v || '').replace(/[^0-9]/g, '')
}

function makeRef(state) {
  return 'VB-' + String(100000 + state.txCount * 137 + Math.floor(Math.random() * 800))
}

function executeTransfer(state) {
  const tx = state.pendingTx
  const accounts = state.accounts.map((a) =>
    tx.fromId === a.id ? { ...a, balance: Math.round((a.balance - tx.amount) * 100) / 100 } : a
  )
  const paidBills = { ...state.paidBills }
  if (tx.billId) paidBills[tx.billId] = true
  const from = accounts.find((a) => a.id === tx.fromId)
  return {
    ...state,
    accounts,
    paidBills,
    lastTx: { ...tx, ref: makeRef(state), balanceAfter: from.balance },
    txCount: state.txCount + 1,
    pendingTx: null,
    form: { payee: '', amount: null, note: '' },
    pin: [],
    screen: 'receipt',
  }
}

export function reducer(state, action) {
  switch (action.type) {
    case 'NAVIGATE': {
      const screen = action.screen
      if (!(screen in SCREENS)) return state
      if (screen === 'pin' && !state.pendingTx) return { ...state, screen: 'home' }
      if (screen === 'receipt' && !state.lastTx) return state
      return { ...state, screen }
    }

    case 'FILL': {
      const { field, value } = action
      if (state.screen === 'pin') {
        const d = digitsOnly(value).slice(0, 4)
        const pin = [...state.pin, ...d.split('')].slice(0, 4)
        const next = { ...state, pin }
        return pin.length === 4 ? executeTransfer(next) : next
      }
      if (state.screen !== 'transfer') return state
      if (field === 'payee') return { ...state, form: { ...state.form, payee: normalizePayee(value, state) }, formError: '' }
      if (field === 'amount') {
        const amt = parseAmount(value)
        return {
          ...state,
          form: { ...state.form, amount: amt },
          formError: amt ? '' : 'I could not read that amount — say it as a number, like "five hundred".',
        }
      }
      if (field === 'note') return { ...state, form: { ...state.form, note: String(value).slice(0, 80) } }
      return state
    }

    case 'TAP': {
      const t = action.target
      switch (state.screen) {
        case 'welcome':
          if (t === 'btn_start') return { ...state, screen: 'login' }
          break
        case 'login':
          if (t === 'btn_login')
            return { ...state, loggedIn: true, screen: 'home', lastTx: state.lastTx }
          break
        case 'home':
          if (t === 'btn_transfer') return { ...state, screen: 'transfer', formError: '' }
          if (t === 'btn_bills') return { ...state, screen: 'bills' }
          break
        case 'transfer': {
          if (t === 'btn_back') return { ...state, screen: 'home' }
          if (t === 'btn_continue') {
            const { payee, amount } = state.form
            if (!payee || !amount) {
              return {
                ...state,
                formError: !payee
                  ? 'Who should I send it to?'
                  : 'How much should I send?',
              }
            }
            return {
              ...state,
              pendingTx: {
                id: Date.now(),
                fromId: 'sav',
                from: 'Savings ****4821',
                payee: state.form.payee,
                amount: state.form.amount,
                note: state.form.note,
                ts: new Date().toISOString(),
              },
              screen: 'confirm',
            }
          }
          break
        }
        case 'confirm':
          if (t === 'btn_confirm') return { ...state, pin: [], screen: 'pin' }
          if (t === 'btn_cancel')
            return { ...state, pendingTx: null, form: { payee: '', amount: null, note: '' }, screen: 'home' }
          break
        case 'pin':
          if (t === 'btn_back_confirm') return { ...state, pin: [], screen: 'confirm' }
          break
        case 'receipt':
          if (t === 'btn_done') return { ...state, screen: 'home' }
          break
        case 'bills':
          if (t.startsWith('btn_pay_')) {
            const bill = state.bills.find((b) => b.id === t.slice('btn_pay_'.length))
            if (bill && !state.paidBills[bill.id]) {
              return {
                ...state,
                pendingTx: {
                  id: Date.now(),
                  fromId: 'sav',
                  from: 'Savings ****4821',
                  payee: bill.name,
                  amount: bill.amount,
                  note: 'Bill payment',
                  billId: bill.id,
                  ts: new Date().toISOString(),
                },
                screen: 'confirm',
              }
            }
          }
          if (t === 'btn_back') return { ...state, screen: 'home' }
          break
        default:
          break
      }
      return state
    }

    case 'CLEAR_FORM':
      return { ...state, form: { payee: '', amount: null, note: '' }, formError: '' }

    case 'RESET':
      return { ...initialState(), loggedIn: true, user: state.user, accounts: state.accounts, bills: state.bills, paidBills: state.paidBills, lastTx: state.lastTx, txCount: state.txCount }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Screen descriptor: the machine-readable view of the UI the agent sees.
// ---------------------------------------------------------------------------

export function describeState(state) {
  // App-wide snapshot so lookups (balance etc.) work from any screen.
  const base = {
    screen: state.screen,
    user: state.user.name,
    app: {
      accounts: state.accounts.map((a) => ({ name: a.name, number: a.number, balance: a.balance })),
      unpaidBills: state.bills.filter((b) => !state.paidBills[b.id]).map((b) => ({ name: b.name, due: b.due, amount: b.amount })),
      lastTx: state.lastTx ? { to: state.lastTx.payee, amount: state.lastTx.amount, ref: state.lastTx.ref } : null,
    },
  }
  switch (state.screen) {
    case 'welcome':
      return { ...base, title: 'Welcome', buttons: [{ id: 'btn_start', label: 'Start' }] }
    case 'login':
      return { ...base, title: 'Login', buttons: [{ id: 'btn_login', label: 'Log in' }] }
    case 'home':
      return {
        ...base,
        title: 'Accounts',
        accounts: state.accounts.map((a) => ({ name: a.name, number: a.number, balance: a.balance })),
        lastTx: state.lastTx
          ? { to: state.lastTx.payee, amount: state.lastTx.amount, ref: state.lastTx.ref }
          : null,
        buttons: [
          { id: 'btn_transfer', label: 'Transfer' },
          { id: 'btn_bills', label: 'Pay bills' },
        ],
      }
    case 'transfer':
      return {
        ...base,
        title: 'Transfer money',
        fields: [
          { id: 'payee', label: 'To', value: state.form.payee, type: 'payee' },
          { id: 'amount', label: 'Amount', value: state.form.amount, type: 'rupees' },
          { id: 'note', label: 'Note (optional)', value: state.form.note, type: 'text' },
        ],
        buttons: [
          { id: 'btn_continue', label: 'Continue' },
          { id: 'btn_back', label: 'Back' },
        ],
        knownPayees: state.payees.map((p) => p.name),
        from: 'Savings ****4821 (balance ' + state.accounts[0].balance + ')',
      }
    case 'confirm':
      return {
        ...base,
        title: 'Confirm transfer',
        pending: state.pendingTx,
        buttons: [
          { id: 'btn_confirm', label: 'Confirm' },
          { id: 'btn_cancel', label: 'Cancel' },
        ],
        note: 'After confirm the user must speak their 4-digit PIN.',
      }
    case 'pin':
      return {
        ...base,
        title: 'Enter PIN',
        fields: [{ id: 'pin', label: '4-digit PIN (spoken digit by digit)', value: state.pin.join(''), type: 'digits' }],
        buttons: [{ id: 'btn_back_confirm', label: 'Back' }],
        note: 'When 4 digits are filled the payment executes and the receipt appears.',
      }
    case 'receipt':
      return {
        ...base,
        title: 'Receipt',
        transaction: state.lastTx,
        buttons: [{ id: 'btn_done', label: 'Done' }],
      }
    case 'bills':
      return {
        ...base,
        title: 'Pay bills',
        bills: state.bills.map((b) => ({
          id: b.id, name: b.name, due: b.due, amount: b.amount,
          paid: !!state.paidBills[b.id], button: 'btn_pay_' + b.id,
        })),
        buttons: [{ id: 'btn_back', label: 'Back' }],
      }
    case 'help':
      return { ...base, title: 'What you can say', buttons: [] }
    default:
      return base
  }
}
