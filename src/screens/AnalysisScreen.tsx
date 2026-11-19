import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { alignCurves, metrics, summarize, type RoastMetrics } from '../domain/compare'
import { PHASE_TEXT } from '../domain/phases'
import { db } from '../storage/db'
import { fmtDate } from '../storage/roastQueries'
import type { RoastRecord } from '../storage/roastRecord'
import { Panel } from '../ui/clay'
import { COMPARE_COLORS, CompareChart } from '../ui/CompareChart'
import { fmtTime } from '../ui/LiveChart'
import { Page, go, inputCls } from '../ui/nav'

const t = (x: number | null) => (x == null ? '—' : fmtTime(x))
const n1 = (x: number | null, unit = '') => (x == null ? '—' : `${x.toFixed(1)}${unit}`)

export function AnalysisScreen({ ids }: { ids: string[] }) {
  const all = useLiveQuery(() => db.roasts.orderBy('roastDate').reverse().toArray(), [])
  const selected = useMemo(() => ids.map((id) => all?.find((r) => r.id === id)).filter((r): r is RoastRecord => !!r), [all, ids])
  const setIds = (next: string[]) => go(next.length ? `#/analyza?ids=${next.join(',')}` : '#/analyza')

  return (
    <Page title="Analýza">
      <div className="grid gap-6">
        <Compare selected={selected} all={all ?? []} ids={ids} setIds={setIds} />
        <Stats all={all ?? []} onCompare={setIds} />
      </div>
    </Page>
  )
}

function Compare({ selected, all, ids, setIds }: { selected: RoastRecord[]; all: RoastRecord[]; ids: string[]; setIds: (x: string[]) => void }) {
  const [showET, setShowET] = useState(false)
  const [showRoR, setShowRoR] = useState(true)
  const aligned = useMemo(() => alignCurves(selected), [selected])
  const m = selected.map((r) => metrics(r))
  const sum = selected.length >= 2 ? summarize(m) : null

  const row = (label: string, get: (r: RoastRecord, mm: RoastMetrics) => string, spread?: (k: ReturnType<typeof summarize>) => string) => (
    <tr className="border-t border-white/5">
      <td className="py-1.5 pr-4 text-zinc-400">{label}</td>
      {selected.map((r, i) => (
        <td key={r.id} className="pr-4 text-right tabular-nums">
          {get(r, m[i])}
        </td>
      ))}
      <td className="text-right tabular-nums text-sky-300">{sum && spread ? spread(sum) : ''}</td>
    </tr>
  )
  const pm = (k: keyof RoastMetrics, fmt: (x: number) => string) => (s: ReturnType<typeof summarize>) =>
    s[k].sd == null ? '' : `± ${fmt(s[k].sd!)}`

  return (
    <Panel className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-semibold">Porovnání pražení</h2>
        {selected.map((r, i) => (
          <span key={r.id} className="flex items-center gap-2 rounded-full bg-[var(--c-bg)] py-1 pl-3 pr-1 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: COMPARE_COLORS[i % COMPARE_COLORS.length] }} />
            <a href={`#/historie/${r.id}`} className="hover:underline">
              {r.coffee || 'Bez názvu'} · {fmtDate(r.roastDate)}
            </a>
            <button className="rounded-full px-2 text-zinc-400 hover:bg-white/10" onClick={() => setIds(ids.filter((x) => x !== r.id))}>
              ✕
            </button>
          </span>
        ))}
        <select
          value=""
          onChange={(e) => e.target.value && setIds([...ids, e.target.value])}
          className={`${inputCls} max-w-72`}
          disabled={ids.length >= 8}
        >
          <option value="">+ přidat pražení…</option>
          {all
            .filter((r) => !ids.includes(r.id))
            .map((r) => (
              <option key={r.id} value={r.id}>
                {fmtDate(r.roastDate)} · {r.coffee}
              </option>
            ))}
        </select>
        <label className="ml-auto flex items-center gap-1.5 text-sm text-zinc-400">
          <input type="checkbox" checked={showET} onChange={(e) => setShowET(e.target.checked)} /> ET
        </label>
        <label className="flex items-center gap-1.5 text-sm text-zinc-400">
          <input type="checkbox" checked={showRoR} onChange={(e) => setShowRoR(e.target.checked)} /> RoR
        </label>
      </div>
      {selected.length === 0 ? (
        <p className="text-sm text-zinc-400">Vyber pražení výše, v Historii zaškrtni řádky a klikni Porovnat, nebo použij tlačítko u kávy ve statistikách.</p>
      ) : (
        <>
          <div className="h-[26rem] rounded-lg bg-[var(--c-chart)] p-2">
            <CompareChart grid={aligned.grid} series={aligned.series} showET={showET} showRoR={showRoR} />
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="label-caps">
                <tr>
                  <th className="pb-2 text-left font-normal"></th>
                  {selected.map((r, i) => (
                    <th key={r.id} className="pb-2 pr-4 text-right font-semibold" style={{ color: COMPARE_COLORS[i % COMPARE_COLORS.length] }}>
                      {fmtDate(r.roastDate).split(' ')[0]} {fmtDate(r.roastDate).split(' ')[1]} {fmtDate(r.roastDate).split(' ')[2]}
                    </th>
                  ))}
                  <th className="pb-2 text-right font-normal text-sky-300">rozptyl (sd)</th>
                </tr>
              </thead>
              <tbody>
                {row('Celkem', (_r, mm) => t(mm.total), pm('total', fmtTime))}
                {row('Charge BT', (_r, mm) => n1(mm.chargeBT, '°'), pm('chargeBT', (x) => `${x.toFixed(1)}°`))}
                {row('Turning Point', (_r, mm) => `${t(mm.tpTime)} · ${n1(mm.tpBT, '°')}`, pm('tpTime', fmtTime))}
                {(['drying', 'maillard', 'development'] as const).map((k) => (
                  <tr key={k} className="border-t border-white/5">
                    <td className="py-1.5 pr-4 font-semibold" style={{ color: PHASE_TEXT[k] }}>
                      {k === 'drying' ? 'Drying' : k === 'maillard' ? 'Maillard' : 'Development'}
                    </td>
                    {selected.map((r) => (
                      <td key={r.id} className="pr-4 text-right tabular-nums">
                        {t(r.phases?.[k] ?? null)} <span className="text-zinc-500">{r.phases?.[`${k}Pct`] != null ? `${r.phases[`${k}Pct`]!.toFixed(0)} %` : ''}</span>
                      </td>
                    ))}
                    <td></td>
                  </tr>
                ))}
                {row('FC start', (_r, mm) => `${t(mm.fcsTime)} · ${n1(mm.fcsBT, '°')}`, pm('fcsTime', fmtTime))}
                {row('Drop BT', (_r, mm) => n1(mm.dropBT, '°'), pm('dropBT', (x) => `${x.toFixed(1)}°`))}
                {row('DTR', (_r, mm) => n1(mm.dtr, ' %'), pm('dtr', (x) => `${x.toFixed(1)} %`))}
                {row('Ztráta', (_r, mm) => n1(mm.lossPct, ' %'), pm('lossPct', (x) => `${x.toFixed(1)} %`))}
                {row('Hodnocení', (r) => (r.rating == null ? '—' : String(r.rating)))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  )
}

function Stats({ all, onCompare }: { all: RoastRecord[]; onCompare: (ids: string[]) => void }) {
  const groups = useMemo(() => {
    const g = new Map<string, RoastRecord[]>()
    for (const r of all) {
      const key = r.coffeeId ?? `name:${r.coffee}`
      g.set(key, [...(g.get(key) ?? []), r])
    }
    return [...g.values()]
      .map((list) => ({ name: list[0].coffee || 'Bez názvu', list, s: summarize(list.map((r) => metrics(r))) }))
      .sort((a, b) => b.list.length - a.list.length)
  }, [all])
  const total = summarize(all.map((r) => metrics(r)))
  const cell = (x: { mean: number | null; sd: number | null }, fmt: (v: number) => string) => (
    <>
      {x.mean == null ? '—' : fmt(x.mean)}
      {x.sd != null && <span className="text-zinc-500"> ± {fmt(x.sd)}</span>}
    </>
  )
  return (
    <Panel className="grid gap-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">Statistiky a opakovatelnost</h2>
        <span className="text-sm text-zinc-400">
          {all.length} pražení · průměr {cell(total.total, fmtTime)} · DTR {cell(total.dtr, (x) => `${x.toFixed(1)} %`)} · ztráta{' '}
          {cell(total.lossPct, (x) => `${x.toFixed(1)} %`)}
        </span>
      </div>
      <p className="text-xs text-zinc-500">Hodnota ± směrodatná odchylka. Čím menší rozptyl u stejné kávy, tím opakovatelnější pražení.</p>
      <table className="w-full text-sm tabular-nums">
        <thead className="label-caps text-left">
          <tr>
            <th className="pb-2 font-normal">Káva</th>
            <th className="pb-2 text-right font-normal">Počet</th>
            <th className="pb-2 text-right font-normal">Celkem</th>
            <th className="pb-2 text-right font-normal">FC start</th>
            <th className="pb-2 text-right font-normal">Drop BT</th>
            <th className="pb-2 text-right font-normal">DTR</th>
            <th className="pb-2 text-right font-normal">Ztráta</th>
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.name + g.list[0].id} className="border-t border-white/5">
              <td className="py-1.5 font-semibold">{g.name}</td>
              <td className="text-right">{g.list.length}</td>
              <td className="text-right">{cell(g.s.total, fmtTime)}</td>
              <td className="text-right">{cell(g.s.fcsTime, fmtTime)}</td>
              <td className="text-right">{cell(g.s.dropBT, (x) => `${x.toFixed(1)}°`)}</td>
              <td className="text-right">{cell(g.s.dtr, (x) => `${x.toFixed(1)} %`)}</td>
              <td className="text-right">{cell(g.s.lossPct, (x) => `${x.toFixed(1)} %`)}</td>
              <td className="pl-3 text-right">
                {g.list.length >= 2 && (
                  <button className="text-sky-300 hover:underline" onClick={() => onCompare(g.list.slice(0, 8).map((r) => r.id))}>
                    porovnat
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}
