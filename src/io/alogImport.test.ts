import { loadRealRoast, realRoastNames } from '../testing/realRoasts'
import { describe, expect, it } from 'vitest'
import { findEvent } from '../domain/events'
import { parseAlog } from './alog'
import { alogToRecord, kpaFromLabel } from './alogImport'

describe('kpaFromLabel', () => {
  it.each([
    ['5,5kpi 100', 5.5],
    ['4,5 kpi 80', 4.5],
    ['3 kpi 50', 3],
    ['4 kPa', 4],
    ['35%', null],
  ])('%s → %s', (label, kpa) => expect(kpaFromLabel(label)).toBe(kpa))
})

const minimal = `{'timex': [0.0, 2.0, 4.0, 6.0], 'temp1': [200.0, 190.0, 180.0, -1], 'temp2': [180.0, 150.0, 120.0, 110.0],
 'timeindex': [-1, 0, 0, 0, 0, 0, 0, 0], 'weight': [250.0, 210.0, 'g'], 'etypes': ['Air', 'Drum', 'Damper', 'Power', '--'],
 'specialevents': [1, 2], 'specialeventstype': [0, 3], 'specialeventsvalue': [6.0, 9.0], 'specialeventsStrings': ['50%', '4,5 kpi 80'],
 'computed': {}, 'beans': 'Kenya AA', 'roastUUID': 'abc', 'roastepoch': 1700000000, 'samplinginterval': 2.0}`

describe('alogToRecord', () => {
  it('maps weights in grams, missing readings, controls and an unset CHARGE', () => {
    const r = alogToRecord(parseAlog(minimal), { fileName: 'x.alog' })
    expect(r).toMatchObject({ id: 'artisan-abc', coffee: 'Kenya AA', greenWeightG: 250, roastedWeightG: 210, lossPct: 16, source: 'import' })
    expect(r.roastDate).toBe(new Date(1700000000 * 1000).toISOString())
    expect(r.samples.et[3]).toBeNull()
    expect(r.events).toEqual([]) // CHARGE = -1 → not set
    expect(r.controls).toEqual([
      { t: 2, kind: 'air', value: 50 },
      { t: 4, kind: 'gas', value: 4.5 },
    ])
    expect(r.phases).toBeNull()
  })
})

const alogs = realRoastNames

describe.skipIf(alogs.length === 0)('import matches Artisan on real roasts', () => {
  it.each(alogs)('%s', (file) => {
    const a = loadRealRoast(file)
    const r = alogToRecord(a, { fileName: file })
    const c = a.computed
    const p = r.phases!
    expect(p.total).toBeCloseTo(c.totaltime!, 0)
    // Artisan-marked Dry End is exact; derived from the 130 °C rule within one sample
    const tol = a.timeindex[1] ? 0.5 : 2.5
    expect(Math.abs(p.drying! - c.dryphasetime!)).toBeLessThan(tol)
    expect(Math.abs(p.maillard! - c.midphasetime!)).toBeLessThan(tol)
    expect(p.development).toBeCloseTo(c.finishphasetime!, 0)
    const charge = findEvent(r.events, 'CHARGE')!
    const drop = findEvent(r.events, 'DROP')!
    expect(charge.bt).toBeCloseTo(c.CHARGE_BT!, 0)
    expect(drop.bt).toBeCloseTo(c.DROP_BT!, 0)
    expect(findEvent(r.events, 'TP')!.t - charge.t).toBeCloseTo(c.TP_time!, 0)
    // the user's gas/air labels are all recognised
    const labelled = a.specialEvents.filter((e) => /kpi|%/.test(e.label)).length
    expect(r.controls).toHaveLength(labelled)
    console.log(`${file}: total ${p.total}/${c.totaltime}, phases ${p.drying}/${p.maillard}/${p.development} vs ${c.dryphasetime}/${c.midphasetime}/${c.finishphasetime}, DTR ${p.dtr?.toFixed(1)} %, controls ${r.controls.length}`)
  })
})
