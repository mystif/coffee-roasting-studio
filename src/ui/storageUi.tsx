import { roast, session } from '../live/runtime'
import { askConfirm } from './dialog'
import { backupState, chooseBackupFolder, grantBackupPermission } from '../storage/backup'
import { persistState } from '../storage/persistence'
import { applyUpdate, pwaState } from '../pwa'

const chip =
  'flex items-center gap-1.5 rounded-full bg-[var(--c-chip)] px-2.5 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_6px_16px_var(--sh)]'

/** Header chip: backup folder state, one click fixes what is missing. */
export function BackupChip() {
  const b = backupState.use()
  const run = (fn: () => Promise<void>) => () => void fn().catch((e) => backupState.set({ error: String(e) }))
  if (b.status === 'unsupported') return null
  if (b.status === 'ok')
    return (
      <button className={chip} onClick={run(chooseBackupFolder)} title="Každé uložené pražení se zapíše jako soubor do této složky. Kliknutím změníš složku.">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="max-w-32 truncate">Záloha: {b.folder}</span>
        {b.pending > 0 && <span className="text-amber-300">({b.pending} čeká)</span>}
      </button>
    )
  if (b.status === 'needs-permission')
    return (
      <button className={`${chip} ring-1 ring-amber-400/60`} onClick={run(grantBackupPermission)} title="Chrome po restartu znovu žádá o povolení zápisu do složky">
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        Povolit zálohu{b.pending > 0 && ` (${b.pending})`}
      </button>
    )
  return (
    <button className={`${chip} ring-1 ring-amber-400/60`} onClick={run(chooseBackupFolder)} title={b.error || 'Vyber složku (ideálně iCloud Drive nebo Dropbox)'}>
      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
      {b.status === 'error' ? 'Záloha selhala' : 'Nastavit zálohu'}
      {b.pending > 0 && <span className="text-amber-300">({b.pending})</span>}
    </button>
  )
}

/** Shown after a reload restored a roast in progress. */
export function RestoredBanner() {
  const p = persistState.use()
  const r = roast.getSnapshot()
  if (!p.restoredFrom || r.status !== 'roasting') return null
  const at = new Date(p.restoredFrom).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return (
    <div className="flex items-center justify-between rounded-2xl bg-sky-400/15 px-4 py-1.5 text-sm text-sky-100 ring-1 ring-sky-400/40">
      <span>
        <b>Rozpracované pražení obnoveno</b> (poslední uložení {at}). Připoj pražičku – záznam pokračuje, výpadek bude v grafu jako mezera.
      </span>
      <button
        className="ml-4 rounded-xl px-3 py-1 text-xs text-sky-200 hover:bg-white/10"
        onClick={async () => {
          if (!(await askConfirm('Zahodit rozpracované pražení?', { message: 'Obnovená data se smažou.', okLabel: 'Zahodit', danger: true }))) return
          roast.newRoast()
          session.clear()
        }}
      >
        Zahodit
      </button>
    </div>
  )
}

export function PersistError() {
  const p = persistState.use()
  if (!p.error) return null
  return (
    <div className="rounded-2xl bg-rose-500/15 px-4 py-1.5 text-sm text-rose-200 ring-1 ring-rose-400/40">
      Chyba ukládání: {p.error}. Neukončuj prohlížeč, dokud se pražení neuloží.
    </div>
  )
}

/** Save state line for the summary panel. */
export function SaveStatus({ source, savedId }: { source: string | null; savedId: string | null }) {
  const b = backupState.use()
  if (source === 'replay') return <p className="text-xs text-amber-300">Přehraný záznam se neukládá.</p>
  if (!savedId) return <p className="text-xs text-zinc-400">Ukládám…</p>
  return (
    <p className="text-xs text-emerald-300">
      ✓ Uloženo v aplikaci
      {b.status === 'ok' ? (b.pending ? ' · záloha čeká' : ` · zálohováno do „${b.folder}“`) : ' · záloha není nastavená'}
    </p>
  )
}

/** New version available – offered only when no roast is being recorded. */
export function UpdateToast({ roasting }: { roasting: boolean }) {
  const p = pwaState.use()
  if (!p.updateReady || roasting) return null
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-2xl bg-[var(--c-raised2)] px-5 py-3 text-sm shadow-[0_12px_30px_var(--sh)] ring-1 ring-white/10">
      Je připravená nová verze aplikace.
      <button className="rounded-xl bg-sky-500 px-3 py-1.5 font-semibold text-sky-950" onClick={applyUpdate}>
        Aktualizovat
      </button>
    </div>
  )
}
