import { describe, expect, it } from 'vitest'
import { LiveSession } from './LiveSession'
import { RoastStore } from './roastStore'

function setup() {
  const session = new LiveSession()
  session.reset('roaster', 'test', 1000)
  const store = new RoastStore(session)
  let sec = 0
  const feed = (bt: number, n = 1) => {
    for (let k = 0; k < n; k++) session.add(sec++ * 1000, bt, bt + 30)
  }
  return { session, store, feed }
}

describe('RoastStore', () => {
  it('records manual events with time and temperatures, replacing duplicates', () => {
    const { store, feed } = setup()
    feed(200, 5)
    store.start({ coffee: 'Colombia', greenWeightG: 3000 })
    store.mark('FCs')
    feed(201, 3)
    store.mark('FCs')
    const fcs = store.getSnapshot().events.filter((e) => e.type === 'FCs')
    expect(fcs).toHaveLength(1)
    expect(fcs[0]).toMatchObject({ t: 7, bt: 201, et: 231, auto: false })
  })

  it('auto-detects CHARGE and does not re-add it after the user removes it', () => {
    const { store, feed } = setup()
    feed(205, 10)
    store.start({ coffee: '', greenWeightG: null })
    feed(190)
    feed(170)
    const charge = store.getSnapshot().events.find((e) => e.type === 'CHARGE')!
    expect(charge).toMatchObject({ auto: true, bt: 205 })
    store.removeEvent(charge.id)
    feed(150, 3)
    expect(store.getSnapshot().events.find((e) => e.type === 'CHARGE')).toBeUndefined()
  })

  it('merges quick control changes and supports undo', () => {
    const { store, feed } = setup()
    feed(100, 2)
    store.start({ coffee: '', greenWeightG: null })
    feed(100, 10)
    store.setControl('gas', 5)
    store.setControl('gas', 5.5) // within 3 s → same record
    const gas = () => store.getSnapshot().controls.filter((c) => c.kind === 'gas')
    expect(gas().map((c) => c.value)).toEqual([4.5, 5.5])
    store.setControl('gas', 99) // clamped to the rating plate maximum
    expect(store.getSnapshot().current.gas).toBe(6)
    store.undo()
    expect(store.getSnapshot().current.gas).toBe(5.5)
  })

  it('finish adds DROP when missing', () => {
    const { store, feed } = setup()
    feed(200, 3)
    store.start({ coffee: '', greenWeightG: null })
    feed(200, 3)
    store.finish()
    const s = store.getSnapshot()
    expect(s.status).toBe('finished')
    expect(s.events.some((e) => e.type === 'DROP')).toBe(true)
  })
})

describe('RoastStore.prepare (duplicate as new)', () => {
  it('pre-fills coffee, weight and control positions, but never during a roast', () => {
    const { store, feed } = setup()
    expect(store.prepare({ coffee: 'Kenya', coffeeId: 'k1', greenWeightG: 3500, current: { gas: 5.5, air: 50 } })).toBe(true)
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', coffee: 'Kenya', coffeeId: 'k1', greenWeightG: 3500 })
    expect(store.getSnapshot().current).toEqual({ gas: 5.5, air: 50, drum: 50 })
    feed(200, 2)
    store.start({ coffee: 'Kenya', coffeeId: 'k1', greenWeightG: 3500 })
    expect(store.prepare({ coffee: 'X', coffeeId: null, greenWeightG: null })).toBe(false)
    expect(store.getSnapshot().coffee).toBe('Kenya')
  })
})

describe('notes on the curve', () => {
  it('adds a note at the clicked time with BT/ET of the nearest reading, edits and deletes it', () => {
    const { store, feed } = setup()
    feed(200, 2)
    store.start({ coffee: '', greenWeightG: null })
    for (let k = 0; k < 20; k++) feed(150 + k)
    store.addNoteAt(10.4, '  kouř  ')
    const note = store.getSnapshot().events.find((e) => e.type === 'CUSTOM')!
    expect(note).toMatchObject({ t: 10, bt: 158, note: 'kouř' })
    store.updateNote(note.id, 'první praskání?')
    expect(store.getSnapshot().events.find((e) => e.id === note.id)!.note).toBe('první praskání?')
    store.removeEvent(note.id)
    expect(store.getSnapshot().events.some((e) => e.type === 'CUSTOM')).toBe(false)
    store.undo()
    expect(store.getSnapshot().events.some((e) => e.type === 'CUSTOM')).toBe(true)
  })
})
