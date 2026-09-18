import React from 'react'
import { money, words } from '../lib/state'
import {
  WelcomeScreen, LoginScreen, HomeScreen, TransferScreen, ConfirmScreen,
  PinScreen, ReceiptScreen, BillsScreen, HelpScreen,
} from './Screens'

export default function Phone({ state, highlight, dispatch }) {
  const hl = (id) =>
    highlight && ((highlight.kind === 'tap' && highlight.id === id) ||
      (highlight.kind === 'fill' && highlight.id === id))
      ? highlight.kind === 'tap' ? 'glow' : 'just-filled'
      : ''

  const screens = {
    welcome: <WelcomeScreen dispatch={dispatch} hl={hl} />,
    login: <LoginScreen state={state} dispatch={dispatch} hl={hl} />,
    home: <HomeScreen state={state} dispatch={dispatch} hl={hl} />,
    transfer: <TransferScreen state={state} dispatch={dispatch} hl={hl} />,
    confirm: <ConfirmScreen state={state} dispatch={dispatch} hl={hl} />,
    pin: <PinScreen state={state} dispatch={dispatch} hl={hl} />,
    receipt: <ReceiptScreen state={state} dispatch={dispatch} hl={hl} />,
    bills: <BillsScreen state={state} dispatch={dispatch} hl={hl} />,
    help: <HelpScreen dispatch={dispatch} />,
  }

  return (
    <section className="phone-wrap" aria-label="Phone running the VoiceBank app">
      <div className="phone">
        <div className="notch" />
        <div className="statusbar">
          <span>9:41</span>
          <span className="carrier">VoiceBank</span>
          <span>▮▮▮ ⚡</span>
        </div>
        <div className="app-header">
          <span className="app-logo">🎙️ VoiceBank</span>
          {state.loggedIn && <span className="app-user">{state.user.name}</span>}
        </div>
        <div className="screen" key={state.screen}>
          {screens[state.screen] || screens.welcome}
        </div>
        <div className="homebar" />
      </div>
      <p className="phone-caption">
        Every highlight you see is the agent acting — the same taps and typing a human would do.
      </p>
    </section>
  )
}

export { money, words }
