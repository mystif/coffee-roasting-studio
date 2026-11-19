import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { addCoffee, emptyCoffee } from '../storage/coffees'
import { db } from '../storage/db'
import { profileChoice } from '../storage/profiles'
import { CONTROL_UNIT, EVENT_LABEL, findEvent, nextExpected, type EventType, type RoastEvent } from '../domain/events'
import { PHASE_COLOR, PHASE_TEXT, PHASE_LABEL, currentPhase, phaseProgress, phaseStats } from '../domain/phases'
import { AIR_PRESETS, CONTROL_LIMITS, GAS_PRESETS, type RoastState } from '../live/roastStore'

/** Drum speed knob 0–100, in steps of 5. */
const DRUM_VALUES = Array.from({ length: 21 }, (_, i) => i * 5)
import { formatControl, shade, textOn } from './chartMarks'
import type { ControlKind } from '../domain/events'
import { roast } from '../live/runtime'
import { ClayButton } from './clay'
import { fmtTime } from './LiveChart'
import { SaveStatus } from './storageUi'
import { SaveNewProfileButton, UpdateProfileButton } from './UpdateProfileButton'
import { SuggestedProfileSave } from './SuggestedProfileSave'

const CARD =
  'card rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)]'

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
    <div className={`${CARD} flex min-h-0 flex-1 flex-col gap-1 overflow-auto p-2`}>
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
              className={`w-full rounded-xl px-2.5 py-1.5 text-left text-sm transition disabled:opacity-40 ${
 isNext
 ? 'bg-[var(--c-accent)] text-[var(--c-accent-fg)] ring-1 ring-[var(--c-accent-ring)]'
 : e
 ? 'bg-[var(--c-raised2)] text-zinc-100'
 : 'bg-[var(--c-raised)] text-zinc-200'
 } `}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">{EVENT_LABEL[type]}</span>
                {isNext && <span className="text-[0.625rem] font-bold uppercase opacity-70">mezerník</span>}
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
          <p key={e.id} className="flex items-center gap-1 px-1 text-xs text-zinc-300">
            <span className="min-w-0 flex-1 truncate" title={e.note}>
              <span className="text-amber-400">★</span> {e.note || 'Vlastní'}
            </span>
            <span className="tabular-nums text-zinc-400">{rel(e)}</span>
            {roasting && (
              <button onClick={() => roast.removeEvent(e.id)} className="rounded px-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-100" title="Smazat poznámku">
                ✕
              </button>
            )}
          </p>
        ))}
      {custom === null ? (
        <button
          disabled={!roasting}
          onClick={() => setCustom('')}
          className="rounded-lg border border-dashed border-zinc-600 px-3 py-2 text-sm text-zinc-300 disabled:opacity-40"
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
          className="rounded-lg bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--c-accent-ring)]"
        />
      )}
      {roasting && <p className="px-1 text-[0.6875rem] leading-snug text-zinc-500">Tip: klikni na křivku BT v grafu – poznámka se uloží do toho místa.</p>}
    </div>
  )
}

// ── phase strip ────────────────────────────────────────────

export function PhaseStrip({
  state,
  now,
  est = [],
  dtrGoal = { target: 20, fromReference: false },
}: {
  state: RoastState
  now: number | null
  est?: import('../live/estimates').Estimate[]
  /** DTR target for the ring (reference DTR or the default) */
  dtrGoal?: { target: number; fromReference: boolean }
}) {
  const stats = now === null ? null : phaseStats(state.events, now)
  const phase = currentPhase(state.events)
  const fcs = findEvent(state.events, 'FCs')
  const drop = findEvent(state.events, 'DROP')
  const sinceFc = fcs && now !== null ? (drop?.t ?? now) - fcs.t : null
  const charge = findEvent(state.events, 'CHARGE')
  const estDE = est.find((e) => e.type === 'DRY')
  const estFC = est.find((e) => e.type === 'FCs')
  const rel = (t: number) => fmtTime(t - (charge?.t ?? 0))
  const progress = now === null ? null : phaseProgress(state.events, now, { DRY: estDE?.inSec, FCs: estFC?.inSec }, dtrGoal.target)
  const hint = (e?: import('../live/estimates').Estimate) =>
    e ? (
      <span className="truncate text-xs font-semibold text-zinc-300" title={`Odhad podle aktuální RoR, cíl ${e.target.toFixed(1)} °C (${e.basis})`}>
        ~{rel(e.t)} <span className="font-normal text-zinc-500">za {fmtTime(e.inSec)}</span>
      </span>
    ) : null
  const seg = (name: 'drying' | 'maillard' | 'development', sec: number | null, pct: number | null, estimate?: import('../live/estimates').Estimate) => (
    <div
      className="relative flex min-w-0 items-center justify-between gap-2 overflow-hidden rounded-lg px-2.5 py-0.5"
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
        <span className="font-num whitespace-nowrap text-sm text-zinc-100">
          {sec == null ? '—' : fmtTime(sec)} <span className="text-zinc-400">{pct == null ? '' : `${pct.toFixed(0)} %`}</span>
        </span>
      )}
      {/* progress of the running phase towards the estimated next event / target DTR */}
      {progress?.phase === name && (
        <span
          className="absolute bottom-0 left-0 h-[3px] rounded-r transition-[width] duration-700"
          style={{ width: `${progress.progress * 100}%`, background: PHASE_COLOR[name] }}
          title={`${Math.round(progress.progress * 100)} % fáze`}
        />
      )}
    </div>
  )
  return (
    <div className="flex items-center gap-3 pb-1">
      <div className="flex min-w-0 flex-1 gap-1">
        {seg('drying', stats?.drying ?? null, stats?.dryingPct ?? null)}
        {seg('maillard', stats?.maillard ?? null, stats?.maillardPct ?? null, estDE)}
        {seg('development', stats?.development ?? null, stats?.developmentPct ?? null, estFC)}
      </div>
      {sinceFc === null && estFC ? (
        <Mini label="do FC ~" value={fmtTime(estFC.inSec)} title={`FC kolem ${rel(estFC.t)} při ${estFC.target.toFixed(1)} °C (${estFC.basis})`} />
      ) : (
        <Mini label="od FC" value={sinceFc === null ? '—' : fmtTime(sinceFc)} />
      )}
      <DtrRing dtr={stats?.dtr ?? null} goal={dtrGoal} />
    </div>
  )
}

/** DTR with a ring that fills towards the target DTR: green around the target, red when clearly over. */
function DtrRing({ dtr, goal }: { dtr: number | null; goal: { target: number; fromReference: boolean } }) {
  const f = dtr == null ? 0 : dtr / goal.target
  const color = dtr == null ? 'var(--chart-axis)' : f > 1.08 ? 'var(--color-rose-400)' : f >= 0.92 ? 'var(--color-emerald-400)' : 'var(--color-amber-400)'
  const r = 9
  const c = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap" title={`Cíl DTR ${goal.target.toFixed(1)} % (${goal.fromReference ? 'z reference' : 'výchozí'})`}>
      <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90">
        <circle cx="12" cy="12" r={r} fill="none" stroke="var(--c-border)" strokeWidth="3" />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, f))}
          style={{ transition: 'stroke-dashoffset .7s ease, stroke .3s' }}
        />
      </svg>
      <span className="label-caps">DTR</span>
      <span className="font-num text-lg">{dtr == null ? '—' : `${dtr.toFixed(1)} %`}</span>
      <span className="text-[0.6875rem] tabular-nums text-zinc-500">/ {goal.target.toFixed(0)}</span>
    </div>
  )
}

function Mini({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap" title={title}>
      <span className="label-caps">{label}</span>
      <span className="font-num text-lg">{value}</span>
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
    // the profile's coffee becomes the coffee being roasted (can still be changed)
    if (p) roast.update({ reference: profileChoice(p), ...(p.coffee ? { coffee: p.coffee, coffeeId: p.coffeeId } : {}) })
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
          className="rounded-lg bg-[var(--c-bg)] px-3 py-2 text-base text-zinc-100 outline-none focus:ring-2 focus:ring-[var(--c-accent-ring)]"
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
          className="rounded-lg bg-[var(--c-bg)] px-3 py-2 text-base text-zinc-100 outline-none focus:ring-2 focus:ring-[var(--c-accent-ring)]"
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
          className="rounded-lg bg-[var(--c-bg)] px-3 py-2 text-base tabular-nums text-zinc-100 outline-none focus:ring-2 focus:ring-[var(--c-accent-ring)]"
        />
      </label>
      <ClayButton variant="primary" onClick={() => void start()} disabled={!canStart} className="px-8 py-3 text-base">
        Start Roasting
      </ClayButton>
    </div>
  )
}

// ── manual control log (gas / air / drum) ──────────────────

export type ControlPlan = Partial<Record<ControlKind, { value: number; inSec: number | null } | null>>

/** Highlight a planned change this many seconds before it is due. */
const PLAN_DUE_SEC = 15

/**
 * Control panel: per control a big current value with − / +, the fixed presets and – with a
 * reference – what the plan sets next ("plán 4,0 za 0:35", lights up shortly before; click = take it).
 */
export function ControlsBar({ state, plan = null }: { state: RoastState; plan?: ControlPlan | null }) {
  const enabled = state.status === 'roasting'
  const c = state.current
  return (
    <div className={`${CARD} flex items-stretch gap-2 overflow-x-auto p-1.5 ${enabled ? '' : 'opacity-60'}`}>
      <ControlBlock kind="gas" label="Plyn" presets={GAS_PRESETS} value={c.gas} plan={plan?.gas} showPlan={!!plan} enabled={enabled} keys="↑ ↓" />
      <ControlBlock kind="air" label="Vzduch" presets={AIR_PRESETS} value={c.air} plan={plan?.air} showPlan={!!plan} enabled={enabled} keys="1–5" />
      <div className="flex shrink-0 flex-col justify-center gap-1 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5" title="Rychlost bubnu (%) · klávesy [ ]">
        <div className="flex items-center gap-2">
          <span className="label-caps">Buben</span>
          <select
            value={c.drum}
            disabled={!enabled}
            onChange={(e) => roast.setControl('drum', Number(e.target.value))}
            className="h-9 rounded-md bg-[var(--c-surface)] px-2 text-base font-semibold tabular-nums text-zinc-100 outline-none focus:ring-2 focus:ring-[var(--c-accent-ring)]"
          >
            {DRUM_VALUES.map((v) => (
              <option key={v} value={v}>
                {v} %
              </option>
            ))}
          </select>
        </div>
        {plan && <PlanLine kind="drum" plan={plan.drum} current={c.drum} enabled={enabled} />}
      </div>
    </div>
  )
}

function ControlBlock(props: {
  kind: ControlKind
  label: string
  presets: number[]
  value: number
  plan?: { value: number; inSec: number | null } | null
  showPlan: boolean
  enabled: boolean
  keys: string
}) {
  const { kind, value, enabled } = props
  const step = CONTROL_LIMITS[kind].step
  const due = !!props.plan && props.plan.inSec !== null && props.plan.inSec <= PLAN_DUE_SEC && props.plan.value !== value
  const stepBtn = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] text-lg font-bold text-zinc-200 hover:bg-[var(--c-active)] disabled:opacity-40'
  return (
    <div
      className={`flex min-w-0 flex-col justify-center gap-1 rounded-lg border bg-[var(--c-bg)] px-2.5 py-1.5 transition-colors ${due ? 'border-amber-400' : 'border-[var(--c-border)]'}`}
      title={`${props.label} (${CONTROL_UNIT[kind]}) · klávesy ${props.keys}`}
    >
      <div className="flex items-center gap-2">
        <span className="label-caps w-11 shrink-0">{props.label}</span>
        <button className={stepBtn} disabled={!enabled} onClick={() => roast.setControl(kind, value - step)} aria-label={`${props.label} méně`}>
          −
        </button>
        <span className="flex min-w-[4.75rem] items-baseline justify-center gap-1">
          <span className="h-3 w-1.5 self-center rounded-full" style={{ background: shade(kind, value) }} />
          <b className="font-num text-2xl leading-none text-zinc-100">{formatControl(kind, value)}</b>
          <span className="text-xs text-zinc-500">{CONTROL_UNIT[kind]}</span>
        </span>
        <button className={stepBtn} disabled={!enabled} onClick={() => roast.setControl(kind, value + step)} aria-label={`${props.label} více`}>
          +
        </button>
        <div className="flex gap-px">
          {props.presets.map((v) => {
            const active = value === v
            return (
              <button
                key={v}
                disabled={!enabled}
                onClick={() => roast.setControl(kind, v)}
                style={active ? { background: shade(kind, v), color: textOn(kind, v) } : undefined}
                className={`h-8 min-w-8 rounded-md px-1 text-sm font-semibold tabular-nums transition-colors ${active ? 'ring-2 ring-inset ring-[var(--c-accent)]' : 'text-zinc-300 hover:bg-[var(--c-active)]'}`}
              >
                {formatControl(kind, v)}
              </button>
            )
          })}
        </div>
      </div>
      {props.showPlan && <PlanLine kind={kind} plan={props.plan} current={value} enabled={enabled} />}
    </div>
  )
}

/** "plán: 4,0 za 0:35" – the reference's next value; amber and pulsing shortly before it is due, click to take it. */
function PlanLine({ kind, plan, current, enabled }: { kind: ControlKind; plan?: { value: number; inSec: number | null } | null; current: number; enabled: boolean }) {
  if (!plan) return <span className="pl-14 text-[0.6875rem] text-zinc-600">plán: beze změny</span>
  const done = plan.value === current
  const due = plan.inSec !== null && plan.inSec <= PLAN_DUE_SEC && !done
  const when = plan.inSec === null ? 'na start' : `za ${fmtTime(plan.inSec)}`
  return (
    <button
      disabled={!enabled || done}
      onClick={() => roast.setControl(kind, plan.value)}
      title={done ? 'Už nastaveno' : 'Kliknutím nastavíš hodnotu z plánu'}
      className={`ml-14 self-start rounded-full px-2 text-[0.6875rem] tabular-nums transition-colors ${
        due ? 'animate-pulse bg-amber-400/20 font-bold text-amber-300' : done ? 'text-zinc-500' : 'text-zinc-400 hover:bg-[var(--c-active)] hover:text-zinc-100'
      }`}
    >
      plán: <b>{formatControl(kind, plan.value)} {CONTROL_UNIT[kind]}</b> {when}
      {done && ' ✓'}
    </button>
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
        <p className="label-caps">Vyhodnocení pražení</p>
        <h2 className="font-brand text-xl">{state.coffee || 'Bez názvu'}</h2>
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
            className="rounded-lg bg-[var(--c-bg)] px-3 py-2 text-base tabular-nums outline-none focus:ring-2 focus:ring-[var(--c-accent-ring)]"
          />
        </label>
      </div>
      <div className="flex flex-col gap-1 text-xs text-zinc-400">
        Hodnocení
        <div className="flex gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => roast.update({ rating: state.rating === n ? null : n })}
              className={`h-8 flex-1 rounded-lg text-sm font-semibold ${
 state.rating !== null && n <= state.rating ? 'bg-amber-400 text-amber-950' : 'bg-[var(--c-bg)] text-zinc-400 hover:text-zinc-100'
 }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Poznámky
        <textarea
          value={state.notes}
          onChange={(e) => roast.update({ notes: e.target.value })}
          rows={3}
          className="rounded-lg bg-[var(--c-bg)] px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-[var(--c-accent-ring)]"
        />
      </label>
      {state.source !== 'replay' && <SuggestedProfileSave state={state} />}
      <div className="mt-auto flex gap-2">
        <ClayButton variant="primary" onClick={() => roast.newRoast()} className="flex-1">
          Nové pražení
        </ClayButton>
        {state.savedId && (
          <ClayButton onClick={() => (location.hash = `#/historie/${state.savedId}`)}>Detail v historii</ClayButton>
        )}
      </div>
      <div className="flex gap-2">
        {state.source !== 'replay' && <UpdateProfileButton reference={state.reference} roastId={state.savedId} className="flex-1" />}
        {state.source !== 'replay' && <SaveNewProfileButton roastId={state.savedId} coffee={state.coffee} className="flex-1" />}
      </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--c-bg)] px-2 py-2">
      <div className="label-caps">{label}</div>
      <div className="font-num text-xl">{value}</div>
    </div>
  )
}
