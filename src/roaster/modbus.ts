// Modbus RTU – only what the Dongyi BR needs: function 3 (Read Holding Registers).
// Verified config (Artisan preset Machines/Dongyi/BR.aset): slave 1, 9600 8N1,
// float32 big-endian, BT at register 0, ET at register 2.

export function crc16(bytes: Uint8Array): number {
  let crc = 0xffff
  for (const b of bytes) {
    crc ^= b
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1
  }
  return crc
}

/** Request frame incl. CRC (CRC is little-endian on the wire). */
export function buildReadHolding(slave: number, address: number, count: number): Uint8Array {
  const f = new Uint8Array(8)
  f.set([slave, 0x03, address >> 8, address & 0xff, count >> 8, count & 0xff])
  const crc = crc16(f.subarray(0, 6))
  f[6] = crc & 0xff
  f[7] = crc >> 8
  return f
}

export const expectedResponseLength = (count: number) => 5 + count * 2

export class ModbusError extends Error {
  constructor(
    message: string,
    readonly kind: 'crc' | 'exception' | 'malformed' | 'timeout' | 'io',
  ) {
    super(message)
  }
}

/** Parses a function-3 response and returns the 16-bit register values. */
export function parseReadHoldingResponse(frame: Uint8Array, slave: number, count: number): number[] {
  if (frame.length >= 5 && frame[1] === 0x83) {
    throw new ModbusError(`Modbus výjimka, kód ${frame[2]}`, 'exception')
  }
  const len = expectedResponseLength(count)
  if (frame.length < len) throw new ModbusError(`Krátká odpověď (${frame.length}/${len} B)`, 'malformed')
  const f = frame.subarray(0, len)
  const crc = crc16(f.subarray(0, len - 2))
  if (f[len - 2] !== (crc & 0xff) || f[len - 1] !== crc >> 8) throw new ModbusError('Chybný CRC', 'crc')
  if (f[0] !== slave || f[1] !== 0x03 || f[2] !== count * 2) {
    throw new ModbusError('Neočekávaná hlavička odpovědi', 'malformed')
  }
  const regs: number[] = []
  for (let i = 0; i < count; i++) regs.push((f[3 + i * 2] << 8) | f[4 + i * 2])
  return regs
}

/** float32 from two registers, big-endian word and byte order. */
export function registersToFloat(hi: number, lo: number): number {
  const v = new DataView(new ArrayBuffer(4))
  v.setUint16(0, hi)
  v.setUint16(2, lo)
  return v.getFloat32(0)
}

export const toHex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ')
