import { useRef, useState } from 'react'
import type { ConnectionState } from '../roaster/RoasterConnection'
import {
  connectRoaster,
  disconnectRoaster,
  startReplay,
  stopReplay,
  useConnectionState,
  useLive,
} from '../live/runtime'
import { CURVE_COLORS, LiveChart, fmtTime } from '../ui/LiveChart'
import { ClayButton } from '../ui/clay'

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
  const [follow, setFollow] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const supported = 'serial' in navigator

  const bt = lastValue(snap.bt)
  const et = lastValue(snap.et)
  const ror = lastValue(snap.ror)
  const elapsed = snap.t.length ? snap.t[snap.t.length - 1] : null
  const isReplay = snap.source === 'replay'
  const stale = conn === 'reconnecting' && snap.source === 'roaster'

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
      {/* top bar */}
      <header className="flex items-center gap-3">
        <h1 className="mr-2 text-lg font-semibold tracking-tight">Coffee Roasting Studio</h1>
        <div className="flex items-center gap-2 rounded-full bg-[#22242c] px-3 py-1.5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_6px_16px_rgba(0,0,0,.35)]">
          <span className={`h-2.5 w-2.5 rounded-full ${STATE[conn].dot}`} />
          {STATE[conn].label}
        </div>
        {error && <span className="text-sm text-rose-300">{error}</span>}
        <div className="ml-auto flex items-center gap-2">
          {conn === 'idle' ? (
            <ClayButton variant="primary" onClick={run(connectRoaster)} disabled={!supported}>
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
          <a href="#/diagnostika" className="px-2 text-sm text-zinc-400 hover:text-zinc-200">
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

      {isReplay && (
        <div className="rounded-2xl bg-amber-400/15 px-4 py-2 text-center text-sm font-semibold text-amber-200 ring-1 ring-amber-400/40">
          PŘEHRÁVÁNÍ ZÁZNAMU „{snap.sourceLabel}“ – nejsou to živá data z pražičky
        </div>
      )}
      {!supported && (
        <div className="rounded-2xl bg-rose-500/15 px-4 py-2 text-sm text-rose-200 ring-1 ring-rose-400/40">
          Tento prohlížeč neumí Web Serial. Použij Google Chrome.
        </div>
      )}

      {/* big readouts */}
      <div className={`grid grid-cols-4 gap-3 ${stale ? 'opacity-50' : ''}`}>
        <Readout label="BT" value={bt} unit="°C" color={CURVE_COLORS.bt} />
        <Readout label="ET" value={et} unit="°C" color={CURVE_COLORS.et} />
        <Readout label="RoR" value={ror} unit="°C/min" color={CURVE_COLORS.ror} />
        <Readout label="Čas záznamu" text={elapsed === null ? '—' : fmtTime(elapsed)} color="#e5e7eb" />
      </div>

      {/* chart */}
      <div className="relative min-h-0 flex-1 rounded-3xl bg-[#1b1d23] p-3 shadow-[inset_0_2px_10px_rgba(0,0,0,.45)]">
        <LiveChart snap={snap} follow={follow} onFollowChange={setFollow} />
        {!follow && (
          <ClayButton className="absolute right-6 top-5" onClick={() => setFollow(true)}>
            Sledovat živě
          </ClayButton>
        )}
        {snap.t.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-zinc-500">
            Připoj pražičku. Graf se začne kreslit s prvním měřením.
          </p>
        )}
      </div>
      <p className="text-center text-xs text-zinc-500">
        Pouze čtení teplot · tažení = přiblížit · kolečko = zoom · vodorovné posunutí = posun · dvojklik = živý pohled
      </p>
    </div>
  )
}

function Readout(props: { label: string; value?: number | null; text?: string; unit?: string; color: string }) {
  const display = props.text ?? (props.value == null ? '—' : props.value.toFixed(1))
  return (
    <div className="rounded-3xl bg-[#1f2128] px-5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.05),inset_0_-2px_6px_rgba(0,0,0,.35),0_10px_24px_rgba(0,0,0,.35)]">
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
