import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { realRoastNames, loadRealRoast } from '../testing/realRoasts'
import { parseAlog } from './alog'
import { recordToAlog } from './alogExport'
import { alogToRecord } from './alogImport'

const hasPython = (() => {
  try {
    execFileSync('python3', ['--version'])
    return true
  } catch {
    return false
  }
})()

/** Reads the file exactly like Artisan does (ast.literal_eval) and checks the key types. */
function pythonCheck(src: string): string {
  const script = `
import ast, sys
d = ast.literal_eval(sys.stdin.read())
assert isinstance(d, dict)
for k in ('timex', 'temp1', 'temp2'):
    assert all(isinstance(x, float) for x in d[k]), k
assert len(d['timex']) == len(d['temp1']) == len(d['temp2'])
assert all(isinstance(x, int) for x in d['timeindex']) and len(d['timeindex']) == 8
assert all(isinstance(x, int) for x in d['specialevents'] + d['specialeventstype'])
assert all(isinstance(x, float) for x in d['specialeventsvalue'])
assert len(d['weight']) == 3 and d['weight'][2] == 'Kg'
print('ok', len(d['timex']))
`
  return execFileSync('python3', ['-I', '-c', script], { input: src }).toString().trim()
}

describe.skipIf(realRoastNames.length === 0)('export .alog round trip on real roasts', () => {
  it.each(realRoastNames.slice(0, 35))('%s', (file) => {
    const original = alogToRecord(loadRealRoast(file), { fileName: file, coffee: 'Kolumbie – Huila "test" \\ \'x\'' })
    original.notes = 'řádek 1\nřádek 2'
    const src = recordToAlog(original)
    if (hasPython) expect(pythonCheck(src)).toMatch(/^ok \d+/)
    const again = alogToRecord(parseAlog(src), { fileName: file })
    expect(again.coffee).toBe(original.coffee)
    expect(again.notes).toBe(original.notes)
    expect(again.samples.bt).toEqual(original.samples.bt)
    expect(again.samples.et).toEqual(original.samples.et)
    expect(again.greenWeightG).toBe(original.greenWeightG)
    expect(again.roastDate).toBe(new Date(Math.floor(Date.parse(original.roastDate) / 1000) * 1000).toISOString())
    // all events survive (a derived Dry End is written as a real Artisan mark)
    const sig = (r: typeof original) => r.events.map((e) => `${e.type}@${e.t}`)
    expect(sig(again)).toEqual(sig(original))
    expect(again.phases?.total).toBeCloseTo(original.phases!.total, 6)
    expect(again.controls).toEqual(original.controls)
  })
})
