import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function boot() {
  vi.resetModules() // simulates a page reload: fresh singletons, same IndexedDB
  const runtime = await import('../live/runtime')
  const persistence = await import('./persistence')
  const { db } = await import('./db')
  await persistence.initPersistence()
  return { ...runtime, ...persistence, db }
}

describe('persistence', () => {
  it('restores a roast in progress after a reload and saves it on Finish', async () => {
    const a = await boot()
    const t0 = Date.now() - 600_000
    a.session.reset('roaster', 'Dongyi BR-3.5', 1000)
    for (let s = 0; s < 40; s++) a.session.add(t0 + s * 1000, 200, 230)
    a.roast.start({ coffee: 'Etiopie', greenWeightG: 3000 })
    a.roast.mark('CHARGE')
    for (let s = 40; s < 100; s++) a.session.add(t0 + s * 1000, 150, 220)
    a.roast.mark('FCs')
    await wait(50) // draft is written right after an event

    const b = await boot()
    expect(b.persistState.get().restoredFrom).not.toBeNull()
    expect(b.roast.getSnapshot()).toMatchObject({ status: 'roasting', coffee: 'Etiopie' })
    expect(b.roast.getSnapshot().events.map((e) => e.type)).toEqual(['CHARGE', 'FCs'])
    expect(b.session.getSnapshot().t).toHaveLength(100)

    // readings continue after the reload with a visible gap
    b.session.add(Date.now(), 210, 235)
    const snap = b.session.getSnapshot()
    expect(snap.bt.at(-2)).toBeNull()

    b.roast.finish()
    await wait(50)
    const id = b.roast.getSnapshot().savedId!
    expect(id).toBeTruthy()
    b.roast.update({ roastedWeightG: 2550, notes: 'sladké' })
    await wait(1000)
    const rec = (await b.db.roasts.get(id))!
    expect(rec).toMatchObject({ coffee: 'Etiopie', roastedWeightG: 2550, lossPct: 15, notes: 'sladké', source: 'live' })
    expect(await b.db.drafts.get('current')).toBeUndefined()
  })

  it('never stores replayed files', async () => {
    const a = await boot()
    await a.db.roasts.clear()
    a.session.reset('replay', 'x.alog', 1000)
    a.roast.start({ coffee: 'replay', greenWeightG: null })
    for (let s = 0; s < 20; s++) a.session.add(s * 1000, 200, 230)
    a.roast.mark('CHARGE')
    a.roast.finish()
    await wait(50)
    expect(await a.db.roasts.count()).toBe(0)
    expect(await a.db.drafts.get('current')).toBeUndefined()
  })
})
