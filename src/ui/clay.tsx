import type { ReactNode } from 'react'

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-3xl bg-[#1f2128] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.05),inset_0_-2px_6px_rgba(0,0,0,.35),0_10px_24px_rgba(0,0,0,.35)] ${className}`}
    >
      {children}
    </section>
  )
}

export function ClayButton(props: {
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'danger' | 'default'
  className?: string
  title?: string
  children: ReactNode
}) {
  const color =
    props.variant === 'primary'
      ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-emerald-950'
      : props.variant === 'danger'
        ? 'bg-gradient-to-b from-rose-400 to-rose-600 text-rose-950'
        : 'bg-[#2a2d36] text-zinc-100'
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition active:translate-y-px disabled:opacity-40 ${color} shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_6px_14px_rgba(0,0,0,.4)] ${props.className ?? ''}`}
    >
      {props.children}
    </button>
  )
}
