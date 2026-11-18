import { useEffect, useMemo, useRef, useState } from 'react'
import { findEvent, nextExpected } from '../domain/events'
import { PHASE_COLOR, currentPhase, dtrTarget } from '../domain/phases'
import { TREND_ARROW, trendOf, type Trend } from '../domain/trend'
import { useTween } from '../ui/useTween'
import { AIR_PRESETS, CONTROL_LIMITS } from '../live/roastStore'
import type { ConnectionState } from '../roaster/RoasterConnection'
import { connectRoaster, disconnectRoaster, liveReading, roast, startReplay, stopReplay, useConnectionState, useLive, useRoastState } from '../live/runtime'
import { CURVE_COLORS, LiveChart, fmtTime, type ChartOverlay } from '../ui/LiveChart'
import { ClayButton } from '../ui/clay'
import { ControlsBar, EventPanel, PhaseStrip, StartBar, SummaryPanel } from '../ui/roastPanels'
import { referenceState } from '../live/referenceState'
import { estimates, useFcTarget } from '../live/estimates'
import { MoreMenu, NavTabs } from '../ui/nav'
import { DELETE, askNote } from '../ui/dialog'
import { ChargeAlert } from '../ui/ChargeAlert'
import { DisplayToggle, ThemeToggle } from '../ui/theme'
import { BackupChip, PersistError, RestoredBanner, UpdateToast } from '../ui/storageUi'

const STATE: Record<ConnectionState, { label: string; dot: string }> = {
  idle: { label: 'Nepřipojeno', dot: 'bg-zinc-500' },
  connecting: { label: 'Připojuji…', dot: 'bg-amber-400' },
  connected: { label: 'Pražička připojena', dot: 'bg-emerald-400' },
  reconnecting: {
    label: 'Obnovuji spojení…',
    dot: 'bg-amber-400 animate-pulse',
  },
}

const lastValue = (a: (number | null)[]) => {
  for (let i = a.length - 1; i >= 0 && i >= a.length - 3; i--) if (a[i] !== null) return a[i]
  return null
}

export function LiveScreen() {
  const conn = useConnectionState()
  const snap = useLive()
  const state = useRoastState()
  const [follow, setFollow] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const supported = 'serial' in navigator

  // big numbers: the fastest reading straight from the roaster (2× per second) when connected
  const fast = liveReading.use()
  const fresh = snap.source === 'roaster' && conn === 'connected' && Date.now() - fast.at < 3000
  const bt = fresh && fast.bt !== null ? fast.bt : lastValue(snap.bt)
  const et = fresh && fast.et !== null ? fast.et : lastValue(snap.et)
  const ror = lastValue(snap.ror)
  const now = snap.t.length ? snap.t[snap.t.length - 1] : null
  const isReplay = snap.source === 'replay'
  const stale = conn === 'reconnecting' && snap.source === 'roaster'
  const charge = findEvent(state.events, 'CHARGE')
  const drop = findEvent(state.events, 'DROP')
  const roastTime = now === null ? null : charge ? (drop?.t ?? now) - charge.t : state.startT !== null ? now - state.startT : null

  const ref = referenceState.use()
  const dtrGoal = useMemo(() => dtrTarget(ref.curve?.events), [ref.curve])
  // small ↑ ↓ → next to the big numbers: change over the last 30 s
  const btTrend = trendOf(snap.t, snap.bt, 30, 0.3)
  const rorTrend = trendOf(snap.t, snap.ror, 30, 0.5)
  // chart frame in the colour of the running phase (visible from the roaster)
  const phase = state.status === 'roasting' ? currentPhase(state.events) : 'pre'
  const frame = phase === 'drying' || phase === 'maillard' || phase === 'development' ? `inset 0 0 0 2px ${PHASE_COLOR[phase]}aa` : undefined
  const refChargeBT = ref.curve ? (findEvent(ref.curve.events, 'CHARGE')?.bt ?? null) : null
  const fcTarget = useFcTarget(state, ref.curve)
  const est = useMemo(() => estimates(snap, state, fcTarget), [snap, state, fcTarget.target, fcTarget.basis]) // eslint-disable-line react-hooks/exhaustive-deps
  const overlay: ChartOverlay = useMemo(
    () => ({
      events: state.events,
      controls: state.controls,
      chargeT: charge?.t ?? null,
      now,
      reference: ref.curve,
      previewAt: now ?? 0,
      estimates: est,
    }),
    [state.events, state.controls, charge?.t, now, ref.curve, est],
  )

  useKeyboardShortcuts()

  // notes clicked on the BT curve
  const noteTitle = (t: number) => {
    const i = snap.t.findIndex((x) => x >= t)
    const btAt = i >= 0 ? snap.bt[i] : null
    return `${charge ? fmtTime(t - charge.t) : fmtTime(t)}${btAt != null ? ` · ${btAt.toFixed(1)} °C` : ''}`
  }
  const addNote = async (t: number) => {
    const text = await askNote(`Poznámka v ${noteTitle(t)}`, '', {
      message: 'Uloží se do pražení na toto místo křivky BT.',
    })
    if (text && text !== DELETE) roast.addNoteAt(t, text)
  }
  const editNote = async (id: string) => {
    const e = state.events.find((x) => x.id === id)
    if (!e) return
    const text = await askNote(`Poznámka v ${noteTitle(e.t)}`, e.note ?? '', {
      allowDelete: true,
    })
    if (text === DELETE) roast.removeEvent(id)
    else if (text) roast.updateNote(id, text)
  }

  const run = (fn: () => Promise<void>) => async () => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/No port selected/i.test(msg)) setError(msg)
    }
  }

  return (
    <div className="flex h-screen flex-col gap-2 bg-[var(--c-bg)] p-2.5 text-zinc-100">
      <header className="flex items-center gap-2">
        <img src="./icon.svg" alt="Roasting Studio" className="h-6 w-6 shrink-0" />
        <NavTabs />
        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-[var(--c-chip)] px-2.5 py-1 text-xs border border-[var(--c-border)]">
          <span className={`h-2.5 w-2.5 rounded-full ${STATE[conn].dot}`} />
          {STATE[conn].label}
        </div>
        {state.status !== 'ready' && (
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-300" title={state.coffee}>
            {state.coffee || 'Bez názvu'}
            {state.greenWeightG ? ` · ${String(state.greenWeightG / 1000).replace('.', ',')} kg` : ''}
          </span>
        )}
        {error && <span className="text-sm text-rose-300">{error}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
          <BackupChip />
          <DisplayToggle />
          <ThemeToggle />
          {state.status === 'roasting' && (
            <ClayButton variant="danger" onClick={() => roast.finish()} size="sm" title="Ukončí pražení (přidá Drop, pokud chybí)">
              Finish
            </ClayButton>
          )}
          {conn === 'idle' ? (
            <ClayButton size="sm" variant={state.status === 'roasting' ? 'default' : 'primary'} onClick={run(connectRoaster)} disabled={!supported}>
              Připojit pražičku
            </ClayButton>
          ) : (
            <ClayButton size="sm" onClick={run(disconnectRoaster)}>
              Odpojit
            </ClayButton>
          )}
          {isReplay ? (
            <ClayButton size="sm" onClick={() => stopReplay()}>
              Zastavit přehrávání
            </ClayButton>
          ) : (
            <MoreMenu
              items={[
                {
                  label: 'Přehrát záznam .alog',
                  hint: 'jen pro vyzkoušení – nejsou to živá data',
                  onClick: () => fileInput.current?.click(),
                },
                {
                  label: 'Diagnostika připojení',
                  onClick: () => (location.hash = '#/diagnostika'),
                },
              ]}
            />
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".alog"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void run(() => startReplay(f))()
              e.target.value = ''
            }}
          />
        </div>
      </header>

      <UpdateToast roasting={state.status === 'roasting'} />
      <RestoredBanner />
      <PersistError />
      {isReplay && (
        <div className="rounded-lg bg-amber-400/15 px-4 py-1.5 text-center text-sm font-semibold text-amber-200 ring-1 ring-amber-400/40">
          PŘEHRÁVÁNÍ ZÁZNAMU „{snap.sourceLabel}“ – nejsou to živá data z pražičky
        </div>
      )}
      {!supported && (
        <div className="rounded-lg bg-rose-500/15 px-4 py-2 text-sm text-rose-200 ring-1 ring-rose-400/40">Tento prohlížeč neumí Web Serial. Použij Google Chrome.</div>
      )}

      {!charge && state.status !== 'finished' && snap.source !== 'replay' && (state.chargeTarget !== null || ref.curve || conn !== 'idle') && (
        <ChargeAlert bt={bt} target={state.chargeTarget ?? refChargeBT} fromReference={state.chargeTarget === null && refChargeBT !== null} ror={ror} />
      )}

      {ref.missing && <p className="text-xs text-amber-300">Vybraná reference už neexistuje.</p>}

      <div className="flex min-h-0 flex-1 gap-3">
        <div
          className="relative flex min-w-0 flex-1 flex-col rounded-lg border border-[var(--chart-border)] bg-[var(--c-chart)] p-3 pt-2 transition-shadow duration-700"
          style={{ boxShadow: frame }}
        >
          <PhaseStrip state={state} now={now} est={est} dtrGoal={dtrGoal} />
          <div className="relative min-h-0 flex-1">
            {/* roastery logo as a faint watermark behind the curves */}
            <img
              src="./chart-logo.svg"
              alt=""
              aria-hidden
              draggable={false}
              className="pointer-events-none absolute inset-x-[8%] inset-y-[10%] h-[80%] w-[84%] select-none object-contain"
              style={{ opacity: 'var(--chart-logo-opacity)' }}
            />
            <div className="relative h-full">
              <LiveChart
                snap={snap}
                overlay={overlay}
                follow={follow}
                onFollowChange={setFollow}
                onBtClick={state.status === 'roasting' ? (t) => void addNote(t) : undefined}
                onNoteClick={state.status === 'roasting' ? (id) => void editNote(id) : undefined}
              />
            </div>
          </div>
          {!follow && state.status !== 'finished' && (
            <ClayButton className="absolute right-6 top-14" onClick={() => setFollow(true)}>
              Sledovat živě
            </ClayButton>
          )}
          {snap.t.length === 0 && !ref.curve && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-zinc-500">Připoj pražičku. Graf se začne kreslit s prvním měřením.</p>
          )}
          {ref.curve && !charge && (
            <p className="pointer-events-none absolute left-16 top-14 rounded-lg bg-[var(--c-chart)]/90 px-2 py-1 text-xs text-zinc-400">
              Náhled reference – čas 0:00 = Charge. Po Charge se křivky zarovnají a začne porovnávání.
            </p>
          )}
          {state.status === 'finished' && <SummaryPanel state={state} />}
        </div>
        <div className="flex w-52 shrink-0 flex-col gap-1.5">
          <div className={`grid grid-cols-2 gap-1.5 ${stale ? 'opacity-50' : ''}`}>
            <Readout label="BT" value={bt} unit="°C" color={CURVE_COLORS.bt} trend={btTrend} />
            <Readout label="ET" value={et} unit="°C" color={CURVE_COLORS.et} />
            <Readout label="RoR" value={ror} unit="°C/min" color={CURVE_COLORS.ror} trend={rorTrend} />
            <Readout label={charge ? 'Čas' : 'Před Charge'} text={roastTime === null ? '—' : fmtTime(roastTime)} color="var(--color-zinc-100)" />
          </div>
          <EventPanel state={state} />
        </div>
      </div>

      {state.status === 'ready' ? (
        <StartBar state={state} canStart={snap.t.length > 0} />
      ) : (
        <ControlsBar state={state} batchSec={state.startT !== null && now !== null ? (drop?.t ?? now) - state.startT : null} />
      )}
    </div>
  )
}

/** Space = next event, ↑/↓ gas, 1–5 air presets, [ ] drum, ⌘Z undo. Ignored while typing. */
function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return
      const s = roast.getSnapshot()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        return roast.undo()
      }
      if (s.status !== 'roasting' || e.metaKey || e.ctrlKey || e.altKey) return
      const gasStep = CONTROL_LIMITS.gas.step
      const drumStep = CONTROL_LIMITS.drum.step
      if (e.code === 'Space') {
        e.preventDefault()
        const next = nextExpected(s.events)
        if (next) roast.mark(next)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        roast.setControl('gas', s.current.gas + gasStep)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        roast.setControl('gas', s.current.gas - gasStep)
      } else if (/^[1-5]$/.test(e.key)) {
        roast.setControl('air', AIR_PRESETS[Number(e.key) - 1])
      } else if (e.key === ']') {
        roast.setControl('drum', s.current.drum + drumStep)
      } else if (e.key === '[') {
        roast.setControl('drum', s.current.drum - drumStep)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function Readout(props: { label: string; value?: number | null; text?: string; unit?: string; color: string; trend?: Trend | null }) {
  const v = useTween(props.value ?? null) // numbers glide to the new value instead of jumping
  const display = props.text ?? (v == null ? '—' : v.toFixed(1))
  return (
    <div className="rounded-xl bg-[var(--c-surface)] px-2 py-1 border border-[var(--c-border)]">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold tracking-wide" style={{ color: props.color }}>
          {props.label}
          {props.trend && (
            <span className="ml-1 text-sm font-bold" title={props.trend === 'up' ? 'roste (posledních 30 s)' : props.trend === 'down' ? 'klesá (posledních 30 s)' : 'stabilní (posledních 30 s)'}>
              {TREND_ARROW[props.trend]}
            </span>
          )}
        </span>
        {props.unit && <span className="text-[0.625rem] text-zinc-500">{props.unit}</span>}
      </div>
      <div className="text-[1.65rem] font-semibold leading-tight tabular-nums tracking-tight" style={{ color: props.color }}>
        {display}
      </div>
    </div>
  )
}
