import type { ReactNode } from 'react'

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`card rounded-xl bg-[var(--c-surface)] p-5 border border-[var(--c-border)] ${className}`}
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
      ? 'btn-gloss bg-emerald-600 text-white hover:bg-emerald-500'
      : props.variant === 'danger'
        ? 'btn-gloss bg-rose-600 hover:bg-rose-500 text-white'
        : 'border border-[var(--c-border)] bg-[var(--c-raised)] text-zinc-100 hover:bg-[var(--c-active)]'
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={`${props.size === 'sm' ? 'rounded-lg px-3 py-1 text-xs' : 'rounded-lg px-4 py-2 text-sm'} font-medium transition-colors disabled:opacity-40 ${color} ${props.className ?? ''}`}
    >
      {props.children}
    </button>
  )
}
