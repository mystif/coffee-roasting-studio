import { useEffect, useRef, useState } from 'react'
import { EVENT_LABEL, findEvent, nextExpected, type EventType, type RoastEvent } from '../domain/events'
import { PHASE_COLOR, PHASE_LABEL, currentPhase, phaseStats } from '../domain/phases'
import { AIR_PRESETS, CONTROL_LIMITS, type RoastState } from '../live/roastStore'
import { roast } from '../live/runtime'
import { ClayButton } from './clay'
import { fmtTime } from './LiveChart'
import { SaveStatus } from './storageUi'

const CARD =
  'rounded-3xl bg-[#1f2128] shadow-[inset_0_1px_0_rgba(255,255,255,.05),inset_0_-2px_6px_rgba(0,0,0,.35),0_10px_24px_rgba(0,0,0,.35)]'

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
    <div className={`${CARD} flex w-60 shrink-0 flex-col gap-2 p-3`}>
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
              className={`w-full rounded-2xl px-3 py-2.5 text-left transition active:translate-y-px disabled:opacity-40 ${
                isNext
                  ? 'bg-gradient-to-b from-sky-400 to-sky-600 text-sky-950 ring-2 ring-sky-300/50'
                  : e
                    ? 'bg-[#262a33] text-zinc-100'
                    : 'bg-[#2a2d36] text-zinc-200'
              } shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_6px_14px_rgba(0,0,0,.35)]`}
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
          className="rounded-2xl bg-[#16171d] px-3 py-2 text-sm outline-none ring-1 ring-zinc-600 focus:ring-sky-400"
        />
      )}
    </div>
  )
}

// ── phase strip ────────────────────────────────────────────

export function PhaseStrip({ state, now }: { state: RoastState; now: number | null }) {
  const stats = now === null ? null : phaseStats(state.events, now)
  const phase = currentPhase(state.events)
  const fcs = findEvent(state.events, 'FCs')
  const drop = findEvent(state.events, 'DROP')
  const sinceFc = fcs && now !== null ? (drop?.t ?? now) - fcs.t : null
  const seg = (name: 'drying' | 'maillard' | 'development', sec: number | null, pct: number | null) => (
    <div
      className="flex min-w-0 items-center justify-between gap-2 rounded-xl px-3 py-1.5"
      style={{
        flexGrow: Math.max(pct ?? 0, 8),
        background: PHASE_COLOR[name] + (phase === name ? '33' : '1a'),
        boxShadow: phase === name ? `inset 0 0 0 1.5px ${PHASE_COLOR[name]}` : undefined,
      }}
    >
      <span className="truncate text-xs font-semibold" style={{ color: PHASE_COLOR[name] }}>
        {PHASE_LABEL[name]}
      </span>
      <span className="text-sm font-semibold tabular-nums text-zinc-100">
        {sec == null ? '—' : fmtTime(sec)} <span className="text-zinc-400">{pct == null ? '' : `${pct.toFixed(0)} %`}</span>
      </span>
    </div>
  )
  return (
    <div className={`${CARD} flex items-center gap-3 px-3 py-2`}>
      <div className="flex min-w-0 flex-1 gap-1.5">
        {seg('drying', stats?.drying ?? null, stats?.dryingPct ?? null)}
        {seg('maillard', stats?.maillard ?? null, stats?.maillardPct ?? null)}
        {seg('development', stats?.development ?? null, stats?.developmentPct ?? null)}
      </div>
      <Mini label="od FC" value={sinceFc === null ? '—' : fmtTime(sinceFc)} />
      <Mini label="DTR" value={stats?.dtr == null ? '—' : `${stats.dtr.toFixed(1)} %`} />
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="w-24 text-right">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

// ── start bar (before roasting) ────────────────────────────

export function StartBar({ state, canStart }: { state: RoastState; canStart: boolean }) {
  const [coffee, setCoffee] = useState(state.coffee)
  const [weight, setWeight] = useState(kg(state.greenWeightG))
  const start = () => roast.start({ coffee: coffee.trim(), greenWeightG: parseKg(weight) })
  return (
    <div className={`${CARD} flex items-end gap-4 px-5 py-3`}>
      <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-400">
        Káva
        <input
          value={coffee}
          onChange={(e) => setCoffee(e.target.value)}
          placeholder="např. Colombia Huila"
          className="rounded-xl bg-[#16171d] px-3 py-2 text-base text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-400"
        />
      </label>
      <label className="flex w-40 flex-col gap-1 text-xs text-zinc-400">
        Zelená káva (kg)
        <input
          value={weight}
          inputMode="decimal"
          onChange={(e) => setWeight(e.target.value)}
          placeholder="3,0"
          className="rounded-xl bg-[#16171d] px-3 py-2 text-base tabular-nums text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-400"
        />
      </label>
      <ClayButton variant="primary" onClick={start} disabled={!canStart} className="px-8 py-3 text-base">
        Start Roasting
      </ClayButton>
    </div>
  )
}

// ── manual control log (gas / air / drum) ──────────────────

export function ControlsBar({ state }: { state: RoastState }) {
  const enabled = state.status === 'roasting'
  const c = state.current
  return (
    <div className={`${CARD} flex items-center gap-6 px-5 py-3 ${enabled ? '' : 'opacity-50'}`}>
      <span className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-zinc-500">
        Ruční
        <br />
        záznam
      </span>
      <Stepper label="Plyn" unit="kPa" value={c.gas} kind="gas" enabled={enabled} hint="↑ ↓" />
      <div className="flex flex-col gap-1">
        <span className="text-xs text-zinc-400">
          Vzduch (Hot Air) <span className="text-zinc-600">1–5</span>
        </span>
        <div className="flex gap-1 rounded-2xl bg-[#16171d] p-1">
          {AIR_PRESETS.map((p) => (
            <button
              key={p}
              disabled={!enabled}
              onClick={() => roast.setControl('air', p)}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold tabular-nums ${
                c.air === p ? 'bg-sky-500 text-sky-950' : 'text-zinc-300 hover:bg-white/5'
              }`}
            >
              {p} %
            </button>
          ))}
        </div>
      </div>
      <Stepper label="Buben" unit="%" value={c.drum} kind="drum" enabled={enabled} hint="[ ]" />
    </div>
  )
}

function Stepper(props: { label: string; unit: string; value: number; kind: 'gas' | 'drum'; enabled: boolean; hint: string }) {
  const step = CONTROL_LIMITS[props.kind].step
  const btn = 'h-9 w-9 rounded-xl bg-[#2a2d36] text-lg font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,.15),0_4px_10px_rgba(0,0,0,.35)] active:translate-y-px'
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
    <div className={`${CARD} absolute right-4 top-4 bottom-4 z-10 flex w-96 flex-col gap-4 overflow-auto bg-[#1f2128]/95 p-5`}>
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
                <td className="py-0.5 font-semibold" style={{ color: PHASE_COLOR[k] }}>
                  {PHASE_LABEL[k]}
                </td>
                <td className="text-right tabular-nums">{sec == null ? '—' : fmtTime(sec)}</td>
                <td className="text-right tabular-nums text-zinc-400">{pct == null ? '' : `${pct.toFixed(1)} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
            inputMode="decimal"
            onChange={(e) => {
              setRoasted(e.target.value)
              roast.update({ roastedWeightG: parseKg(e.target.value) })
            }}
            placeholder="2,55"
            className="rounded-xl bg-[#16171d] px-3 py-2 text-base tabular-nums outline-none ring-1 ring-zinc-700 focus:ring-sky-400"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Poznámky
        <textarea
          value={state.notes}
          onChange={(e) => roast.update({ notes: e.target.value })}
          rows={3}
          className="rounded-xl bg-[#16171d] px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-400"
        />
      </label>
      <ClayButton variant="primary" onClick={() => roast.newRoast()}>
        Nové pražení
      </ClayButton>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#16171d] px-2 py-2">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}
