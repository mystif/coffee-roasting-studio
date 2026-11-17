import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { addCoffee, emptyCoffee } from '../storage/coffees'
import { db } from '../storage/db'
import { profileChoice } from '../storage/profiles'
import { EVENT_LABEL, findEvent, nextExpected, type EventType, type RoastEvent } from '../domain/events'
import { PHASE_COLOR, PHASE_TEXT, PHASE_LABEL, currentPhase, phaseStats } from '../domain/phases'
import { deviation, startSettings, upcoming } from '../domain/reference'
import { AIR_PRESETS, CONTROL_LIMITS, GAS_PRESETS, type RoastState } from '../live/roastStore'
import { formatControl, shade } from './chartMarks'
import type { ControlKind } from '../domain/events'
import { roast } from '../live/runtime'
import { ClayButton } from './clay'
import { fmtTime } from './LiveChart'
import { SaveStatus } from './storageUi'
import { DayTimer } from './DayTimer'

const CARD =
  'rounded-3xl bg-[var(--c-surface)] shadow-[inset_0_1px_0_rgba(255,255,255,.05),inset_0_-2px_6px_var(--sh),0_10px_24px_var(--sh)]'

export const parseKg = (s: string): number | null => {
  const v = Number(s.replace(',', '.').trim())
  return Number.isFinite(v) && v > 0 ? Math.round(v * 1000) : null
}
const kg = (g: number | null) => (g == null ? '' : String(g / 1000).replace('.', ','))

// ── event buttons ──────────────────────────────────────────

const BUTTONS: EventType[] = ['CHARGE', 'DRY', 'FCs', 'FCe', 'SC', 'DROP']

export function EventPanel({ state }: { state: RoastState }) {
  const [custom, setCustom] = useState<string | null>(null)
  const roasting = state.status === 'roasting'
  const next = nextExpected(state.events)
  const charge = findEvent(state.events, 'CHARGE')
  const rel = (e: RoastEvent) => fmtTime(e.t - (charge?.t ?? e.t))
  const tp = findEvent(state.events, 'TP')

  return (
    <div className={`${CARD} flex w-56 shrink-0 flex-col gap-1.5 overflow-auto p-3`}>
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-semibold text-zinc-300">Události</span>
        <button
          className="text-xs text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
          disabled={!state.canUndo}
          onClick={() => roast.undo()}
          title="Zpět (⌘Z)"
        >
          ↶ Zpět
        </button>
      </div>
      {BUTTONS.map((type) => {
        const e = findEvent(state.events, type)
        const isNext = roasting && next === type
        return (
          <div key={type} className="relative">
            <button
              disabled={!roasting}
              onClick={() => roast.mark(type)}
              className={`w-full rounded-2xl px-3 py-2 text-left transition active:translate-y-px disabled:opacity-40 ${
                isNext
                  ? 'bg-gradient-to-b from-sky-400 to-sky-600 text-sky-950 ring-2 ring-sky-300/50'
                  : e
                    ? 'bg-[var(--c-raised2)] text-zinc-100'
                    : 'bg-[var(--c-raised)] text-zinc-200'
              } shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_6px_14px_var(--sh)]`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">{EVENT_LABEL[type]}</span>
                {isNext && <span className="text-[10px] font-bold uppercase opacity-70">mezerník</span>}
              </div>
              {e && (
                <div className="text-xs tabular-nums opacity-80">
                  {rel(e)} · {e.bt?.toFixed(1)} °C {e.auto && <span className="opacity-70">(auto)</span>}
                </div>
              )}
            </button>
            {e && roasting && (
              <button
                onClick={() => roast.removeEvent(e.id)}
                className="absolute right-2 top-2 rounded-full px-1.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                title="Odstranit událost"
              >
                ✕
              </button>
            )}
          </div>
        )
      })}
      {tp && (
        <p className="px-1 text-xs tabular-nums text-zinc-400">
          Turning Point {rel(tp)} · {tp.bt?.toFixed(1)} °C
        </p>
      )}
      {state.events
        .filter((e) => e.type === 'CUSTOM')
        .map((e) => (
          <p key={e.id} className="flex justify-between px-1 text-xs text-zinc-300">
            <span className="truncate">★ {e.note || 'Vlastní'}</span>
            <span className="tabular-nums text-zinc-400">{rel(e)}</span>
          </p>
        ))}
      {custom === null ? (
        <button
          disabled={!roasting}
          onClick={() => setCustom('')}
          className="rounded-2xl border border-dashed border-zinc-600 px-3 py-2 text-sm text-zinc-300 disabled:opacity-40"
        >
          + Vlastní událost
        </button>
      ) : (
        <input
          autoFocus
          value={custom}
          placeholder="Poznámka, Enter = uložit"
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              roast.mark('CUSTOM', custom.trim() || undefined)
              setCustom(null)
            } else if (e.key === 'Escape') setCustom(null)
          }}
          onBlur={() => setCustom(null)}
          className="rounded-2xl bg-[var(--c-bg)] px-3 py-2 text-sm outline-none ring-1 ring-zinc-600 focus:ring-sky-400"
        />
      )}
    </div>
  )
}

// ── phase strip ────────────────────────────────────────────

export function PhaseStrip({ state, now, est = [] }: { state: RoastState; now: number | null; est?: import('../live/estimates').Estimate[] }) {
  const stats = now === null ? null : phaseStats(state.events, now)
  const phase = currentPhase(state.events)
  const fcs = findEvent(state.events, 'FCs')
  const drop = findEvent(state.events, 'DROP')
  const sinceFc = fcs && now !== null ? (drop?.t ?? now) - fcs.t : null
  const charge = findEvent(state.events, 'CHARGE')
  const estDE = est.find((e) => e.type === 'DRY')
  const estFC = est.find((e) => e.type === 'FCs')
  const rel = (t: number) => fmtTime(t - (charge?.t ?? 0))
  const hint = (e?: import('../live/estimates').Estimate) =>
    e ? (
      <span className="truncate text-xs font-semibold text-zinc-300" title={`Odhad podle aktuální RoR, cíl ${e.target.toFixed(1)} °C (${e.basis})`}>
        ~{rel(e.t)} <span className="font-normal text-zinc-500">za {fmtTime(e.inSec)}</span>
      </span>
    ) : null
  const seg = (name: 'drying' | 'maillard' | 'development', sec: number | null, pct: number | null, estimate?: import('../live/estimates').Estimate) => (
    <div
      className="flex min-w-0 items-center justify-between gap-2 rounded-xl px-3 py-1.5"
      style={{
        flexGrow: Math.max(pct ?? 0, 8),
        background: PHASE_COLOR[name] + (phase === name ? '33' : '1a'),
        boxShadow: phase === name ? `inset 0 0 0 1.5px ${PHASE_COLOR[name]}` : undefined,
      }}
    >
      <span className="truncate text-xs font-semibold" style={{ color: PHASE_TEXT[name] }}>
        {PHASE_LABEL[name]}
      </span>
      {sec == null && estimate ? (
        hint(estimate)
      ) : (
        <span className="text-sm font-semibold tabular-nums text-zinc-100">
          {sec == null ? '—' : fmtTime(sec)} <span className="text-zinc-400">{pct == null ? '' : `${pct.toFixed(0)} %`}</span>
        </span>
      )}
    </div>
  )
  return (
    <div className={`${CARD} flex items-center gap-3 px-3 py-2`}>
      <div className="flex min-w-0 flex-1 gap-1.5">
        {seg('drying', stats?.drying ?? null, stats?.dryingPct ?? null)}
        {seg('maillard', stats?.maillard ?? null, stats?.maillardPct ?? null, estDE)}
        {seg('development', stats?.development ?? null, stats?.developmentPct ?? null, estFC)}
      </div>
      {sinceFc === null && estFC ? (
        <Mini label="do FC ~" value={fmtTime(estFC.inSec)} title={`FC kolem ${rel(estFC.t)} při ${estFC.target.toFixed(1)} °C (${estFC.basis})`} />
      ) : (
        <Mini label="od FC" value={sinceFc === null ? '—' : fmtTime(sinceFc)} />
      )}
      <Mini label="DTR" value={stats?.dtr == null ? '—' : `${stats.dtr.toFixed(1)} %`} />
    </div>
  )
}

function Mini({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="w-24 text-right" title={title}>
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

// ── start bar (before roasting) ────────────────────────────

export function StartBar({ state, canStart }: { state: RoastState; canStart: boolean }) {
  const coffees = useLiveQuery(() => db.coffees.orderBy('name').toArray(), [])
  const [coffee, setCoffee] = useState(state.coffee)
  const [weight, setWeight] = useState(kg(state.greenWeightG))
  // follow "duplicate as new" pre-fills
  useEffect(() => {
    setCoffee(state.coffee)
    setWeight(kg(state.greenWeightG))
  }, [state.coffee, state.greenWeightG])
  const name = coffee.trim()
  const match = coffees?.find((c) => c.name.toLowerCase() === name.toLowerCase())
  const profiles = useLiveQuery(() => db.profiles.orderBy('name').toArray(), [])
  // profiles of the chosen coffee first
  const sortedProfiles = [...(profiles ?? [])].sort(
    (a, b) => Number(b.coffeeId === match?.id && !!match) - Number(a.coffeeId === match?.id && !!match),
  )
  const refKey = state.reference ? `${state.reference.kind}:${state.reference.id}` : ''
  const chooseRef = (key: string) => {
    if (!key) return roast.update({ reference: null })
    if (key === refKey) return
    const p = profiles?.find((x) => `profile:${x.id}` === key)
    if (p) roast.update({ reference: profileChoice(p) })
  }
  const start = async () => {
    // typed name not in the list yet → add it, so it is one click next time
    const linked = match ?? (name ? await addCoffee({ ...emptyCoffee(), name }) : null)
    roast.start({ coffee: linked?.name ?? name, coffeeId: linked?.id ?? null, greenWeightG: parseKg(weight) })
  }
  return (
    <div className={`${CARD} flex flex-wrap items-end gap-x-4 gap-y-2 px-5 py-3`}>
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-zinc-400">
        <span>
          Káva {name && !match && <span className="text-sky-300">· nová, přidá se do seznamu káv</span>}
        </span>
        <input
          value={coffee}
          autoComplete="off"
          list="coffee-list"
          onChange={(e) => setCoffee(e.target.value)}
          placeholder={coffees?.length ? 'vyber nebo napiš název' : 'např. Colombia Huila'}
          className="rounded-xl bg-[var(--c-bg)] px-3 py-2 text-base text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-400"
        />
        <datalist id="coffee-list">
          {coffees?.map((c) => (
            <option key={c.id} value={c.name}>
              {[c.country, c.process].filter(Boolean).join(', ')}
            </option>
          ))}
        </datalist>
      </label>
      <label className="flex w-72 flex-col gap-1 text-xs text-zinc-400">
        Referenční profil
        <select
          value={refKey}
          onChange={(e) => chooseRef(e.target.value)}
          className="rounded-xl bg-[var(--c-bg)] px-3 py-2 text-base text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-400"
        >
          <option value="">bez reference</option>
          {state.reference?.kind === 'roast' && <option value={refKey}>Pražení: {state.reference.label}</option>}
          {sortedProfiles.map((p) => (
            <option key={p.id} value={`profile:${p.id}`}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex w-40 flex-col gap-1 text-xs text-zinc-400">
        Zelená káva (kg)
        <input
          value={weight}
          autoComplete="off"
          inputMode="decimal"
          onChange={(e) => setWeight(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canStart && void start()}
          placeholder="3,0"
          className="rounded-xl bg-[var(--c-bg)] px-3 py-2 text-base tabular-nums text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-400"
        />
      </label>
      <ClayButton variant="primary" onClick={() => void start()} disabled={!canStart} className="px-8 py-3 text-base">
        Start Roasting
      </ClayButton>
      <DayTimer />
    </div>
  )
}

// ── manual control log (gas / air / drum) ──────────────────

export function ControlsBar({ state }: { state: RoastState }) {
  const enabled = state.status === 'roasting'
  const c = state.current
  return (
    <div className={`${CARD} flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5 ${enabled ? '' : '[&>*:not(:last-child)]:opacity-50'}`}>
      <span className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-zinc-500">
        Ruční
        <br />
        záznam
      </span>
      <Presets label="Plyn" unit="kPa" hint="↑ ↓" kind="gas" values={GAS_PRESETS} current={c.gas} enabled={enabled} />
      <Presets label="Vzduch (Hot Air)" unit="%" hint="1–5" kind="air" values={AIR_PRESETS} current={c.air} enabled={enabled} />
      <Stepper label="Buben" unit="%" value={c.drum} kind="drum" enabled={enabled} hint="[ ]" />
      <DayTimer />
    </div>
  )
}

/** Fixed values as a segmented control; the selected one has the same shade as its bar in the chart. */
function Presets(props: { label: string; unit: string; hint: string; kind: ControlKind; values: number[]; current: number; enabled: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-zinc-400">
        {props.label} <span className="text-zinc-500">{props.unit}</span> <span className="text-zinc-600">{props.hint}</span>
      </span>
      <div className="flex gap-0.5 rounded-2xl bg-[var(--c-bg)] p-1">
        {props.values.map((v) => {
          const active = props.current === v
          return (
            <button
              key={v}
              disabled={!props.enabled}
              onClick={() => roast.setControl(props.kind, v)}
              style={active ? { background: shade(props.kind, v), color: '#111318' } : undefined}
              className={`min-w-10 rounded-xl px-2 py-1.5 text-sm font-semibold tabular-nums transition ${
                active ? 'shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_3px_8px_var(--sh)]' : 'text-zinc-300 hover:bg-white/5'
              }`}
            >
              {formatControl(props.kind, v)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Stepper(props: { label: string; unit: string; value: number; kind: 'drum'; enabled: boolean; hint: string }) {
  const step = CONTROL_LIMITS[props.kind].step
  const btn = 'h-9 w-9 rounded-xl bg-[var(--c-raised)] text-lg font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,.15),0_4px_10px_var(--sh)] active:translate-y-px'
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-zinc-400">
        {props.label} <span className="text-zinc-600">{props.hint}</span>
      </span>
      <div className="flex items-center gap-2">
        <button className={btn} disabled={!props.enabled} onClick={() => roast.setControl(props.kind, props.value - step)}>
          −
        </button>
        <span className="w-24 text-center text-2xl font-semibold tabular-nums">
          {String(props.value).replace('.', ',')} <span className="text-sm text-zinc-400">{props.unit}</span>
        </span>
        <button className={btn} disabled={!props.enabled} onClick={() => roast.setControl(props.kind, props.value + step)}>
          +
        </button>
      </div>
    </div>
  )
}

// ── summary after Finish ───────────────────────────────────

export function SummaryPanel({ state }: { state: RoastState }) {
  const drop = findEvent(state.events, 'DROP')
  const charge = findEvent(state.events, 'CHARGE')
  const stats = drop ? phaseStats(state.events, drop.t) : null
  const [roasted, setRoasted] = useState(kg(state.roastedWeightG))
  const roastedInput = useRef<HTMLInputElement>(null)
  // focus the weight field without scrolling the panel away from the summary
  useEffect(() => roastedInput.current?.focus({ preventScroll: true }), [])
  const loss =
    state.greenWeightG && state.roastedWeightG ? ((state.greenWeightG - state.roastedWeightG) / state.greenWeightG) * 100 : null
  const row = (type: EventType) => {
    const e = findEvent(state.events, type)
    return (
      <tr key={type}>
        <td className="py-0.5 text-zinc-400">{EVENT_LABEL[type]}</td>
        <td className="text-right tabular-nums">{e && charge ? fmtTime(e.t - charge.t) : '—'}</td>
        <td className="text-right tabular-nums">{e?.bt != null ? `${e.bt.toFixed(1)} °C` : ''}</td>
      </tr>
    )
  }
  return (
    <div className={`${CARD} absolute inset-3 z-10 grid grid-cols-2 gap-6 overflow-auto bg-[var(--c-surface)]/95 p-5`}>
      <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-400">Vyhodnocení pražení</p>
        <h2 className="text-xl font-semibold">{state.coffee || 'Bez názvu'}</h2>
        <SaveStatus source={state.source} savedId={state.savedId} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Celkem" value={stats ? fmtTime(stats.total) : '—'} />
        <Stat label="DTR" value={stats?.dtr == null ? '—' : `${stats.dtr.toFixed(1)} %`} />
        <Stat label="Ztráta" value={loss == null ? '—' : `${loss.toFixed(1)} %`} />
      </div>
      <table className="w-full text-sm">
        <tbody>{(['CHARGE', 'TP', 'DRY', 'FCs', 'FCe', 'SC', 'DROP'] as EventType[]).map(row)}</tbody>
      </table>
      {stats && (
        <table className="w-full text-sm">
          <tbody>
            {(
              [
                ['drying', stats.drying, stats.dryingPct],
                ['maillard', stats.maillard, stats.maillardPct],
                ['development', stats.development, stats.developmentPct],
              ] as const
            ).map(([k, sec, pct]) => (
              <tr key={k}>
                <td className="py-0.5 font-semibold" style={{ color: PHASE_TEXT[k] }}>
                  {PHASE_LABEL[k]}
                </td>
                <td className="text-right tabular-nums">{sec == null ? '—' : fmtTime(sec)}</td>
                <td className="text-right tabular-nums text-zinc-400">{pct == null ? '' : `${pct.toFixed(1)} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </div>
      <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-400">
          Zelená (kg)
          <span className="py-2 text-base tabular-nums text-zinc-200">{kg(state.greenWeightG) || '—'}</span>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-400">
          Pražená (kg)
          <input
            ref={roastedInput}
            value={roasted}
            autoComplete="off"
            inputMode="decimal"
            onChange={(e) => {
              setRoasted(e.target.value)
              roast.update({ roastedWeightG: parseKg(e.target.value) })
            }}
            placeholder="2,55"
            className="rounded-xl bg-[var(--c-bg)] px-3 py-2 text-base tabular-nums outline-none ring-1 ring-zinc-700 focus:ring-sky-400"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Poznámky
        <textarea
          value={state.notes}
          onChange={(e) => roast.update({ notes: e.target.value })}
          rows={6}
          className="rounded-xl bg-[var(--c-bg)] px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-400"
        />
      </label>
      <div className="mt-auto flex gap-2">
        <ClayButton variant="primary" onClick={() => roast.newRoast()} className="flex-1">
          Nové pražení
        </ClayButton>
        {state.savedId && (
          <ClayButton onClick={() => (location.hash = `#/historie/${state.savedId}`)}>Detail v historii</ClayButton>
        )}
      </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--c-bg)] px-2 py-2">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

// ── live comparison with the reference ─────────────────────

export function ReferenceStrip(props: {
  curve: import('../domain/reference').ReferenceCurve
  roastTime: number | null
  bt: number | null
  ror: number | null
  afterTP: boolean
  charged: boolean
}) {
  const { curve, roastTime } = props
  if (!props.charged || roastTime === null) {
    const st = startSettings(curve)
    const parts = [
      st.gas !== undefined && `plyn ${formatControl('gas', st.gas)} kPa`,
      st.air !== undefined && `vzduch ${st.air} %`,
      st.drum !== undefined && `buben ${st.drum} %`,
    ].filter(Boolean)
    return (
      <div className={`${CARD} flex items-center gap-4 px-4 py-2 text-sm text-zinc-400`}>
        <span className="min-w-0 truncate">
          Reference <b className="text-zinc-200">{curve.label}</b> – náhled v grafu, porovnávání začne po Charge.
        </span>
        {parts.length > 0 && (
          <span className="ml-auto whitespace-nowrap rounded-xl bg-[var(--c-bg)] px-3 py-1 text-zinc-300">
            Na začátek nastav: <b className="text-zinc-100">{parts.join(' · ')}</b>
          </span>
        )}
      </div>
    )
  }
  const d = deviation(curve, roastTime, props.bt, props.ror, props.afterTP)
  const next = upcoming(curve, roastTime)
  const sign = (x: number, digits = 1) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(digits)}`
  const tone = (x: number | null, warn: number) => (x === null ? 'text-zinc-500' : Math.abs(x) >= warn ? 'text-amber-300' : 'text-emerald-300')
  const ctrlName = { gas: 'plyn', air: 'vzduch', drum: 'buben' } as const
  return (
    <div className={`${CARD} flex items-center gap-5 px-4 py-2 text-sm`}>
      <span className="max-w-56 truncate text-zinc-400" title={curve.label}>
        vs <b className="text-zinc-200">{curve.label}</b>
      </span>
      <Dev label="Δ BT" value={d.dBT === null ? '—' : `${sign(d.dBT)} °C`} cls={tone(d.dBT, 3)} />
      <Dev
        label="Δ čas"
        value={d.dTime === null ? '—' : `${d.dTime > 0 ? '+' : d.dTime < 0 ? '−' : '±'}${fmtTime(Math.abs(d.dTime))}`}
        cls={tone(d.dTime, 15)}
        title="+ = pomaleji než reference při stejné BT"
      />
      <Dev label="Δ RoR" value={d.dRoR === null ? '—' : sign(d.dRoR)} cls={tone(d.dRoR, 2)} />
      <div className="ml-auto flex gap-5 text-zinc-300">
        {next.event && (
          <span>
            {EVENT_LABEL[next.event.type]} v {fmtTime(next.event.t)}
            {next.event.bt != null && ` · ${next.event.bt.toFixed(1)}°`}{' '}
            <span className="text-zinc-500">(za {fmtTime(next.event.t - roastTime)})</span>
          </span>
        )}
        {next.control && (
          <span>
            {ctrlName[next.control.kind]} {String(next.control.value).replace('.', ',')} {next.control.kind === 'gas' ? 'kPa' : '%'}{' '}
            <span className="text-zinc-500">za {fmtTime(next.control.t - roastTime)}</span>
          </span>
        )}
      </div>
    </div>
  )
}

function Dev({ label, value, cls, title }: { label: string; value: string; cls: string; title?: string }) {
  return (
    <span className="flex items-baseline gap-2" title={title}>
      <span className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${cls}`}>{value}</span>
    </span>
  )
}
