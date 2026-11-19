import { useEffect, useRef, useState } from 'react'
import { beepStep, chargeAlertLevel, secondsToCharge, type ChargeAlertLevel } from '../domain/chargeAlert'
import { fmtTime } from './LiveChart'
import { roast } from '../live/runtime'
import { askText } from './dialog'

const SOUND_KEY = 'chargeAlertSound'
const soundOn = () => {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

let audio: AudioContext | null = null
/** Three short beeps (no audio file needed). */
function beep() {
  try {
    audio ??= new AudioContext()
    const t0 = audio.currentTime + 0.02
    for (let i = 0; i < 3; i++) {
      const o = audio.createOscillator()
      const g = audio.createGain()
      o.frequency.value = 1046
      g.gain.setValueAtTime(0.0001, t0 + i * 0.22)
      g.gain.exponentialRampToValueAtTime(0.35, t0 + i * 0.22 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.22 + 0.16)
      o.connect(g).connect(audio.destination)
      o.start(t0 + i * 0.22)
      o.stop(t0 + i * 0.22 + 0.18)
    }
  } catch {
    /* audio not available */
  }
}

const STYLE: Record<ChargeAlertLevel, string> = {
  idle: 'bg-[var(--c-surface)] text-zinc-300',
  heating: 'bg-[var(--c-surface)] text-zinc-300',
  near: 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/50',
  ready: 'glow-ready bg-emerald-500/20 text-emerald-200 ring-2 ring-emerald-400',
  over: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/60',
}

/**
 * Preheat helper: shows how far BT is from the charge temperature, turns green and beeps when
 * it is reached. Target = manual value, otherwise the reference's CHARGE BT.
 */
export function ChargeAlert({ bt, target, fromReference, ror }: { bt: number | null; target: number | null; fromReference: boolean; ror: number | null }) {
  const level = chargeAlertLevel(bt, target)
  const armed = useRef(true)
  const [sound, setSound] = useState(soundOn)

  useEffect(() => {
    const r = beepStep(armed.current, level)
    armed.current = r.armed
    if (r.beep && sound) beep()
  }, [level, sound])

  const edit = async () => {
    const v = await askText('Teplota vhozu (BT, °C)', target?.toFixed(0) ?? '', {
      message: fromReference || target === null ? 'Prázdné = podle referenčního profilu.' : undefined,
      okLabel: 'Nastavit',
    })
    if (v === null) return
    const n = Number(v.replace(',', '.'))
    roast.update({ chargeTarget: v.trim() === '' || !Number.isFinite(n) ? null : Math.round(n * 10) / 10 })
  }
  const toggleSound = () => {
    const next = !sound
    setSound(next)
    try {
      localStorage.setItem(SOUND_KEY, next ? 'on' : 'off')
    } catch {
      /* not remembered */
    }
    if (next) beep() // also unlocks audio in the browser
  }

  if (target === null)
    return (
      <div className="flex items-center gap-3 rounded-lg bg-[var(--c-surface)] px-4 py-1.5 text-sm text-zinc-400">
        Upozornění na teplotu vhozu:
        <button onClick={() => void edit()} className="font-semibold text-sky-300 underline">
          nastavit teplotu
        </button>
        <span className="text-xs text-zinc-500">(nebo vyber referenční profil)</span>
      </div>
    )

  const diff = bt === null ? null : bt - target
  const eta = secondsToCharge(bt, target, ror)
  const at = eta === null ? '' : new Date(Date.now() + eta * 1000).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
  const etaText = eta === null ? ' · čas zatím nelze odhadnout (BT neroste)' : ` · za ~${fmtTime(eta)} (v ${at})`
  const text =
    level === 'ready'
      ? `VHOĎ KÁVU · BT ${bt!.toFixed(1)} °C`
      : level === 'over'
        ? `Nad teplotou vhozu o ${diff!.toFixed(1)} °C`
        : level === 'near'
          ? `Blíží se teplota vhozu · zbývá ${(-diff!).toFixed(1)} °C${etaText}`
          : bt === null
            ? 'Čekám na data z pražičky'
            : `Nahřívání · do vhozu zbývá ${(-diff!).toFixed(1)} °C${etaText}`

  return (
    <div className={`flex items-center gap-4 rounded-lg px-4 py-1.5 text-sm ${STYLE[level]}`}>
      <span className={level === 'ready' ? 'text-lg font-bold tracking-wide' : 'font-semibold'}>{text}</span>
      <span className="text-zinc-400">
        cíl <b className="text-zinc-100">{target.toFixed(0)} °C</b>
        {fromReference && <span className="text-zinc-500"> (z reference)</span>}
      </span>
      <button onClick={() => void edit()} className="text-xs text-zinc-400 underline hover:text-zinc-100">
        změnit
      </button>
      <button onClick={toggleSound} className="ml-auto rounded-lg px-2 py-0.5 text-xs text-zinc-300 hover:bg-white/10" title="Zvuk při dosažení teploty vhozu">
        {sound ? '🔔 zvuk zapnutý' : '🔕 zvuk vypnutý'}
      </button>
    </div>
  )
}
