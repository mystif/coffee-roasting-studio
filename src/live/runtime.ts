// App-wide singletons: the roaster connection and the live buffer survive screen changes.
import { useSyncExternalStore } from 'react'
import { parseAlog } from '../io/alog'
import { RoasterConnection, type ConnectionState } from '../roaster/RoasterConnection'
import { LiveSession } from './LiveSession'

export const SAMPLE_INTERVAL_MS = 1000 // verified in S0: median latency 61 ms over Bluetooth

export const session = new LiveSession()

// ── connection state store ──
let connState: ConnectionState = 'idle'
let connLog: string[] = []
const connListeners = new Set<() => void>()
const emitConn = () => connListeners.forEach((l) => l())

let connection: RoasterConnection | null = null

function getConnection(): RoasterConnection {
  if (!connection) {
    connection = new RoasterConnection({
      intervalMs: SAMPLE_INTERVAL_MS,
      timeoutMs: 1000,
      onSample: (s) => session.add(s.at, s.bt, s.et),
      onState: (s) => {
        connState = s
        emitConn()
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
  session.reset('roaster', 'Dongyi BR-3.5', SAMPLE_INTERVAL_MS)
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
  let i = 0
  replayTimer = setInterval(() => {
    if (i >= a.t.length) return stopReplay()
    session.add(a.t[i] * 1000, a.bt[i], a.et[i])
    i++
  }, intervalMs / speed)
}
