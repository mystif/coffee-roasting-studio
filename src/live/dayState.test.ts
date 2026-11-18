import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function boot() {
  vi.resetModules() // like a page reload
  const runtime = await import('./runtime')
  const day = await import('./dayState')
  const { db } = await import('../storage/db')
  await day.initDay()
  return { ...runtime, ...day, db }
}

describe('roasting day', () => {
  it('starts on ET rise, survives a reload, stops, and does not restart while still hot', async () => {
    const a = await boot()
    const t0 = Date.parse('2026-11-17T07:00:00Z')
    a.session.reset('roaster', 'Dongyi', 1000)
    for (let s = 0; s < 30; s++) a.session.add(t0 + s * 1000, 25, 22) // cold
    expect(a.dayState.get().startedAt).toBeNull()
    for (let s = 30; s < 60; s++) a.session.add(t0 + s * 1000, 25, 22 + (s - 29) * 0.5) // burner on
    expect(a.dayState.get()).toMatchObject({ startedAt: t0 + 29_000, reason: 'et' })
    await wait(30)

    const b = await boot()
    expect(b.dayState.get()).toMatchObject({ startedAt: t0 + 29_000, stoppedAt: null })

    await b.stopDay(t0 + 3 * 3_600_000)
    b.session.reset('roaster', 'Dongyi', 1000)
    for (let s = 0; s < 30; s++) b.session.add(t0 + 4 * 3_600_000 + s * 1000, 200, 220 + s) // still hot & rising
    expect(b.dayState.get().stoppedAt).toBe(t0 + 3 * 3_600_000) // no new day
    for (let s = 30; s < 40; s++) b.session.add(t0 + 4 * 3_600_000 + s * 1000, 40, 50) // cooled down
    for (let s = 40; s < 70; s++) b.session.add(t0 + 4 * 3_600_000 + s * 1000, 40, 50 + (s - 40)) // heating again
    expect(b.dayState.get().stoppedAt).toBeNull()
    await wait(30)
    const history = (await b.db.settings.get('dayHistory'))?.value as { gasKg: number }[]
    expect(history[0].gasKg).toBeCloseTo(0.5 * (3 - 29 / 3600), 6)
  })

  it('ignores replayed files', async () => {
    const a = await boot()
    await a.db.settings.clear()
    const c = await boot()
    c.session.reset('replay', 'x.alog', 1000)
    for (let s = 0; s < 60; s++) c.session.add(s * 1000, 25, 22 + s)
    expect(c.dayState.get().startedAt).toBeNull()
  })

  it('a new gas bottle resets the bottle and the running day, keeping the part so far in the history', async () => {
    const a = await boot()
    await a.db.settings.clear()
    const b = await boot()
    const H = 3_600_000
    const t0 = Date.parse('2026-11-18T07:00:00Z')
    b.startDay(t0, 'manual')
    await b.resetBottle(t0 + 2 * H)
    expect(b.dayState.get()).toMatchObject({ startedAt: t0 + 2 * H, stoppedAt: null, bottleResetAt: t0 + 2 * H })
    const history = (await b.db.settings.get('dayHistory'))?.value as { startedAt: number; stoppedAt: number }[]
    expect(history.at(-1)).toMatchObject({ startedAt: t0, stoppedAt: t0 + 2 * H })
    await wait(30)
    const c = await boot() // survives a reload
    expect(c.dayState.get()).toMatchObject({ startedAt: t0 + 2 * H, bottleResetAt: t0 + 2 * H })
    // a stopped day is cleared completely
    await c.stopDay(t0 + 3 * H)
    await c.resetBottle(t0 + 4 * H)
    expect(c.dayState.get()).toMatchObject({ startedAt: null, stoppedAt: null, bottleResetAt: t0 + 4 * H })
  })
})
