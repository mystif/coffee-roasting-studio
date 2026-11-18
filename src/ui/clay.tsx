import type { ReactNode } from 'react'

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl bg-[var(--c-surface)] p-5 border border-[var(--c-border)] ${className}`}
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
  /** compact variant for the header */
  size?: 'sm'
  children: ReactNode
}) {
  const color =
    props.variant === 'primary'
      ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
      : props.variant === 'danger'
        ? 'bg-rose-500 hover:bg-rose-400 text-white'
        : 'border border-[var(--c-border)] bg-[var(--c-raised)] text-zinc-100 hover:bg-[var(--c-active)]'
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={`${props.size === 'sm' ? 'rounded-md px-3 py-1 text-xs' : 'rounded-lg px-4 py-2 text-sm'} font-medium transition-colors disabled:opacity-40 ${color} ${props.className ?? ''}`}
    >
      {props.children}
    </button>
  )
}
