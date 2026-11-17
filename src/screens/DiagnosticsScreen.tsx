import { useEffect, useMemo, useRef, useState } from 'react'
import {
  RoasterConnection,
  type ConnectionState,
  type Sample,
  type Stats,
} from '../roaster/RoasterConnection'
import { ClayButton, Panel } from '../ui/clay'

const STATE_LABEL: Record<ConnectionState, string> = {
  idle: 'Nepřipojeno',
  connecting: 'Připojuji…',
  connected: 'Připojeno',
  reconnecting: 'Obnovuji spojení…',
}
const STATE_COLOR: Record<ConnectionState, string> = {
  idle: 'bg-zinc-500',
  connecting: 'bg-amber-400',
  connected: 'bg-emerald-400',
  reconnecting: 'bg-amber-400 animate-pulse',
}

const EMPTY_STATS: Stats = { ok: 0, timeouts: 0, crcErrors: 0, otherErrors: 0, reconnects: 0 }

export function DiagnosticsScreen() {
  const supported = RoasterConnection.isSupported()
  const [state, setState] = useState<ConnectionState>('idle')
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)
  const [last, setLast] = useState<Sample | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [intervalMs, setIntervalMs] = useState(2000)
  const [timeoutMs, setTimeoutMs] = useState(1000)
  const [error, setError] = useState<string | null>(null)
  const samples = useRef<Sample[]>([])
  const [, force] = useState(0)

  const conn = useMemo(
    () =>
      supported
        ? new RoasterConnection({
            intervalMs: 2000,
            timeoutMs: 1000,
            onSample: (s) => {
              samples.current.push(s)
              setLast(s)
            },
            onState: setState,
            onStats: setStats,
            onLog: (m) => setLog((l) => [`${new Date().toLocaleTimeString('cs-CZ')}  ${m}`, ...l].slice(0, 200)),
          })
        : null,
    [supported],
  )

  // release the port when leaving the page, so the live screen can use it
  useEffect(() => () => void conn?.disconnect(), [conn])
  useEffect(() => conn?.setIntervalMs(intervalMs), [conn, intervalMs])
  useEffect(() => conn?.setTimeoutMs(timeoutMs), [conn, timeoutMs])

  const connect = async () => {
    setError(null)
    try {
      await conn?.connect()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('No port selected') ? 'Nebyl vybrán žádný port.' : msg)
    }
  }

  const recent = samples.current.slice(-12).reverse()
  const lat = samples.current.slice(-30).map((s) => s.latencyMs)
  const avgLat = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null
  const maxLat = lat.length ? Math.max(...lat) : null

  const exportCsv = () => {
    const env = `# ${navigator.userAgent}\n# interval ${intervalMs} ms, timeout ${timeoutMs} ms\n# stats ${JSON.stringify(stats)}\n`
    const rows = samples.current.map(
      (s) => `${new Date(s.at).toISOString()},${s.bt},${s.et},${s.latencyMs},${s.rawHex}`,
    )
    const logPart = log.map((l) => `# ${l}`).reverse().join('\n')
    const csv = `${env}time,reg0,reg2,latency_ms,raw\n${rows.join('\n')}\n# --- log ---\n${logPart}\n`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `s0-diagnostika-${new Date().toISOString().slice(0, 16).replace(':', '')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="min-h-screen bg-[var(--c-bg)] text-zinc-100 p-6 font-sans">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Coffee Roasting Studio</h1>
            <p className="text-zinc-400 text-sm">Diagnostika připojení Dongyi BR-3.5 (pouze čtení) · <a className="underline" href="#/">zpět na pražení</a></p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-[var(--c-chip)] px-4 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_6px_16px_var(--sh)]">
            <span className={`h-3 w-3 rounded-full ${STATE_COLOR[state]}`} />
            <span className="text-sm font-medium">{STATE_LABEL[state]}</span>
          </div>
        </header>

        {!supported && (
          <Panel className="border border-red-500/50">
            <p className="font-semibold text-red-300">Tento prohlížeč neumí Web Serial.</p>
            <p className="text-sm text-zinc-300">Otevři stránku v Google Chrome (verze 117 nebo novější) přes https.</p>
          </Panel>
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <Panel>
            <h2 className="mb-2 font-semibold">Postup</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-300">
              <li>Zavři Artisan (port může používat jen jeden program).</li>
              <li>Zapni pražičku. Nic nepřepárovávej.</li>
              <li>Klikni <b>Připojit</b> a vyber port <b>DY_MACHINE…</b></li>
              <li>Porovnej hodnoty s displeji BEAN TEMP a HOT AIR TEMP.</li>
              <li>Vypni Bluetooth na Macu ~10 s a zase zapni. Spojení se má obnovit samo.</li>
              <li>Zkus interval 1 s. Pak klikni <b>Stáhnout výsledky</b> a pošli mi soubor.</li>
            </ol>
          </Panel>

          <Panel className="space-y-3">
            <h2 className="font-semibold">Ovládání připojení</h2>
            <div className="flex gap-3">
              <ClayButton onClick={connect} disabled={!supported || state !== 'idle'} variant="primary">
                Připojit
              </ClayButton>
              <ClayButton onClick={() => conn?.disconnect()} disabled={state === 'idle'}>
                Odpojit
              </ClayButton>
            </div>
            <Choice label="Interval čtení" value={intervalMs} options={[250, 500, 1000, 2000]} unit="s" onChange={setIntervalMs} />
            <Choice label="Timeout odpovědi" value={timeoutMs} options={[400, 1000, 2000]} unit="ms" onChange={setTimeoutMs} />
            {error && <p className="text-sm text-red-300">{error}</p>}
          </Panel>

          <Panel className="space-y-1 text-sm">
            <h2 className="mb-1 font-semibold">Statistika</h2>
            <Row k="Úspěšná čtení" v={stats.ok} />
            <Row k="Timeouty" v={stats.timeouts} />
            <Row k="Chyby CRC" v={stats.crcErrors} />
            <Row k="Jiné chyby" v={stats.otherErrors} />
            <Row k="Pokusy o obnovení" v={stats.reconnects} />
            <Row k="Odezva průměr / max" v={avgLat === null ? '–' : `${avgLat} / ${maxLat} ms`} />
            <Row k="Chrome" v={navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] ?? '?'} />
            <Row k="Zabezpečený kontext" v={window.isSecureContext ? 'ano' : 'NE'} />
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Readout title="Registr 0 – očekávám BT" hint="porovnej s displejem BEAN TEMP" value={last?.bt} color="text-sky-300" />
          <Readout title="Registr 2 – očekávám ET" hint="porovnej s displejem HOT AIR TEMP" value={last?.et} color="text-orange-300" />
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Panel>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Poslední vzorky</h2>
              <ClayButton onClick={exportCsv} disabled={samples.current.length === 0 && log.length === 0}>
                Stáhnout výsledky
              </ClayButton>
            </div>
            <table className="w-full text-sm tabular-nums">
              <thead className="text-zinc-400">
                <tr>
                  <th className="text-left font-normal">čas</th>
                  <th className="text-right font-normal">reg 0</th>
                  <th className="text-right font-normal">reg 2</th>
                  <th className="text-right font-normal">odezva</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => (
                  <tr key={s.at}>
                    <td>{new Date(s.at).toLocaleTimeString('cs-CZ')}</td>
                    <td className="text-right">{s.bt.toFixed(1)}</td>
                    <td className="text-right">{s.et.toFixed(1)}</td>
                    <td className="text-right">{s.latencyMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {last && <p className="mt-2 truncate font-mono text-xs text-zinc-500">raw: {last.rawHex}</p>}
          </Panel>

          <Panel>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Log</h2>
              <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => force((x) => x + 1)}>
                obnovit
              </button>
            </div>
            <pre className="h-64 overflow-auto whitespace-pre-wrap font-mono text-xs text-zinc-300">{log.join('\n') || '—'}</pre>
          </Panel>
        </div>

        <p className="text-center text-xs text-zinc-500">
          Aplikace pražičku neovládá. Posílá pouze dotaz na čtení teplot (Modbus funkce 3).
        </p>
      </div>
    </div>
  )
}



function Choice(props: { label: string; value: number; options: number[]; unit: 's' | 'ms'; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-400">{props.label}</span>
      <div className="flex gap-1 rounded-xl bg-[var(--c-bg)] p-1">
        {props.options.map((o) => (
          <button
            key={o}
            onClick={() => props.onChange(o)}
            className={`rounded-lg px-3 py-1 ${o === props.value ? 'bg-[var(--c-active)] text-zinc-100' : 'text-zinc-400'}`}
          >
            {props.unit === 's' ? `${o / 1000} s` : `${o} ms`}
          </button>
        ))}
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-400">{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  )
}

function Readout({ title, hint, value, color }: { title: string; hint: string; value?: number; color: string }) {
  return (
    <Panel>
      <p className="text-sm text-zinc-400">{title}</p>
      <p className={`text-7xl font-semibold tabular-nums tracking-tight ${color}`}>
        {value === undefined ? '—' : value.toFixed(1)}
        <span className="ml-2 text-3xl text-zinc-500">°C</span>
      </p>
      <p className="text-xs text-zinc-500">{hint}</p>
    </Panel>
  )
}
