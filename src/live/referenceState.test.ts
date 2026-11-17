import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms))
const ev = (type: 'CHARGE' | 'DROP', t: number) => ({ id: type, type, t, bt: 200, et: null })
const profile = (id: string) => ({
  id,
  name: id,
  coffee: '',
  coffeeId: null,
  fromRoastId: null,
  createdAt: '',
  notes: '',
  targetDropBT: null,
  targetTime: null,
  samples: { t: [0, 10, 20], bt: [200, 150, 160], et: [230, 220, 225] },
  events: [ev('CHARGE', 0), ev('DROP', 20)],
  controls: [],
})

describe('reference switching', () => {
  it('shows a chosen profile, switches to another and clears completely for "bez reference"', async () => {
    vi.resetModules()
    const { db } = await import('../storage/db')
    await db.profiles.bulkPut([profile('A'), profile('B')])
    const { roast } = await import('./runtime')
    const { referenceState } = await import('./referenceState')

    roast.update({ reference: { kind: 'profile', id: 'A', label: 'A' } })
    await wait()
    expect(referenceState.get().curve?.label).toBe('A')

    roast.update({ reference: { kind: 'profile', id: 'B', label: 'B' } })
    await wait()
    expect(referenceState.get().curve?.label).toBe('B')

    roast.update({ reference: null }) // the bug: the old curve stayed in the chart
    await wait()
    expect(referenceState.get()).toMatchObject({ choice: null, curve: null, missing: false })

    // choosing again after clearing works, and a quick switch to none cancels a load in flight
    roast.update({ reference: { kind: 'profile', id: 'A', label: 'A' } })
    roast.update({ reference: null })
    await wait()
    expect(referenceState.get().curve).toBeNull()
  })
})
