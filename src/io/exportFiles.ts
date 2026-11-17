import type uPlot from 'uplot'
import { EVENT_LABEL, findEvent, type ControlKind } from '../domain/events'
import { computeRoR } from '../domain/ror'
import { db } from '../storage/db'
import type { RoastRecord } from '../storage/roastRecord'

export function download(name: string, data: BlobPart, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const dec = (x: number | null, digits = 1) => (x === null ? '' : x.toFixed(digits).replace('.', ','))

/** CSV for Czech Excel/Numbers: `;` separator, decimal comma, one row per reading. */
export function recordToCsv(r: RoastRecord): string {
  const charge = findEvent(r.events, 'CHARGE')
  const c0 = charge?.t ?? 0
  const { t, bt, et } = r.samples
  const ror = computeRoR(t, bt)
  const state: Record<ControlKind, number | null> = { gas: null, air: null, drum: null }
  const controls = [...r.controls].sort((a, b) => a.t - b.t)
  let ci = 0
  const rows = ['cas_s;cas;BT;ET;RoR;udalost;plyn_kPa;vzduch_pct;buben_pct']
  for (let i = 0; i < t.length; i++) {
    while (ci < controls.length && controls[ci].t <= t[i] + 1e-6) {
      state[controls[ci].kind] = controls[ci].value
      ci++
    }
    const rel = t[i] - c0
    const events = r.events
      .filter((e) => Math.abs(e.t - t[i]) < 1e-6 || (e.t > (t[i - 1] ?? -Infinity) && e.t <= t[i]))
      .map((e) => (e.type === 'CUSTOM' ? e.note || 'vlastní' : EVENT_LABEL[e.type]))
      .join(' + ')
    const sign = rel < 0 ? '-' : ''
    const a = Math.abs(Math.round(rel))
    rows.push(
      [dec(rel, 2), `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`, dec(bt[i]), dec(et[i]), dec(ror[i]), events, dec(state.gas), dec(state.air, 0), dec(state.drum, 0)].join(';'),
    )
  }
  return '﻿' + rows.join('\r\n') + '\r\n' // BOM → Excel opens UTF-8 correctly
}

/** PNG of a chart with a title bar, on the dark app background. */
export async function chartToPng(u: uPlot, title: string, subtitle: string): Promise<Blob> {
  const src = u.ctx.canvas
  const dpr = devicePixelRatio
  const head = 64 * dpr
  const c = document.createElement('canvas')
  c.width = src.width + 32 * dpr
  c.height = src.height + head + 16 * dpr
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#1b1d23'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(src, 16 * dpr, head)
  ctx.fillStyle = '#f4f4f5'
  ctx.font = `600 ${20 * dpr}px Inter, system-ui, sans-serif`
  ctx.fillText(title, 20 * dpr, 30 * dpr)
  ctx.fillStyle = '#a1a1aa'
  ctx.font = `400 ${13 * dpr}px Inter, system-ui, sans-serif`
  ctx.fillText(subtitle, 20 * dpr, 52 * dpr)
  const legend: [string, string][] = [
    ['BT', '#5aa9ff'],
    ['ET', '#ff6b5a'],
    ['RoR', '#ffd166'],
  ]
  let x = c.width - 200 * dpr
  for (const [name, color] of legend) {
    ctx.fillStyle = color
    ctx.fillRect(x, 24 * dpr, 18 * dpr, 4 * dpr)
    ctx.fillStyle = '#e4e4e7'
    ctx.fillText(name, x + 24 * dpr, 30 * dpr)
    x += 64 * dpr
  }
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG se nepodařilo vytvořit'))), 'image/png'))
}

// ── complete backup of the app data ──

export const BACKUP_APP = 'coffee-roasting-studio'

export async function exportAll(): Promise<string> {
  const [roasts, coffees, profiles] = await Promise.all([db.roasts.toArray(), db.coffees.toArray(), db.profiles.toArray()])
  return JSON.stringify({ app: BACKUP_APP, schema: 1, exportedAt: new Date().toISOString(), roasts, coffees, profiles })
}

/** Merges a backup into the app (same ids are replaced, nothing is deleted). */
export async function importAll(text: string) {
  const data = JSON.parse(text)
  if (data?.app !== BACKUP_APP) throw new Error('Soubor není záloha Coffee Roasting Studio')
  const roasts = Array.isArray(data.roasts) ? data.roasts : []
  const coffees = Array.isArray(data.coffees) ? data.coffees : []
  const profiles = Array.isArray(data.profiles) ? data.profiles : []
  await db.transaction('rw', db.roasts, db.coffees, db.profiles, async () => {
    await db.coffees.bulkPut(coffees)
    await db.profiles.bulkPut(profiles)
    await db.roasts.bulkPut(roasts)
  })
  return { roasts: roasts.length, coffees: coffees.length, profiles: profiles.length }
}
