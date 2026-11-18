import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRoastState } from '../live/runtime'
import { BackupChip } from './storageUi'
import { DisplayToggle, ThemeToggle } from './theme'

export type Route =
  | { name: 'live' }
  | { name: 'history'; coffeeId: string | null }
  | { name: 'roast'; id: string }
  | { name: 'coffees' }
  | { name: 'profiles' }
  | { name: 'analysis'; ids: string[] }
  | { name: 'diagnostics' }

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const parts = path.split('/').filter(Boolean)
  const q = new URLSearchParams(query)
  if (parts[0] === 'historie' && parts[1]) return { name: 'roast', id: decodeURIComponent(parts[1]) }
  if (parts[0] === 'historie') return { name: 'history', coffeeId: q.get('kava') }
  if (parts[0] === 'kavy') return { name: 'coffees' }
  if (parts[0] === 'profily') return { name: 'profiles' }
  if (parts[0] === 'analyza') return { name: 'analysis', ids: (q.get('ids') ?? '').split(',').filter(Boolean) }
  if (parts[0] === 'diagnostika') return { name: 'diagnostics' }
  return { name: 'live' }
}

export const go = (hash: string) => {
  location.hash = hash
}

export function useRoute(): Route {
  const [r, setR] = useState(() => parseRoute(location.hash))
  useEffect(() => {
    const on = () => setR(parseRoute(location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}

const TABS: { href: string; label: string; match: Route['name'][] }[] = [
  { href: '#/', label: 'Pražení', match: ['live'] },
  { href: '#/historie', label: 'Historie', match: ['history', 'roast'] },
  { href: '#/analyza', label: 'Analýza', match: ['analysis'] },
  { href: '#/profily', label: 'Profily', match: ['profiles'] },
  { href: '#/kavy', label: 'Kávy', match: ['coffees'] },
]

export function NavTabs() {
  const route = useRoute()
  const roast = useRoastState()
  return (
    <nav className="flex items-center gap-0.5 rounded-xl bg-[var(--c-bg)] p-0.5 border border-[var(--c-border)]">
      {TABS.map((t) => {
        const active = t.match.includes(route.name)
        return (
          <a
            key={t.href}
            href={t.href}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
 active ? 'bg-[var(--c-raised)] text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'
 }`}
          >
            {t.label}
            {t.href === '#/' && roast.status === 'roasting' && !active && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" title="Pražení běží" />
            )}
          </a>
        )
      })}
    </nav>
  )
}

/** Frame for the non-live screens (scrollable content). */
export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-[var(--c-bg)] text-zinc-100">
      <header className="flex items-center gap-3 px-4 pt-4">
        <span className="mr-1 text-lg font-semibold tracking-tight">Roasting Studio</span>
        <NavTabs />
        <div className="ml-auto flex items-center gap-2">
          <BackupChip />
          <DisplayToggle />
          <ThemeToggle />
          <a href="#/diagnostika" className="px-2 text-sm text-zinc-500 hover:text-zinc-200">
            Diagnostika
          </a>
        </div>
      </header>
      <div className="flex items-center justify-between px-6 pb-2 pt-5">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="flex gap-2">{actions}</div>
      </div>
      <main className="min-h-0 flex-1 overflow-auto px-6 pb-6">{children}</main>
    </div>
  )
}

export const inputCls =
  'rounded-lg bg-[var(--c-bg)] px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-sky-400/40'

/** Small "⋯" menu for rarely used actions (keeps the roasting header uncluttered). */
export function MoreMenu({ items }: { items: { label: string; hint?: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Další akce"
        className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--c-chip)] text-base text-zinc-300 border border-[var(--c-border)] hover:text-zinc-100"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-40 w-64 rounded-lg bg-[var(--c-raised)] p-1.5 border border-[var(--c-border)] shadow-[0_16px_48px_var(--sh)] ring-1 ring-white/5">
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => {
                setOpen(false)
                it.onClick()
              }}
              className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--c-raised2)]"
            >
              <span className="font-semibold">{it.label}</span>
              {it.hint && <span className="block text-xs text-zinc-400">{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
