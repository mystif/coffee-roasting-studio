import { useEffect, useState, type ReactNode } from 'react'
import { useRoastState } from '../live/runtime'
import { BackupChip } from './storageUi'

export type Route =
  | { name: 'live' }
  | { name: 'history'; coffeeId: string | null }
  | { name: 'roast'; id: string }
  | { name: 'coffees' }
  | { name: 'profiles' }
  | { name: 'diagnostics' }

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const parts = path.split('/').filter(Boolean)
  const q = new URLSearchParams(query)
  if (parts[0] === 'historie' && parts[1]) return { name: 'roast', id: decodeURIComponent(parts[1]) }
  if (parts[0] === 'historie') return { name: 'history', coffeeId: q.get('kava') }
  if (parts[0] === 'kavy') return { name: 'coffees' }
  if (parts[0] === 'profily') return { name: 'profiles' }
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
  { href: '#/profily', label: 'Profily', match: ['profiles'] },
  { href: '#/kavy', label: 'Kávy', match: ['coffees'] },
]

export function NavTabs() {
  const route = useRoute()
  const roast = useRoastState()
  return (
    <nav className="flex items-center gap-1 rounded-2xl bg-[#16171d] p-1 shadow-[inset_0_2px_6px_rgba(0,0,0,.45)]">
      {TABS.map((t) => {
        const active = t.match.includes(route.name)
        return (
          <a
            key={t.href}
            href={t.href}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-semibold transition ${
              active ? 'bg-[#2a2d36] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_4px_10px_rgba(0,0,0,.35)]' : 'text-zinc-400 hover:text-zinc-100'
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
    <div className="flex h-screen flex-col bg-[#16171d] text-zinc-100">
      <header className="flex items-center gap-3 px-4 pt-4">
        <span className="mr-1 text-lg font-semibold tracking-tight">Roasting Studio</span>
        <NavTabs />
        <div className="ml-auto flex items-center gap-2">
          <BackupChip />
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
  'rounded-xl bg-[#16171d] px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-400'
