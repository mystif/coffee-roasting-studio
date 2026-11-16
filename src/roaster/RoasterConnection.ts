// Reads BT/ET from the Dongyi BR over Web Serial (Bluetooth Classic SPP port).
// READ-ONLY: only Modbus function 3 is ever sent. Nothing controls the roaster.

import {
  ModbusError,
  buildReadHolding,
  expectedResponseLength,
  parseReadHoldingResponse,
  registersToFloat,
  toHex,
} from './modbus'

export const SPP_UUID = '00001101-0000-1000-8000-00805f9b34fb'

const SLAVE = 1
const REG_START = 0
const REG_COUNT = 4 // reg 0–1 = BT, reg 2–3 = ET
const SERIAL_OPTIONS: SerialOptions = { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 }
const RECONNECT_DELAY_MS = 2000
const FAILURES_BEFORE_RECONNECT = 3

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting'

export interface Sample {
  /** Date.now() when the request was sent */
  at: number
  bt: number
  et: number
  latencyMs: number
  rawHex: string
}

export interface Stats {
  ok: number
  timeouts: number
  crcErrors: number
  otherErrors: number
  reconnects: number
}

export interface ConnectionOptions {
  intervalMs: number
  timeoutMs: number
  onSample: (s: Sample) => void
  onState: (s: ConnectionState) => void
  onStats: (s: Stats) => void
  onLog: (msg: string) => void
}

export class RoasterConnection {
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }

  private port: SerialPort | null = null
  private portInfo: SerialPortInfo | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private readLoopDone: Promise<void> = Promise.resolve()
  private rx: number[] = []
  private rxWaiter: (() => void) | null = null
  private state: ConnectionState = 'idle'
  private wanted = false // user wants to be connected
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private failures = 0
  private stats: Stats = { ok: 0, timeouts: 0, crcErrors: 0, otherErrors: 0, reconnects: 0 }

  constructor(private opts: ConnectionOptions) {
    navigator.serial?.addEventListener('disconnect', (e) => {
      if (this.wanted && e.target === this.port) {
        this.log('Systém hlásí odpojení portu')
        void this.reconnect()
      }
    })
  }

  setIntervalMs(ms: number) {
    this.opts.intervalMs = ms
  }

  setTimeoutMs(ms: number) {
    this.opts.timeoutMs = ms
  }

  /** Must be called from a user gesture (button click) the first time. */
  async connect(): Promise<void> {
    const port = await navigator.serial.requestPort({ allowedBluetoothServiceClassIds: [SPP_UUID] })
    this.port = port
    this.portInfo = port.getInfo()
    this.log(`Vybraný port: ${describePort(this.portInfo)}`)
    this.wanted = true
    this.setState('connecting')
    await this.openAndPoll()
  }

  async disconnect(): Promise<void> {
    this.wanted = false
    this.stopPolling()
    await this.closePort()
    this.setState('idle')
    this.log('Odpojeno uživatelem')
  }

  // ── internals ──────────────────────────────────────────────

  private async openAndPoll(): Promise<void> {
    if (!this.port) throw new Error('Žádný port')
    await this.port.open(SERIAL_OPTIONS)
    this.rx = []
    this.startReadLoop(this.port)
    this.failures = 0
    this.setState('connected')
    this.log('Port otevřen (9600 8N1)')
    this.schedule(0)
  }

  private startReadLoop(port: SerialPort) {
    this.readLoopDone = (async () => {
      while (port.readable && this.wanted) {
        const reader = port.readable.getReader()
        this.reader = reader
        try {
          for (;;) {
            const { value, done } = await reader.read()
            if (done) return
            if (value) {
              for (const b of value) this.rx.push(b)
              this.rxWaiter?.()
            }
          }
        } catch (e) {
          this.log(`Chyba čtení: ${errMsg(e)}`)
          // device lost (e.g. Bluetooth dropped): don't wait for 3 timeouts
          if (this.wanted) void this.reconnect()
          return
        } finally {
          reader.releaseLock()
          this.reader = null
        }
      }
    })()
  }

  private schedule(delay: number) {
    this.stopPolling()
    this.pollTimer = setTimeout(() => void this.pollOnce(), delay)
  }

  private stopPolling() {
    if (this.pollTimer) clearTimeout(this.pollTimer)
    this.pollTimer = null
  }

  private async pollOnce() {
    if (!this.wanted || this.state !== 'connected') return
    const started = Date.now()
    try {
      const regs = await this.request()
      const sample: Sample = {
        at: started,
        bt: round1(registersToFloat(regs[0], regs[1])),
        et: round1(registersToFloat(regs[2], regs[3])),
        latencyMs: Date.now() - started,
        rawHex: this.lastRawHex,
      }
      this.failures = 0
      this.stats.ok++
      this.opts.onSample(sample)
    } catch (e) {
      this.failures++
      if (e instanceof ModbusError && e.kind === 'timeout') this.stats.timeouts++
      else if (e instanceof ModbusError && e.kind === 'crc') this.stats.crcErrors++
      else this.stats.otherErrors++
      this.log(`Čtení selhalo (${this.failures}×): ${errMsg(e)}`)
      if (this.failures >= FAILURES_BEFORE_RECONNECT) {
        this.emitStats()
        void this.reconnect()
        return
      }
    }
    this.emitStats()
    const next = Math.max(0, started + this.opts.intervalMs - Date.now())
    this.schedule(next)
  }

  private lastRawHex = ''

  private async request(): Promise<number[]> {
    const port = this.port
    if (!port?.writable) throw new ModbusError('Port není zapisovatelný', 'io')
    this.rx = []
    const frame = buildReadHolding(SLAVE, REG_START, REG_COUNT)
    const writer = port.writable.getWriter()
    try {
      await writer.write(frame)
    } finally {
      writer.releaseLock()
    }
    const want = expectedResponseLength(REG_COUNT)
    const deadline = Date.now() + this.opts.timeoutMs
    while (this.rx.length < want && !(this.rx.length >= 5 && this.rx[1] === 0x83)) {
      const left = deadline - Date.now()
      if (left <= 0) {
        this.lastRawHex = toHex(new Uint8Array(this.rx))
        throw new ModbusError(`Timeout ${this.opts.timeoutMs} ms (přijato ${this.rx.length} B)`, 'timeout')
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left)
        this.rxWaiter = () => {
          clearTimeout(t)
          resolve()
        }
      })
      this.rxWaiter = null
    }
    const bytes = new Uint8Array(this.rx)
    this.lastRawHex = toHex(bytes)
    return parseReadHoldingResponse(bytes, SLAVE, REG_COUNT)
  }

  private reconnecting = false

  private async reconnect() {
    if (this.reconnecting || !this.wanted) return
    this.reconnecting = true
    this.stopPolling()
    this.setState('reconnecting')
    await this.closePort()
    while (this.wanted) {
      await sleep(RECONNECT_DELAY_MS)
      if (!this.wanted) break
      try {
        this.port = await this.findPort()
        this.stats.reconnects++
        this.log('Pokus o obnovení spojení…')
        await this.openAndPoll()
        this.log('Spojení obnoveno')
        break
      } catch (e) {
        this.log(`Obnovení se nepovedlo: ${errMsg(e)}`)
        await this.closePort()
      }
    }
    this.reconnecting = false
    this.emitStats()
  }

  /** Same port object if still known to Chrome, otherwise a previously granted one. */
  private async findPort(): Promise<SerialPort> {
    const ports = await navigator.serial.getPorts()
    if (this.port && ports.includes(this.port)) return this.port
    const same = ports.filter((p) => samePortInfo(p.getInfo(), this.portInfo))
    if (same.length === 1) return same[0]
    if (ports.length === 1) return ports[0]
    throw new Error('Port pražičky není k dispozici')
  }

  private async closePort() {
    const port = this.port
    if (!port) return
    try {
      await this.reader?.cancel()
    } catch {
      /* ignore */
    }
    await this.readLoopDone.catch(() => {})
    try {
      await port.close()
    } catch {
      /* already closed */
    }
  }

  private setState(s: ConnectionState) {
    this.state = s
    this.opts.onState(s)
  }

  private emitStats() {
    this.opts.onStats({ ...this.stats })
  }

  private log(msg: string) {
    this.opts.onLog(msg)
  }
}

function samePortInfo(a: SerialPortInfo, b: SerialPortInfo | null) {
  if (!b) return false
  return (
    a.usbVendorId === b.usbVendorId &&
    a.usbProductId === b.usbProductId &&
    a.bluetoothServiceClassId === b.bluetoothServiceClassId
  )
}

export function describePort(info: SerialPortInfo): string {
  if (info.bluetoothServiceClassId) return `Bluetooth RFCOMM (${info.bluetoothServiceClassId})`
  if (info.usbVendorId) return `USB ${info.usbVendorId.toString(16)}:${info.usbProductId?.toString(16)}`
  return 'systémový sériový port (bez USB/Bluetooth ID)'
}

const round1 = (x: number) => Math.round(x * 10) / 10
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
