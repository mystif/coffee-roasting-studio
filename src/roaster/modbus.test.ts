import { describe, expect, it } from 'vitest'
import {
  ModbusError,
  buildReadHolding,
  crc16,
  parseReadHoldingResponse,
  registersToFloat,
} from './modbus'

function withCrc(bytes: number[]): Uint8Array {
  const crc = crc16(new Uint8Array(bytes))
  return new Uint8Array([...bytes, crc & 0xff, crc >> 8])
}

describe('modbus', () => {
  it('builds the Dongyi request frame with the reference CRC', () => {
    // reference CRC computed independently (python): 0x44 0x09
    expect(Array.from(buildReadHolding(1, 0, 4))).toEqual([1, 3, 0, 0, 0, 4, 0x44, 0x09])
  })

  it('decodes BT/ET floats from a response', () => {
    // 182.4 = 0x43366666, 231.0 = 0x43670000
    const frame = withCrc([1, 3, 8, 0x43, 0x36, 0x66, 0x66, 0x43, 0x67, 0x00, 0x00])
    const r = parseReadHoldingResponse(frame, 1, 4)
    expect(registersToFloat(r[0], r[1])).toBeCloseTo(182.4, 4)
    expect(registersToFloat(r[2], r[3])).toBe(231)
  })

  it('rejects a corrupted CRC', () => {
    const frame = withCrc([1, 3, 8, 0x43, 0x36, 0x66, 0x66, 0x43, 0x67, 0, 0])
    frame[4] ^= 0xff
    expect(() => parseReadHoldingResponse(frame, 1, 4)).toThrowError(ModbusError)
  })

  it('reports Modbus exception responses', () => {
    expect(() => parseReadHoldingResponse(withCrc([1, 0x83, 2]), 1, 4)).toThrow(/výjimka/)
  })

  it('rejects short frames', () => {
    expect(() => parseReadHoldingResponse(new Uint8Array([1, 3, 8, 0]), 1, 4)).toThrow(/Krátká/)
  })
})
