// App-wide singletons: the roaster connection and the live buffer survive screen changes.
import { useSyncExternalStore } from 'react'
import { parseAlog } from '../io/alog'
import { RoasterConnection, type ConnectionState } from '../roaster/RoasterConnection'
import { LiveSession } from './LiveSession'
import { RoastStore, useRoast } from './roastStore'
import { createStore } from '../storage/store'

export const SAMPLE_INTERVAL_MS = 1000 // curve / recording cadence (algorithms validated at this rate)
/** The roaster is polled 4× a second so the BT/ET numbers follow its display almost 1:1 (S0: median latency 61 ms, max ~200 ms). */
export const POLL_INTERVAL_MS = 250

/** Latest reading straight from the roaster (every poll) – for the big numbers only. */
export const liveReading = createStore({ at: 0, bt: null as number | null, et: null as number | null })
let lastRecordedAt = 0

export const session = new LiveSession()
export const roast = new RoastStore(session)
export const useRoastState = () => useRoast(roast)

// ── connection state store ──
let connState: ConnectionState = 'idle'
let connLog: string[] = []
const connListeners = new Set<() => void>()
const emitConn = () => connListeners.forEach((l) => l())

let connection: RoasterConnection | null = null

function getConnection(): RoasterConnection {
  if (!connection) {
    connection = new RoasterConnection({
      intervalMs: POLL_INTERVAL_MS,
      timeoutMs: 1000,
      onSample: (s) => {
        liveReading.set({ at: s.at, bt: s.bt, et: s.et })
        // the curve keeps a steady 1 s cadence (tolerance for poll jitter)
        if (s.at - lastRecordedAt >= SAMPLE_INTERVAL_MS - 150) {
          lastRecordedAt = s.at
          session.add(s.at, s.bt, s.et)
        }
      },
      onState: (s) => {
        connState = s
        emitConn()
        void keepAwake(s !== 'idle')
      },
      onStats: () => {},
      onLog: (m) => {
        connLog = [`${new Date().toLocaleTimeString('cs-CZ')}  ${m}`, ...connLog].slice(0, 100)
        emitConn()
      },
    })
  }
  return connection
}

export function useConnectionState() {
  return useSyncExternalStore(
    (fn) => (connListeners.add(fn), () => connListeners.delete(fn)),
    () => connState,
  )
}

export function useLive() {
  return useSyncExternalStore(session.subscribe, session.getSnapshot)
}

export async function connectRoaster() {
  stopReplay()
  if (session.getSnapshot().source === 'replay') roast.newRoast()
  // keep data of a roast in progress across a manual reconnect
  if (roast.getSnapshot().status !== 'roasting') session.reset('roaster', 'Dongyi BR-3.5', SAMPLE_INTERVAL_MS)
  await getConnection().connect()
}

export async function disconnectRoaster() {
  await connection?.disconnect()
}

// ── replay of a recorded Artisan roast (clearly labelled, never treated as live data) ──
let replayTimer: ReturnType<typeof setInterval> | null = null

export function stopReplay() {
  if (replayTimer) clearInterval(replayTimer)
  replayTimer = null
}

export async function startReplay(file: File, speed = 10) {
  if (connState !== 'idle') await disconnectRoaster()
  stopReplay()
  const a = parseAlog(await file.text())
  const intervalMs = Math.round((a.samplingInterval || 2) * 1000)
  session.reset('replay', file.name, intervalMs)
  roast.newRoast()
  const kg = a.weightUnit.toLowerCase().startsWith('k') ? 1000 : 1
  roast.start({ coffee: file.name.replace(/\.alog$/i, ''), greenWeightG: a.greenWeight ? a.greenWeight * kg : null })
  let i = 0
  replayTimer = setInterval(() => {
    if (i >= a.t.length) return stopReplay()
    session.add(a.t[i] * 1000, a.bt[i], a.et[i])
    i++
  }, intervalMs / speed)
}

// development only: lets automated UI checks drive the live buffer (never in the deployed app)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  Object.assign(window, { __roastingDev: { session, roast } })
}

// ── screen wake lock while the roaster is connected ──
type WakeLock = { release(): Promise<void> }
let wakeLock: WakeLock | null = null
let wantAwake = false

async function keepAwake(on: boolean) {
  wantAwake = on
  const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLock> } }).wakeLock
  if (!wl) return
  try {
    if (on && !wakeLock) wakeLock = await wl.request('screen')
    if (!on && wakeLock) {
      await wakeLock.release()
      wakeLock = null
    }
  } catch {
    wakeLock = null // e.g. tab not visible – retried when it becomes visible
  }
}

if (typeof document !== 'undefined') {
  // the browser drops the lock when the tab is hidden → take it again when it comes back
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wantAwake) {
      wakeLock = null
      void keepAwake(true)
    }
  })
}
