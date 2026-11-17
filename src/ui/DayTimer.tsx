import { useLiveQuery } from 'dexie-react-hooks'
import { askConfirm } from './dialog'
import { useEffect, useState } from 'react'
import { GAS_KG_PER_HOUR, fmtDuration, gasKg } from '../domain/daySession'
import { dayState, startDay, stopDay } from '../live/dayState'
import { db } from '../storage/db'

const kg = (x: number) => `${x.toFixed(2).replace('.', ',')} kg`
const dávky = (n: number) => (n === 1 ? '1 dávka' : n >= 2 && n <= 4 ? `${n} dávky` : `${n} dávek`)

/** Total time of the roasting day and estimated gas use (shown in the bottom bar). */
export function DayTimer({ batchSec = null }: { batchSec?: number | null } = {}) {
  const d = dayState.use()
  const [now, setNow] = useState(Date.now())
  const running = d.startedAt !== null && d.stoppedAt === null
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])
  const roasts = useLiveQuery(
    () => (d.startedAt ? db.roasts.where('roastDate').aboveOrEqual(new Date(d.startedAt).toISOString()).count() : 0),
    [d.startedAt, d.stoppedAt],
  )

  const box = 'ml-auto flex items-center gap-3 rounded-2xl bg-[var(--c-bg)] px-3 py-1'
  const btn = 'rounded-xl px-3 py-1.5 text-xs font-bold uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_3px_8px_var(--sh)] active:translate-y-px'

  if (d.startedAt === null) {
    return (
      <div className={box} title="Den se spustí sám, jakmile začne stoupat ET (zapálený hořák)">
        <span className="whitespace-nowrap text-xs text-zinc-400">
          Den pražení
          <br />
          <span className="text-zinc-500">čeká na nahřívání (ET)</span>
        </span>
        <button className={`${btn} bg-[var(--c-raised)] text-zinc-200`} onClick={() => startDay(Date.now(), 'manual')}>
          Start
        </button>
      </div>
    )
  }

  const end = d.stoppedAt ?? now
  const ms = end - d.startedAt
  const since = new Date(d.startedAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
  const title = `Od ${since} (${d.reason === 'et' ? 'start podle náběhu ET' : d.reason === 'hot' ? 'pražička už byla horká při připojení' : 'spuštěno ručně'}). Plyn: odhad ${GAS_KG_PER_HOUR} kg/h provozu.`
  return (
    <div className={box} title={title}>
      <div className="leading-tight">
        <div className="text-[11px] uppercase tracking-wide text-zinc-500">{d.stoppedAt ? 'Den ukončen' : `Den od ${since}`}</div>
        <div className="text-xl font-semibold tabular-nums">{fmtDuration(ms)}</div>
      </div>
      <div className="leading-tight">
        <div className="text-[11px] uppercase tracking-wide text-zinc-500">Plyn den ~</div>
        <div className="whitespace-nowrap text-xl font-semibold tabular-nums text-orange-300">{kg(gasKg(ms))}</div>
      </div>
      {batchSec !== null && (
        <div className="leading-tight" title="Spotřeba plynu této dávky (od Start Roasting) při 0,5 kg/h">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">dávka ~</div>
          <div className="whitespace-nowrap text-xl font-semibold tabular-nums text-orange-300">{kg(gasKg(batchSec * 1000))}</div>
        </div>
      )}
      <div className="whitespace-nowrap text-xs text-zinc-400">{dávky(roasts ?? 0)}</div>
      {d.stoppedAt ? (
        <button className={`${btn} bg-[var(--c-raised)] text-zinc-200`} onClick={() => startDay(Date.now(), 'manual')} title="Začít nový den ručně (jinak se spustí sám při nahřívání)">
          Nový den
        </button>
      ) : (
        <button
          className={`${btn} bg-gradient-to-b from-rose-400 to-rose-600 text-rose-950`}
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
