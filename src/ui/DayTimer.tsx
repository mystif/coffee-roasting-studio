import { useLiveQuery } from 'dexie-react-hooks'
import { askConfirm } from './dialog'
import { useEffect, useState } from 'react'
import { BOTTLE_KG, GAS_KG_PER_HOUR, bottleLevel, fmtDuration, gasKg, msSinceReset } from '../domain/daySession'
import { dayState, resetBottle, startDay, stopDay } from '../live/dayState'
import { db } from '../storage/db'

const kg = (x: number) => `${x.toFixed(2).replace('.', ',')} kg`
const dávky = (n: number) => (n === 1 ? '1 dávka' : n >= 2 && n <= 4 ? `${n} dávky` : `${n} dávek`)

const bottleTitle = (since: number | null | undefined) =>
  `Celkem od výměny láhve${since ? ` (${new Date(since).toLocaleDateString('cs-CZ')} ${new Date(since).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })})` : ''} – odhad ${GAS_KG_PER_HOUR} kg/h provozu, láhev ${BOTTLE_KG} kg (zelená < 6 kg, žlutá 6–7 kg, červená od 7 kg)`

const LEVEL_COLOR = { ok: 'text-emerald-400', low: 'text-amber-400', empty: 'text-rose-400' } as const

/** Totals since the last gas-bottle change, with a reset for a new bottle. */
function Bottle({ ms, since }: { ms: number; since: number | null | undefined }) {
  return (
    <span className="flex items-center gap-1 text-[0.625rem] text-zinc-500" title={`${bottleTitle(since)} · provoz ${fmtDuration(ms)}`}>
      láhev{' '}
      <b className={`tabular-nums ${LEVEL_COLOR[bottleLevel(gasKg(ms))]}`}>{kg(gasKg(ms)).replace(' kg', '')}</b>/{BOTTLE_KG}
      <button
        className="rounded-md px-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
        title="Vyměnil jsem láhev – vynulovat láhev i den pražení"
        onClick={async () => {
          if (
            await askConfirm('Nová láhev plynu?', {
              message: `Vynuluje všechny ukazatele: láhev (${fmtDuration(ms)}, ~${kg(gasKg(ms))}) i den pražení – čas, plyn a počet dávek začnou od nuly.`,
              okLabel: 'Vynulovat vše',
            })
          )
            void resetBottle()
        }}
      >
        ⟲
      </button>
    </span>
  )
}

/**
 * Roasting day as a small chip in the header: day time, estimated gas of the day and the gas
 * bottle totals; Start / Stop of the day. Batch gas and the number of batches are in the tooltip.
 */
export function DayTimer({ batchSec = null }: { batchSec?: number | null } = {}) {
  const d = dayState.use()
  const [now, setNow] = useState(Date.now())
  const running = d.startedAt !== null && d.stoppedAt === null
  const bottleMs = msSinceReset(d.bottleResetAt ?? null, d.history, running ? { startedAt: d.startedAt! } : null, now)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])
  const roasts = useLiveQuery(
    () => (d.startedAt ? db.roasts.where('roastDate').aboveOrEqual(new Date(d.startedAt).toISOString()).count() : 0),
    [d.startedAt, d.stoppedAt],
  )

  const chip = 'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-[var(--c-border)] bg-[var(--c-chip)] py-0.5 pl-2.5 pr-1 text-xs text-zinc-400'
  const btn = 'rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide'

  if (d.startedAt === null)
    return (
      <div className={chip} title="Den se spustí sám, jakmile začne stoupat ET (zapálený hořák)">
        den čeká na nahřívání
        <Bottle ms={bottleMs} since={d.bottleResetAt} />
        <button className={`${btn} bg-[var(--c-raised)] text-zinc-200 hover:bg-[var(--c-active)]`} onClick={() => startDay(Date.now(), 'manual')}>
          Start
        </button>
      </div>
    )

  const ms = (d.stoppedAt ?? now) - d.startedAt
  const since = new Date(d.startedAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
  const reason = d.reason === 'et' ? 'start podle náběhu ET' : d.reason === 'hot' ? 'pražička už byla horká při připojení' : 'spuštěno ručně'
  const title = [
    `Den pražení od ${since} (${reason}), ${d.stoppedAt ? 'ukončen, ' : ''}${fmtDuration(ms)}`,
    `${dávky(roasts ?? 0)}`,
    batchSec !== null ? `plyn této dávky ~${kg(gasKg(batchSec * 1000))}` : null,
    `odhad ${GAS_KG_PER_HOUR} kg/h provozu`,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className={chip} title={title}>
      <span>
        {d.stoppedAt ? 'den ✓' : 'den'} <b className="tabular-nums text-zinc-100">{fmtDuration(ms).replace(/:\d\d$/, '')}</b>
      </span>
      <b className="tabular-nums text-orange-300">{kg(gasKg(ms))}</b>
      <Bottle ms={bottleMs} since={d.bottleResetAt} />
      {d.stoppedAt ? (
        <button className={`${btn} bg-[var(--c-raised)] text-zinc-200 hover:bg-[var(--c-active)]`} onClick={() => startDay(Date.now(), 'manual')} title="Začít nový den ručně (jinak se spustí sám při nahřívání)">
          Nový den
        </button>
      ) : (
        <button
          className={`${btn} bg-rose-500 text-white hover:bg-rose-400`}
          onClick={async () => {
            if (await askConfirm('Ukončit den pražení?', { message: `${fmtDuration(ms)} · plyn ~${kg(gasKg(ms))} · ${dávky(roasts ?? 0)}`, okLabel: 'Ukončit den', danger: true }))
              void stopDay()
          }}
        >
          Stop
        </button>
      )}
    </div>
  )
}
