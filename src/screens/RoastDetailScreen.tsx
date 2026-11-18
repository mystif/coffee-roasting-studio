import { useLiveQuery } from 'dexie-react-hooks'
import { askConfirm, askText, showAlert } from '../ui/dialog'
import { useEffect, useMemo, useRef, useState } from 'react'
import type uPlot from 'uplot'
import { alogFileName, recordToAlog } from '../io/alogExport'
import { chartToPng, download, recordToCsv } from '../io/exportFiles'
import { resultCardPng } from '../io/resultCard'
import { backupFileName } from '../storage/roastRecord'
import { computeRoR } from '../domain/ror'
import { CONTROL_UNIT, EVENT_LABEL, findEvent, type ControlKind, type EventType } from '../domain/events'
import { PHASE_TEXT, PHASE_LABEL } from '../domain/phases'
import type { LiveSnapshot } from '../live/LiveSession'
import { roast } from '../live/runtime'
import { flushBackups } from '../storage/backup'
import { addCoffee, emptyCoffee } from '../storage/coffees'
import { createProfileFromRoast, roastChoice } from '../storage/profiles'
import { db } from '../storage/db'
import { fmtDate, fmtKg, roastSummary } from '../storage/roastQueries'
import { lossPct, type RoastRecord } from '../storage/roastRecord'
import { ClayButton, Panel } from '../ui/clay'
import { LiveChart, fmtTime, type ChartOverlay } from '../ui/LiveChart'
import { Page, go, inputCls } from '../ui/nav'
import { parseKg } from '../ui/roastPanels'
import { UpdateProfileButton } from '../ui/UpdateProfileButton'

export function RoastDetailScreen({ id }: { id: string }) {
  const r = useLiveQuery(() => db.roasts.get(id).then((x) => x ?? null), [id])
  if (r === undefined) return <Page title="Pražení">{null}</Page>
  if (r === null)
    return (
      <Page title="Pražení nenalezeno">
        <a href="#/historie" className="text-sky-300 underline">
          Zpět na historii
        </a>
      </Page>
    )
  return <Detail key={r.id} r={r} />
}

function Detail({ r }: { r: RoastRecord }) {
  const s = roastSummary(r)
  const [follow, setFollow] = useState(false)
  const chart = useRef<uPlot | null>(null)
  const base = alogFileName(r).replace(/\.alog$/, '')
  const exportPng = async () => {
    if (!chart.current) return
    const sub = [fmtDate(r.roastDate), s.total != null && `celkem ${fmtTime(s.total)}`, s.dtr != null && `DTR ${s.dtr.toFixed(1)} %`, r.lossPct != null && `ztráta ${r.lossPct.toFixed(1)} %`]
      .filter(Boolean)
      .join(' · ')
    download(`${base}.png`, await chartToPng(chart.current, r.coffee || 'Pražení', sub), 'image/png')
  }

  const snap: LiveSnapshot = useMemo(
    () => ({
      source: r.source === 'live' ? 'roaster' : 'replay',
      sourceLabel: r.coffee,
      t: r.samples.t,
      bt: r.samples.bt,
      et: r.samples.et,
      ror: computeRoR(r.samples.t, r.samples.bt),
      startAt: Date.parse(r.roastDate),
      intervalMs: r.sampleIntervalMs,
      version: 1,
    }),
    [r],
  )
  const overlay: ChartOverlay = useMemo(
    () => ({
      events: r.events,
      controls: r.controls,
      chargeT: findEvent(r.events, 'CHARGE')?.t ?? null,
      now: findEvent(r.events, 'DROP')?.t ?? r.samples.t.at(-1) ?? null,
    }),
    [r],
  )

  const duplicate = () => {
    const first = (k: ControlKind) => r.controls.find((c) => c.kind === k)?.value
    const ok = roast.prepare({
      coffee: r.coffee,
      coffeeId: r.coffeeId,
      greenWeightG: r.greenWeightG,
      current: { gas: first('gas'), air: first('air'), drum: first('drum') },
      reference: findEvent(r.events, 'CHARGE') ? roastChoice(r) : null, // this roast as background curve
    })
    if (!ok) return void showAlert('Právě probíhá pražení', 'Nové připravíš po jeho dokončení.')
    go('#/')
  }

  const saveProfile = async () => {
    if (!findEvent(r.events, 'CHARGE')) return showAlert('Nelze uložit jako profil', 'Pražení nemá Charge, křivky se nedají zarovnat.')
    const name = await askText('Uložit jako profil', `${r.coffee || 'Profil'} · ${fmtDate(r.roastDate)}`, {
      message: 'Křivka, události a plán plynu/vzduchu se uloží jako referenční profil.',
    })
    if (name === null) return
    await createProfileFromRoast(r, name)
    go('#/profily')
  }

  const remove = async () => {
    if (!(await askConfirm('Smazat toto pražení?', { message: 'Z aplikace se smaže, soubor zálohy ve složce zůstane.', okLabel: 'Smazat', danger: true }))) return
    await db.roasts.delete(r.id)
    go('#/historie')
  }

  return (
    <Page
      title={`${r.coffee || 'Bez názvu'} · ${fmtDate(r.roastDate)}`}
      actions={
        <>
          <UpdateProfileButton reference={r.reference} roastId={r.id} />
          <ClayButton onClick={() => void saveProfile()} title="Uloží křivku, události a plán plynu/vzduchu jako profil">
            Uložit jako profil
          </ClayButton>
          <ClayButton variant="primary" onClick={duplicate} title="Připraví nové pražení se stejnou kávou, hmotností a výchozím plynem/vzduchem/bubnem – a toto pražení jako referenční křivku">
            Duplikovat jako nové
          </ClayButton>
          <ClayButton onClick={() => go('#/historie')}>Zpět</ClayButton>
        </>
      }
    >
      <div className="grid grid-cols-[1fr_22rem] gap-4">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-5 gap-3">
            <Stat label="Celkem" value={s.total == null ? '—' : fmtTime(s.total)} />
            <Stat label="DTR" value={s.dtr == null ? '—' : `${s.dtr.toFixed(1)} %`} />
            <Stat label="Ztráta" value={r.lossPct == null ? '—' : `${r.lossPct.toFixed(1)} %`} />
            <Stat label="Charge BT" value={s.chargeBT == null ? '—' : `${s.chargeBT.toFixed(1)}°`} />
            <Stat label="Drop BT" value={s.dropBT == null ? '—' : `${s.dropBT.toFixed(1)}°`} />
          </div>
          <div className="relative h-[28rem] rounded-xl bg-[var(--c-chart)] p-3 border border-[var(--c-border)]">
            <LiveChart snap={snap} overlay={overlay} follow={follow} onFollowChange={setFollow} onReady={(u) => (chart.current = u)} />
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-1 text-xs uppercase tracking-wide text-zinc-500">Export</span>
            <ClayButton onClick={() => download(alogFileName(r), recordToAlog(r), 'text/plain')} title="Otevřeš v Artisanu (File → Open)">
              .alog (Artisan)
            </ClayButton>
            <ClayButton onClick={() => download(`${base}.csv`, recordToCsv(r), 'text/csv')} title="Excel / Numbers: středník, desetinná čárka">
              CSV
            </ClayButton>
            <ClayButton onClick={() => void exportPng()}>PNG graf</ClayButton>
            <ClayButton
              onClick={async () => chart.current && download(`${base}-karta.png`, await resultCardPng(chart.current, r), 'image/png')}
              title="Obrázek 1080×1350: křivka, čísla a fáze – ke sdílení nebo na sáček"
            >
              Karta pražení
            </ClayButton>
            <ClayButton onClick={() => download(backupFileName(r), JSON.stringify(r, null, 1), 'application/json')} title="Kompletní záznam pražení">
              JSON
            </ClayButton>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Panel>
              <h3 className="mb-2 font-semibold">Události</h3>
              <table className="w-full text-sm tabular-nums">
                <tbody>
                  {r.events.map((e) => (
                    <tr key={e.id}>
                      <td className="py-0.5 text-zinc-300">
                        {e.type === 'CUSTOM' ? `★ ${e.note ?? ''}` : EVENT_LABEL[e.type as EventType]}
                        {e.auto && <span className="ml-1 text-xs text-zinc-500">auto</span>}
                      </td>
                      <td className="text-right">{overlay.chargeT === null ? '' : fmtTime(e.t - overlay.chargeT)}</td>
                      <td className="text-right">{e.bt == null ? '' : `${e.bt.toFixed(1)} °C`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel>
              <h3 className="mb-2 font-semibold">Fáze</h3>
              {r.phases ? (
                <table className="w-full text-sm tabular-nums">
                  <tbody>
                    {(
                      [
                        ['drying', r.phases.drying, r.phases.dryingPct],
                        ['maillard', r.phases.maillard, r.phases.maillardPct],
                        ['development', r.phases.development, r.phases.developmentPct],
                      ] as const
                    ).map(([k, sec, pct]) => (
                      <tr key={k}>
                        <td className="py-0.5 font-semibold" style={{ color: PHASE_TEXT[k] }}>
                          {PHASE_LABEL[k]}
                        </td>
                        <td className="text-right">{sec == null ? '—' : fmtTime(sec)}</td>
                        <td className="text-right text-zinc-400">{pct == null ? '' : `${pct.toFixed(1)} %`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-zinc-400">Bez Charge nelze fáze spočítat.</p>
              )}
              <h3 className="mb-1 mt-4 font-semibold">Plyn · vzduch · buben</h3>
              <p className="text-sm leading-relaxed text-zinc-300">
                {r.controls.length === 0
                  ? '—'
                  : r.controls
                      .map(
                        (c) =>
                          `${overlay.chargeT === null ? '' : fmtTime(c.t - overlay.chargeT) + ' '}${
                            { gas: 'plyn', air: 'vzduch', drum: 'buben' }[c.kind]
                          } ${String(c.value).replace('.', ',')} ${CONTROL_UNIT[c.kind]}`,
                      )
                      .join(' · ')}
              </p>
            </Panel>
          </div>
        </div>
        <EditPanel r={r} onDelete={() => void remove()} />
      </div>
    </Page>
  )
}

function EditPanel({ r, onDelete }: { r: RoastRecord; onDelete: () => void }) {
  const coffees = useLiveQuery(() => db.coffees.orderBy('name').toArray(), [])
  const init = () => ({
    coffee: r.coffee,
    green: r.greenWeightG == null ? '' : String(r.greenWeightG / 1000).replace('.', ','),
    roasted: r.roastedWeightG == null ? '' : String(r.roastedWeightG / 1000).replace('.', ','),
    notes: r.notes,
    rating: r.rating,
  })
  const [v, setV] = useState(init)
  const [saved, setSaved] = useState(false)
  useEffect(() => setV(init()), [r.savedAt, r.backedUp]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(v) !== JSON.stringify(init())
  const green = parseKg(v.green)
  const roasted = parseKg(v.roasted)
  const loss = lossPct(green, roasted)

  const save = async () => {
    const name = v.coffee.trim()
    const match = coffees?.find((c) => c.name.toLowerCase() === name.toLowerCase())
    const linked = match ?? (name && name !== r.coffee ? await addCoffee({ ...emptyCoffee(), name }) : null)
    await db.roasts.update(r.id, {
      coffee: linked?.name ?? name,
      coffeeId: linked?.id ?? (name === r.coffee ? r.coffeeId : null),
      greenWeightG: green,
      roastedWeightG: roasted,
      lossPct: loss,
      notes: v.notes,
      rating: v.rating,
      backedUp: false,
    })
    await flushBackups()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Panel className="flex flex-col gap-3 self-start">
      <h3 className="font-semibold">Údaje a hodnocení</h3>
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Káva
        <input value={v.coffee} list="coffee-list-detail" onChange={(e) => setV({ ...v, coffee: e.target.value })} className={inputCls} />
        <datalist id="coffee-list-detail">
          {coffees?.map((c) => <option key={c.id} value={c.name} />)}
        </datalist>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Zelená (kg)
          <input value={v.green} inputMode="decimal" onChange={(e) => setV({ ...v, green: e.target.value })} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Pražená (kg)
          <input value={v.roasted} inputMode="decimal" onChange={(e) => setV({ ...v, roasted: e.target.value })} className={inputCls} />
        </label>
      </div>
      <p className="text-sm text-zinc-400">
        Ztráta: <span className="font-semibold text-zinc-100">{loss == null ? '—' : `${loss.toFixed(1)} %`}</span> · {fmtKg(green)} → {fmtKg(roasted)}
      </p>
      <div className="flex flex-col gap-1 text-xs text-zinc-400">
        Hodnocení
        <div className="flex gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setV({ ...v, rating: v.rating === n ? null : n })}
              className={`h-8 flex-1 rounded-lg text-sm font-semibold ${
 v.rating !== null && n <= v.rating ? 'bg-amber-400 text-amber-950' : 'bg-[var(--c-bg)] text-zinc-400 hover:text-zinc-100'
 }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Poznámky
        <textarea rows={5} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className={inputCls} />
      </label>
      <div className="flex items-center gap-2">
        <ClayButton variant="primary" onClick={() => void save()} disabled={!dirty}>
          Uložit změny
        </ClayButton>
        {saved && <span className="text-sm text-emerald-300">✓ Uloženo</span>}
        <ClayButton variant="danger" className="ml-auto" onClick={onDelete}>
          Smazat
        </ClayButton>
      </div>
      <p className="text-xs text-zinc-500">
        {r.source === 'import' ? 'Importováno z Artisanu' : 'Živé pražení'} · {r.backedUp ? 'zálohováno ✓' : 'záloha čeká'}
      </p>
    </Panel>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--c-surface)] px-4 py-3 border border-[var(--c-border)]">
      <div className="text-[0.6875rem] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}
