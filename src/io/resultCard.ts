// "Result card": one image with the curve and the key numbers of a roast – to share or print for the bag.
import type uPlot from 'uplot'
import { findEvent } from '../domain/events'
import { PHASE_COLOR, PHASE_LABEL } from '../domain/phases'
import type { RoastRecord } from '../storage/roastRecord'
import { cssVar } from '../ui/theme'

const W = 1080
const H = 1350 // 4:5, fits social posts and an A6 print
const PAD = 56

const fmt = (s: number | null | undefined) => {
  if (s == null) return '—'
  const a = Math.round(s)
  return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`
}
const c1 = (x: number | null | undefined, unit = '') => (x == null ? '—' : `${x.toFixed(1).replace('.', ',')}${unit}`)
const kg = (g: number | null) => (g == null ? '—' : `${(g / 1000).toLocaleString('cs-CZ', { maximumFractionDigits: 3 })} kg`)

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = src
  })
}

/** Word-wraps `text` into at most `maxLines` lines of `width` px. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width <= width) line = next
    else {
      if (line) lines.push(line)
      line = w
      if (lines.length === maxLines) break
    }
  }
  if (line && lines.length < maxLines) lines.push(line)
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, ' …')
  return lines
}

export async function resultCardPng(u: uPlot, r: RoastRecord): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const font = (w: number, px: number) => `${w} ${px}px Inter, system-ui, sans-serif`
  const bg = cssVar('--c-bg')
  const surface = cssVar('--c-surface')
  const border = cssVar('--c-border')
  const text = cssVar('--chart-label')
  const muted = cssVar('--chart-axis')

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // header
  ctx.fillStyle = muted
  ctx.font = font(700, 18)
  ctx.fillText('COFFEE ROASTING STUDIO', PAD, PAD + 18)
  ctx.fillStyle = text
  ctx.font = font(800, 50)
  const title = wrap(ctx, r.coffee || 'Pražení', W - 2 * PAD - 190, 2)
  title.forEach((l, i) => ctx.fillText(l, PAD, PAD + 82 + i * 58))
  let y = PAD + 82 + (title.length - 1) * 58 + 40
  ctx.fillStyle = muted
  ctx.font = font(500, 24)
  const date = new Date(r.roastDate).toLocaleString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  ctx.fillText(`${date}${r.rating != null ? `   ·   hodnocení ${r.rating}/10` : ''}`, PAD, y)
  const logo = await loadImage('./chart-logo.svg')
  if (logo) {
    const lw = 170
    const lh = (logo.height / logo.width) * lw || 107
    ctx.drawImage(logo, W - PAD - lw, PAD, lw, lh)
  }

  // chart (as rendered in the detail, in the current theme)
  y += 28
  const src = u.ctx.canvas
  const cw = W - 2 * PAD
  const ch = Math.min(560, (src.height / src.width) * cw)
  ctx.fillStyle = cssVar('--c-chart')
  ctx.strokeStyle = border
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(PAD, y, cw, ch + 24, 14)
  ctx.fill()
  ctx.stroke()
  ctx.drawImage(src, PAD + 12, y + 12, cw - 24, ch)
  y += ch + 24 + 28

  // key numbers
  const charge = findEvent(r.events, 'CHARGE')
  const fcs = findEvent(r.events, 'FCs')
  const drop = findEvent(r.events, 'DROP')
  const p = r.phases
  const stats: [string, string][] = [
    ['Celkem', fmt(p?.total)],
    ['DTR', c1(p?.dtr, ' %')],
    ['Drop BT', c1(drop?.bt, ' °C')],
    ['First Crack', fcs && charge ? `${fmt(fcs.t - charge.t)} · ${c1(fcs.bt, '°')}` : '—'],
    ['Ztráta', c1(r.lossPct, ' %')],
    ['Zelená → pražená', `${kg(r.greenWeightG)} → ${kg(r.roastedWeightG)}`],
  ]
  const bw = (cw - 2 * 16) / 3
  const bh = 104
  stats.forEach(([k, v], i) => {
    const x = PAD + (i % 3) * (bw + 16)
    const yy = y + Math.floor(i / 3) * (bh + 16)
    ctx.fillStyle = surface
    ctx.strokeStyle = border
    ctx.beginPath()
    ctx.roundRect(x, yy, bw, bh, 12)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = muted
    ctx.font = font(600, 18)
    ctx.fillText(k.toUpperCase(), x + 20, yy + 36)
    ctx.fillStyle = text
    ctx.font = font(800, v.length > 14 ? 26 : 34)
    ctx.fillText(v, x + 20, yy + 80)
  })
  y += 2 * bh + 16 + 32

  // phases bar
  if (p && p.total > 0) {
    const parts = (['drying', 'maillard', 'development'] as const).map((k) => [k, p[k] ?? 0] as const).filter(([, s]) => s > 0)
    let x = PAD
    for (const [k, s] of parts) {
      const w = (s / p.total) * cw
      ctx.fillStyle = PHASE_COLOR[k]
      ctx.beginPath()
      ctx.roundRect(x, y, Math.max(2, w - 4), 14, 7)
      ctx.fill()
      ctx.fillStyle = text
      ctx.font = font(700, 20)
      ctx.fillText(PHASE_LABEL[k], x, y + 44)
      ctx.fillStyle = muted
      ctx.font = font(500, 20)
      ctx.fillText(`${fmt(s)} · ${Math.round((s / p.total) * 100)} %`, x, y + 70)
      x += w
    }
    y += 104
  }

  // notes
  if (r.notes.trim()) {
    ctx.fillStyle = muted
    ctx.font = font(500, 22)
    wrap(ctx, r.notes, cw, Math.max(0, Math.floor((H - PAD - y) / 32))).forEach((l, i) => ctx.fillText(l, PAD, y + 8 + i * 32))
  }

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Kartu se nepodařilo vytvořit'))), 'image/png'))
}
