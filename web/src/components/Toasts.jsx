import React from 'react'

export default function Toasts({ toasts }) {
  if (!toasts.length) return null
  return (
    <div className="toasts" role="status">
      {toasts.map((t) => (
        <div key={t.id} className="toast">{t.msg}</div>
      ))}
    </div>
  )
}
