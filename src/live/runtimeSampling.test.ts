// The roaster is polled every 0.5 s for the big numbers, the curve keeps a 1 s cadence.
import { describe, expect, it, vi } from 'vitest'
import { crc16 } from '../roaster/modbus'

function response(bt: number, et: number): Uint8Array {
  const v = new DataView(new ArrayBuffer(8))
  v.setFloat32(0, bt)
  v.setFloat32(4, et)
  const body = [1, 3, 8, ...new Uint8Array(v.buffer)]
  const crc = crc16(new Uint8Array(body))
  return new Uint8Array([...body, crc & 0xff, crc >> 8])
}

describe('live sampling', () => {
  it('reads twice a second but records the curve once a second', async () => {
    let polls = 0
    let ctrl: ReadableStreamDefaultController<Uint8Array> | null = null
    const port = Object.assign(new EventTarget(), {
      readable: null as ReadableStream<Uint8Array> | null,
      writable: null as WritableStream<Uint8Array> | null,
      getInfo: () => ({}),
      async open() {
        this.readable = new ReadableStream({ start: (c) => void (ctrl = c), cancel: () => void (ctrl = null) })
        this.writable = new WritableStream({ write: () => void (polls++, setTimeout(() => ctrl?.enqueue(response(150 + polls, 230)), 5)) })
      },
      async close() {
        ctrl = null
      },
    })
    Object.defineProperty(globalThis.navigator, 'serial', {
      value: Object.assign(new EventTarget(), { requestPort: async () => port, getPorts: async () => [port] }),
      configurable: true,
    })
    vi.resetModules()
    const rt = await import('./runtime')
    await rt.connectRoaster()
    await new Promise((r) => setTimeout(r, 3100))
    await rt.disconnectRoaster()
    const n = rt.session.getSnapshot().t.length
    expect(polls).toBeGreaterThanOrEqual(6) // ~7 polls in 3.1 s
    expect(n).toBeGreaterThanOrEqual(3)
    expect(n).toBeLessThanOrEqual(4) // 1 s cadence
    expect(rt.liveReading.get().bt).toBe(150 + polls) // big number = newest reading
    Reflect.deleteProperty(globalThis.navigator, 'serial')
  }, 10_000)
})
