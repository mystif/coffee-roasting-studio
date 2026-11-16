// Behavioural test of the read loop + auto-reconnect against a fake serial port.
// The fake is test-only; it never appears in the app.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { crc16 } from './modbus'
import { RoasterConnection, type ConnectionState, type Sample } from './RoasterConnection'

function response(bt: number, et: number): Uint8Array {
  const v = new DataView(new ArrayBuffer(8))
  v.setFloat32(0, bt)
  v.setFloat32(4, et)
  const body = [1, 3, 8, ...new Uint8Array(v.buffer)]
  const crc = crc16(new Uint8Array(body))
  return new Uint8Array([...body, crc & 0xff, crc >> 8])
}

class FakePort extends EventTarget {
  readable: ReadableStream<Uint8Array> | null = null
  writable: WritableStream<Uint8Array> | null = null
  silent = false // simulates Bluetooth range loss: requests get no answer
  failOpen = false
  opens = 0
  private ctrl: ReadableStreamDefaultController<Uint8Array> | null = null

  getInfo() {
    return {}
  }

  async open() {
    if (this.failOpen) throw new Error('open failed')
    this.opens++
    this.readable = new ReadableStream({ start: (c) => void (this.ctrl = c) })
    this.writable = new WritableStream({
      write: () => {
        if (!this.silent) setTimeout(() => this.ctrl?.enqueue(response(182.4, 231)), 5)
      },
    })
  }

  async close() {
    this.readable = null
    this.writable = null
  }
}

let port: FakePort

beforeEach(() => {
  port = new FakePort()
  const serial = Object.assign(new EventTarget(), {
    requestPort: async () => port,
    getPorts: async () => [port],
  })
  Object.defineProperty(globalThis.navigator, 'serial', { value: serial, configurable: true })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis.navigator, 'serial')
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('RoasterConnection', () => {
  it('reads samples, then reconnects by itself after the link goes silent', async () => {
    const samples: Sample[] = []
    const states: ConnectionState[] = []
    const conn = new RoasterConnection({
      intervalMs: 50,
      timeoutMs: 60,
      onSample: (s) => samples.push(s),
      onState: (s) => states.push(s),
      onStats: () => {},
      onLog: () => {},
    })

    await conn.connect()
    await wait(200)
    expect(samples.length).toBeGreaterThan(1)
    expect(samples[0]).toMatchObject({ bt: 182.4, et: 231 })

    port.silent = true
    port.failOpen = true
    await wait(400) // 3 timeouts → reconnecting, reopen keeps failing
    expect(states.at(-1)).toBe('reconnecting')
    const countDuringOutage = samples.length

    port.silent = false
    port.failOpen = false
    await wait(2600) // reconnect delay is 2 s
    expect(states.at(-1)).toBe('connected')
    expect(samples.length).toBeGreaterThan(countDuringOutage)

    await conn.disconnect()
    expect(states.at(-1)).toBe('idle')
  }, 10_000)
})
