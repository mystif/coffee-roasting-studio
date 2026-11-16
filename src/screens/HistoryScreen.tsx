import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../storage/db'
import { fmtDate, fmtKg, roastSummary } from '../storage/roastQueries'
import { fmtTime } from '../ui/LiveChart'
import { Page, go, inputCls } from '../ui/nav'

export function HistoryScreen({ coffeeId }: { coffeeId: string | null }) {
  const roasts = useLiveQuery(() => db.roasts.orderBy('roastDate').reverse().toArray(), [])
  const coffees = useLiveQuery(() => db.coffees.orderBy('name').toArray(), [])
  const [q, setQ] = useState('')
  const filter = coffeeId ?? ''

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (roasts ?? []).filter(
      (r) => (!filter || r.coffeeId === filter) && (!needle || `${r.coffee} ${r.notes}`.toLowerCase().includes(needle)),
    )
  }, [roasts, filter, q])

  return (
    <Page
      title="Historie pražení"
      actions={
        <>
          <select
            value={filter}
            onChange={(e) => go(e.target.value ? `#/historie?kava=${e.target.value}` : '#/historie')}
            className={inputCls}
          >
            <option value="">Všechny kávy</option>
            {coffees?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat v názvu a poznámkách" className={`${inputCls} w-64`} />
        </>
      }
    >
      {roasts && roasts.length === 0 && (
        <p className="text-zinc-400">Zatím žádné uložené pražení. Každé pražení se sem uloží automaticky po Finish.</p>
      )}
      {rows.length > 0 && (
        <table className="w-full border-separate border-spacing-y-1.5 text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 font-normal">Datum</th>
              <th className="px-3 font-normal">Káva</th>
              <th className="px-3 text-right font-normal">Zelená</th>
              <th className="px-3 text-right font-normal">Ztráta</th>
              <th className="px-3 text-right font-normal">Čas</th>
              <th className="px-3 text-right font-normal">FCs</th>
              <th className="px-3 text-right font-normal">Drop BT</th>
              <th className="px-3 text-right font-normal">DTR</th>
              <th className="px-3 text-right font-normal">Hodn.</th>
              <th className="px-3 text-right font-normal">Záloha</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = roastSummary(r)
              return (
                <tr
                  key={r.id}
                  onClick={() => go(`#/historie/${r.id}`)}
                  className="cursor-pointer bg-[#1f2128] tabular-nums shadow-[0_4px_12px_rgba(0,0,0,.25)] transition hover:bg-[#262a33] [&>td:first-child]:rounded-l-2xl [&>td:last-child]:rounded-r-2xl [&>td]:px-3 [&>td]:py-2.5"
                >
                  <td className="text-zinc-300">{fmtDate(r.roastDate)}</td>
                  <td className="font-semibold">
                    {r.coffee || 'Bez názvu'}
                    {r.source === 'import' && <span className="ml-2 text-xs font-normal text-zinc-500">Artisan</span>}
                  </td>
                  <td className="text-right">{fmtKg(r.greenWeightG)}</td>
                  <td className="text-right">{r.lossPct == null ? '—' : `${r.lossPct.toFixed(1)} %`}</td>
                  <td className="text-right">{s.total == null ? '—' : fmtTime(s.total)}</td>
                  <td className="text-right">{s.fcsTime == null ? '—' : `${fmtTime(s.fcsTime)} · ${s.fcsBT?.toFixed(1)}°`}</td>
                  <td className="text-right">{s.dropBT == null ? '—' : `${s.dropBT.toFixed(1)}°`}</td>
                  <td className="text-right">{s.dtr == null ? '—' : `${s.dtr.toFixed(1)} %`}</td>
                  <td className="text-right">{r.rating ?? '—'}</td>
                  <td className="text-right">{r.backedUp ? <span className="text-emerald-400">✓</span> : <span className="text-amber-300">čeká</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {roasts && roasts.length > 0 && rows.length === 0 && <p className="text-zinc-400">Filtru neodpovídá žádné pražení.</p>}
    </Page>
  )
}
