import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRoastState } from '../live/runtime'
import { BackupChip } from './storageUi'
import { DisplayToggle, ThemeToggle } from './theme'
import roastIcon from './icons/nav-roast.svg?raw'
import historyIcon from './icons/nav-history.svg?raw'
import analysisIcon from './icons/nav-analysis.svg?raw'
import profilesIcon from './icons/nav-profiles.svg?raw'
import coffeesIcon from './icons/nav-coffees.svg?raw'
import diagnosticsIcon from './icons/nav-diagnostics.svg?raw'

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


const TABS: { href: string; label: string; icon: string; match: Route['name'][] }[] = [
  { href: '#/', label: 'Pražení', icon: roastIcon, match: ['live'] },
  { href: '#/historie', label: 'Historie', icon: historyIcon, match: ['history', 'roast'] },
  { href: '#/analyza', label: 'Analýza', icon: analysisIcon, match: ['analysis'] },
  { href: '#/profily', label: 'Profily', icon: profilesIcon, match: ['profiles'] },
  { href: '#/kavy', label: 'Kávy', icon: coffeesIcon, match: ['coffees'] },
]
const DIAGNOSTICS = { href: '#/diagnostika', label: 'Diagnostika připojení', icon: diagnosticsIcon, match: ['diagnostics'] as Route['name'][] }

/** Our own static icon files (stroke = currentColor), sized by the parent. */
function Icon({ svg }: { svg: string }) {
  return <span aria-hidden className="block h-[1.375rem] w-[1.375rem] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
}

/** Page navigation as a narrow icon bar on the right edge of the window (name on hover). */
export function Sidebar() {
  const route = useRoute()
  const roast = useRoastState()
  const item = (t: (typeof TABS)[number]) => {
    const active = t.match.includes(route.name)
    return (
      <a
        key={t.href}
        href={t.href}
        title={t.label}
        aria-label={t.label}
        aria-current={active ? 'page' : undefined}
        className={`group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
          active ? 'bg-[var(--c-active)] text-zinc-100' : 'text-zinc-500 hover:bg-[var(--c-raised)] hover:text-zinc-100'
        }`}
      >
        {active && <span className="absolute -right-1.5 top-2 h-6 w-[3px] rounded-full bg-[var(--c-accent)]" />}
        <Icon svg={t.icon} />
        {t.href === '#/' && roast.status === 'roasting' && !active && (
          <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-rose-400" title="Pražení běží" />
        )}
        <span className="pointer-events-none absolute right-full mr-2 hidden whitespace-nowrap rounded-md border border-[var(--c-border)] bg-[var(--c-raised)] px-2 py-1 text-xs font-semibold text-zinc-100 shadow-[0_8px_24px_var(--sh)] group-hover:block">
          {t.label}
        </span>
      </a>
    )
  }
  return (
    <nav className="flex w-[3.25rem] shrink-0 flex-col items-center gap-1 border-l border-[var(--c-border)] bg-[var(--c-surface)] py-2.5">
      <img src="./icon.svg" alt="Roasting Studio" title="Coffee Roasting Studio" className="mb-2 h-7 w-7" />
      {TABS.map(item)}
      <div className="mt-auto">{item(DIAGNOSTICS)}</div>
    </nav>
  )
}

/** Frame for the non-live screens (scrollable content). */
export function Page({ title, count, actions, children }: { title: string; count?: number | null; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col text-zinc-100">
      <header className="flex items-center gap-3 px-4 pt-4">
        <span className="font-brand mr-1 text-lg">Roasting Studio</span>
        <div className="ml-auto flex items-center gap-2">
          <BackupChip />
          <DisplayToggle />
          <ThemeToggle />
        </div>
      </header>
      <div className="flex items-center justify-between px-6 pb-2 pt-5">
        <h1 className="font-brand text-2xl">
          {title}
          {count != null && <span className="ml-2 text-zinc-500">· {count}</span>}
        </h1>
        <div className="flex gap-2">{actions}</div>
      </div>
      <main className="min-h-0 flex-1 overflow-auto px-6 pb-6">{children}</main>
    </div>
  )
}

export const inputCls =
  'rounded-lg bg-[var(--c-bg)] px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-[var(--c-accent-ring)]'

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
