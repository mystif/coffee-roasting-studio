import { useEffect, useMemo, useRef, useState } from 'react'
import { findEvent, nextExpected } from '../domain/events'
import { AIR_PRESETS, CONTROL_LIMITS } from '../live/roastStore'
import type { ConnectionState } from '../roaster/RoasterConnection'
import {
  connectRoaster,
  disconnectRoaster,
  roast,
  startReplay,
  stopReplay,
  useConnectionState,
  useLive,
  useRoastState,
} from '../live/runtime'
import { CURVE_COLORS, LiveChart, fmtTime, type ChartOverlay } from '../ui/LiveChart'
import { ClayButton } from '../ui/clay'
import { ControlsBar, EventPanel, PhaseStrip, ReferenceStrip, StartBar, SummaryPanel } from '../ui/roastPanels'
import { referenceState } from '../live/referenceState'
import { NavTabs } from '../ui/nav'
import { BackupChip, PersistError, RestoredBanner, UpdateToast } from '../ui/storageUi'

const STATE: Record<ConnectionState, { label: string; dot: string }> = {
  idle: { label: 'Nepřipojeno', dot: 'bg-zinc-500' },
  connecting: { label: 'Připojuji…', dot: 'bg-amber-400' },
  connected: { label: 'Pražička připojena', dot: 'bg-emerald-400' },
  reconnecting: { label: 'Obnovuji spojení…', dot: 'bg-amber-400 animate-pulse' },
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

  const bt = lastValue(snap.bt)
  const et = lastValue(snap.et)
  const ror = lastValue(snap.ror)
  const now = snap.t.length ? snap.t[snap.t.length - 1] : null
  const isReplay = snap.source === 'replay'
  const stale = conn === 'reconnecting' && snap.source === 'roaster'
  const charge = findEvent(state.events, 'CHARGE')
  const drop = findEvent(state.events, 'DROP')
  const roastTime = now === null ? null : charge ? (drop?.t ?? now) - charge.t : state.startT !== null ? now - state.startT : null

  const ref = referenceState.use()
  const overlay: ChartOverlay = useMemo(
    () => ({ events: state.events, controls: state.controls, chargeT: charge?.t ?? null, now, reference: ref.curve }),
    [state.events, state.controls, charge?.t, now, ref.curve],
  )

  useKeyboardShortcuts()

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
    <div className="flex h-screen flex-col gap-3 bg-[#16171d] p-4 text-zinc-100">
      <header className="flex items-center gap-3">
        <img src="./icon.svg" alt="Roasting Studio" className="h-8 w-8 shrink-0" />
        <NavTabs />
        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-[#22242c] px-3 py-1.5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_6px_16px_rgba(0,0,0,.35)]">
          <span className={`h-2.5 w-2.5 rounded-full ${STATE[conn].dot}`} />
          {STATE[conn].label}
        </div>
        {state.status !== 'ready' && (
          <span className="min-w-0 truncate text-sm text-zinc-300">
            {state.coffee || 'Bez názvu'}
            {state.greenWeightG ? ` · ${String(state.greenWeightG / 1000).replace('.', ',')} kg` : ''}
          </span>
        )}
        {error && <span className="text-sm text-rose-300">{error}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
          <BackupChip />
          {state.status === 'roasting' && (
            <ClayButton variant="danger" onClick={() => roast.finish()} title="Ukončí pražení (přidá Drop, pokud chybí)">
              Finish
            </ClayButton>
          )}
          {conn === 'idle' ? (
            <ClayButton variant={state.status === 'roasting' ? 'default' : 'primary'} onClick={run(connectRoaster)} disabled={!supported}>
              Připojit pražičku
            </ClayButton>
          ) : (
            <ClayButton onClick={run(disconnectRoaster)}>Odpojit</ClayButton>
          )}
          <ClayButton
            onClick={() => (isReplay ? stopReplay() : fileInput.current?.click())}
            title="Přehraje uložený záznam z Artisanu – jen pro vyzkoušení, nejsou to živá data"
          >
            {isReplay ? 'Zastavit přehrávání' : 'Přehrát .alog'}
          </ClayButton>
          <a href="#/diagnostika" className="px-2 text-sm text-zinc-500 hover:text-zinc-200">
            Diagnostika
          </a>
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
        <div className="rounded-2xl bg-amber-400/15 px-4 py-1.5 text-center text-sm font-semibold text-amber-200 ring-1 ring-amber-400/40">
          PŘEHRÁVÁNÍ ZÁZNAMU „{snap.sourceLabel}“ – nejsou to živá data z pražičky
        </div>
      )}
      {!supported && (
        <div className="rounded-2xl bg-rose-500/15 px-4 py-2 text-sm text-rose-200 ring-1 ring-rose-400/40">
          Tento prohlížeč neumí Web Serial. Použij Google Chrome.
        </div>
      )}

      <div className={`grid grid-cols-4 gap-3 ${stale ? 'opacity-50' : ''}`}>
        <Readout label="BT" value={bt} unit="°C" color={CURVE_COLORS.bt} />
        <Readout label="ET" value={et} unit="°C" color={CURVE_COLORS.et} />
        <Readout label="RoR" value={ror} unit="°C/min" color={CURVE_COLORS.ror} />
        <Readout
          label={charge ? 'Čas pražení' : 'Čas (před Charge)'}
          text={roastTime === null ? '—' : fmtTime(roastTime)}
          color="#e5e7eb"
        />
      </div>

      <PhaseStrip state={state} now={now} />
      {ref.curve && state.status !== 'finished' && (
        <ReferenceStrip
          curve={ref.curve}
          roastTime={charge && now !== null ? (drop?.t ?? now) - charge.t : null}
          bt={bt}
          ror={ror}
          afterTP={!!findEvent(state.events, 'TP')}
          charged={!!charge}
        />
      )}
      {ref.missing && <p className="text-xs text-amber-300">Vybraná reference už neexistuje.</p>}

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="relative min-w-0 flex-1 rounded-3xl bg-[#1b1d23] p-3 shadow-[inset_0_2px_10px_rgba(0,0,0,.45)]">
          <LiveChart snap={snap} overlay={overlay} follow={follow} onFollowChange={setFollow} />
          {!follow && state.status !== 'finished' && (
            <ClayButton className="absolute right-6 top-5" onClick={() => setFollow(true)}>
              Sledovat živě
            </ClayButton>
          )}
          {snap.t.length === 0 && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-zinc-500">
              Připoj pražičku. Graf se začne kreslit s prvním měřením.
            </p>
          )}
          {state.status === 'finished' && <SummaryPanel state={state} />}
        </div>
        <EventPanel state={state} />
      </div>

      {state.status === 'ready' ? (
        <StartBar state={state} canStart={snap.t.length > 0} />
      ) : (
        <ControlsBar state={state} />
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

function Readout(props: { label: string; value?: number | null; text?: string; unit?: string; color: string }) {
  const display = props.text ?? (props.value == null ? '—' : props.value.toFixed(1))
  return (
    <div className="rounded-3xl bg-[#1f2128] px-5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.05),inset_0_-2px_6px_rgba(0,0,0,.35),0_10px_24px_rgba(0,0,0,.35)]">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold tracking-wide" style={{ color: props.color }}>
          {props.label}
        </span>
        {props.unit && <span className="text-xs text-zinc-500">{props.unit}</span>}
      </div>
      <div className="text-6xl font-semibold leading-tight tabular-nums tracking-tight" style={{ color: props.color }}>
        {display}
      </div>
    </div>
  )
}
