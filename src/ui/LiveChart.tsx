import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { LiveSnapshot } from '../live/LiveSession'
import { EVENT_SHORT, findEvent, type ControlChange, type RoastEvent } from '../domain/events'
import { PHASE_COLOR } from '../domain/phases'
import type { ReferenceCurve } from '../domain/reference'
import { cssVar, themeState } from './theme'
import { controlSegments, formatControl, shade, visibleBadges } from './chartMarks'

/** For DOM elements (theme-aware CSS variables). The canvas reads the resolved values via cssVar. */
export const CURVE_COLORS = { bt: 'var(--curve-bt)', et: 'var(--curve-et)', ror: 'var(--curve-ror)' }

const axis = () => ({ stroke: cssVar('--chart-axis'), grid: { stroke: cssVar('--chart-grid'), width: 1 }, ticks: { show: false } })

export const fmtTime = (s: number) => {
  const sign = s < 0 ? '−' : ''
  const a = Math.abs(Math.round(s))
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`
}

export interface ChartOverlay {
  events: RoastEvent[]
  controls: ControlChange[]
  /** session time of CHARGE – the time axis shows roast time relative to it */
  chargeT: number | null
  /** session time where the roast ends (DROP), phases are drawn up to `now` before that */
  now: number | null
  /** background curve, aligned at CHARGE (drawn only once CHARGE is known) */
  reference?: ReferenceCurve | null
}

interface Props {
  snap: LiveSnapshot
  overlay: ChartOverlay
  follow: boolean
  onFollowChange: (follow: boolean) => void
  /** gives access to the chart (e.g. for PNG export) */
  onReady?: (u: uPlot | null) => void
}

/** Live BT/ET/RoR chart. Drag = zoom to selection, wheel = zoom, horizontal swipe = pan, double-click = live view. */
export function LiveChart({ snap, overlay, follow, onFollowChange, onReady }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const plot = useRef<uPlot | null>(null)
  const followRef = useRef(follow)
  const userRange = useRef<[number, number] | null>(null)
  const onFollowRef = useRef(onFollowChange)
  onFollowRef.current = onFollowChange
  const overlayRef = useRef(overlay)
  overlayRef.current = overlay
  const { theme } = themeState.use()

  const setFollow = (f: boolean) => {
    if (followRef.current === f) return
    followRef.current = f
    onFollowRef.current(f)
  }

  useEffect(() => {
    followRef.current = follow
    if (follow) plot.current?.setData(plot.current.data, true)
  }, [follow])

  useEffect(() => {
    const el = wrap.current!
    const AXIS = axis()
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height: el.clientHeight,
      legend: { show: false },
      cursor: { drag: { x: true, y: false, setScale: true }, points: { size: 7 } },
      scales: {
        x: {
          time: false,
          range: (_u, _min, max) => {
            if (!followRef.current && userRange.current) return userRange.current
            const last = Number.isFinite(max) ? max : 0
            const c = overlayRef.current.chargeT
            const refEnd = overlayRef.current.reference?.t.at(-1) ?? 0
            if (c !== null) return [Math.max(0, c - 30), Math.max(c + 720, c + Math.min(refEnd, 1500) + 30, last + 60)]
            return last < 540 ? [0, Math.max(600, last + 60)] : [last - 540, last + 60]
          },
        },
        temp: {
          range: (_u, min, max) => [
            Math.min(30, Number.isFinite(min) ? Math.floor(min / 10) * 10 : 30), // 30 °C: room for the gas/air bars
            Math.max(250, Number.isFinite(max) ? Math.ceil(max / 10) * 10 + 10 : 250),
          ],
        },
        ror: { range: (_u, _min, max) => [0, Math.max(20, Number.isFinite(max) ? Math.ceil(max) + 2 : 20)] },
      },
      axes: [
        {
          ...AXIS,
          incrs: [15, 30, 60, 120, 300, 600],
          // ticks on whole minutes of roast time (counted from CHARGE)
          splits: (_u, _ax, min, max, incr) => {
            const c = overlayRef.current.chargeT ?? 0
            const out: number[] = []
            for (let v = c + Math.ceil((min - c) / incr) * incr; v <= max; v += incr) out.push(v)
            return out
          },
          values: (_u, splits) => splits.map((v) => fmtTime(v - (overlayRef.current.chargeT ?? 0))),
        },
        { ...AXIS, scale: 'temp', values: (_u, splits) => splits.map((v) => `${v}°`), size: 48 },
        {
          ...AXIS,
          scale: 'ror',
          side: 1,
          grid: { show: false },
          stroke: cssVar('--curve-ror'),
          values: (_u, splits) => splits.map((v) => `${v}`),
          size: 40,
        },
      ],
      series: [
        {},
        { label: 'BT', scale: 'temp', stroke: cssVar('--curve-bt'), width: 2.5, spanGaps: false },
        { label: 'ET', scale: 'temp', stroke: cssVar('--curve-et'), width: 2, spanGaps: false },
        { label: 'RoR', scale: 'ror', stroke: cssVar('--curve-ror'), width: 2, spanGaps: false },
      ],
      hooks: {
        drawClear: [(u) => drawPhases(u, overlayRef.current), (u) => drawControlBars(u, overlayRef.current), (u) => drawReference(u, overlayRef.current)],
        draw: [(u) => drawMarks(u, overlayRef.current)],
        setSelect: [
          (u) => {
            if (u.select.width < 4) return
            userRange.current = [u.posToVal(u.select.left, 'x'), u.posToVal(u.select.left + u.select.width, 'x')]
            setFollow(false)
          },
        ],
      },
    }
    const u = new uPlot(opts, [[], [], [], []], el)
    plot.current = u
    onReady?.(u)

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { min, max } = u.scales.x
      if (min == null || max == null) return
      const span = max - min
      let nMin: number
      let nMax: number
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const shift = (e.deltaX / u.over.clientWidth) * span
        nMin = min + shift
        nMax = max + shift
      } else {
        const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15
        const at = u.posToVal(e.offsetX, 'x')
        nMin = at - (at - min) * factor
        nMax = at + (max - at) * factor
      }
      userRange.current = [nMin, nMax]
      setFollow(false)
      u.setScale('x', { min: nMin, max: nMax })
    }
    const onDbl = () => {
      userRange.current = null
      setFollow(true)
      u.setData(u.data, true)
    }
    u.over.addEventListener('wheel', onWheel, { passive: false })
    u.over.addEventListener('dblclick', onDbl)

    const ro = new ResizeObserver(() => u.setSize({ width: el.clientWidth, height: el.clientHeight }))
    ro.observe(el)
    return () => {
      ro.disconnect()
      onReady?.(null)
      u.destroy()
      plot.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]) // colours are baked into the chart → rebuild on theme change

  useEffect(() => {
    plot.current?.setData([snap.t, snap.bt, snap.et, snap.ror] as uPlot.AlignedData, true)
  }, [snap, overlay, theme])

  return <div ref={wrap} className="h-full w-full" />
}

// ── canvas overlays ──

function drawPhases(u: uPlot, o: ChartOverlay) {
  const charge = findEvent(o.events, 'CHARGE')
  if (!charge) return
  const dry = findEvent(o.events, 'DRY')
  const fcs = findEvent(o.events, 'FCs')
  const drop = findEvent(o.events, 'DROP')
  const end = drop?.t ?? o.now ?? charge.t
  const bands: [number, number, string][] = []
  bands.push([charge.t, dry?.t ?? fcs?.t ?? end, PHASE_COLOR.drying])
  if (dry) bands.push([dry.t, fcs?.t ?? end, PHASE_COLOR.maillard])
  if (fcs) bands.push([fcs.t, end, PHASE_COLOR.development])
  const ctx = u.ctx
  ctx.save()
  const { top, height } = u.bbox
  for (const [a, b, color] of bands) {
    const x0 = u.valToPos(a, 'x', true)
    const x1 = u.valToPos(b, 'x', true)
    if (x1 <= x0) continue
    ctx.fillStyle = color + '14' // ~8 % alpha
    ctx.fillRect(x0, top, x1 - x0, height)
    ctx.fillStyle = color + 'aa'
    ctx.fillRect(x0, top + height - 4 * devicePixelRatio, x1 - x0, 4 * devicePixelRatio)
  }
  ctx.restore()
}

function drawMarks(u: uPlot, o: ChartOverlay) {
  const ctx = u.ctx
  const dpr = devicePixelRatio
  const { top, height, left, width } = u.bbox
  ctx.save()
  ctx.font = `${600} ${11 * dpr}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'top'
  // events: dashed vertical line + label with temperature
  for (const e of o.events) {
    const x = u.valToPos(e.t, 'x', true)
    if (x < left || x > left + width) continue
    ctx.strokeStyle = cssVar('--chart-event-line')
    ctx.setLineDash([4 * dpr, 4 * dpr])
    ctx.lineWidth = dpr
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, top + height)
    ctx.stroke()
    ctx.setLineDash([])
    const label = `${e.type === 'CUSTOM' ? e.note || '★' : EVENT_SHORT[e.type]}${e.bt != null ? ' ' + e.bt.toFixed(1) + '°' : ''}`
    const w = ctx.measureText(label).width + 8 * dpr
    ctx.fillStyle = cssVar('--chart-label-bg')
    ctx.fillRect(x + 3 * dpr, top + 4 * dpr, w, 16 * dpr)
    ctx.fillStyle = e.auto ? cssVar('--chart-label-auto') : cssVar('--chart-label')
    ctx.fillText(label, x + 7 * dpr, top + 6.5 * dpr)
  }
  drawControlBadges(u, o)
  drawBtPoints(u, o)
  ctx.restore()
}

function drawReference(u: uPlot, o: ChartOverlay) {
  const ref = o.reference
  if (!ref || o.chargeT === null) return
  const ctx = u.ctx
  const dpr = devicePixelRatio
  const { left, top, width, height } = u.bbox
  ctx.save()
  ctx.beginPath()
  ctx.rect(left, top, width, height)
  ctx.clip()
  const line = (v: (number | null)[], scale: string, color: string, w: number) => {
    ctx.strokeStyle = color
    ctx.lineWidth = w * dpr
    ctx.setLineDash([6 * dpr, 5 * dpr])
    ctx.beginPath()
    let pen = false
    for (let i = 0; i < ref.t.length; i++) {
      const y = v[i]
      if (y === null) {
        pen = false
        continue
      }
      const px = u.valToPos(o.chargeT! + ref.t[i], 'x', true)
      const py = u.valToPos(y, scale, true)
      if (pen) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
      pen = true
    }
    ctx.stroke()
  }
  line(ref.et, 'temp', cssVar('--chart-ref-et'), 1.5)
  line(ref.bt, 'temp', cssVar('--chart-ref-bt'), 2)
  line(ref.ror, 'ror', cssVar('--chart-ref-ror'), 1.5)
  ctx.setLineDash([])
  ctx.font = `${500} ${10 * dpr}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'bottom'
  for (const e of ref.events) {
    if (e.type === 'CHARGE' || e.type === 'TP') continue
    const x = u.valToPos(o.chargeT + e.t, 'x', true)
    ctx.fillStyle = cssVar('--chart-ref-text')
    ctx.fillRect(x, top + height - 34 * dpr - 52 * dpr, dpr, 10 * dpr)
    ctx.fillText(`ref ${EVENT_SHORT[e.type]}`, x + 3 * dpr, top + height - 76 * dpr)
  }
  ctx.restore()
}

// ── manual control log: one bar per control, shade = value, value in a circle ──

const ROWS = { gas: 0, air: 1, drum: 2 } as const
const ROW_PITCH = 24 // px between rows (badge Ø 20 px)
const BAR_H = 10
const BADGE_R = 10

const rowY = (u: uPlot, row: number) => u.bbox.top + u.bbox.height - (16 + row * ROW_PITCH) * devicePixelRatio

function controlEnd(o: ChartOverlay) {
  return findEvent(o.events, 'DROP')?.t ?? o.now ?? 0
}

function drawControlBars(u: uPlot, o: ChartOverlay) {
  if (!o.controls.length) return
  const ctx = u.ctx
  const dpr = devicePixelRatio
  const { left, width } = u.bbox
  ctx.save()
  for (const sgm of controlSegments(o.controls, controlEnd(o))) {
    const x0 = Math.max(left, u.valToPos(sgm.from, 'x', true))
    const x1 = Math.min(left + width, u.valToPos(sgm.to, 'x', true))
    if (x1 <= x0) continue
    const y = rowY(u, ROWS[sgm.kind]) - (BAR_H / 2) * dpr
    ctx.fillStyle = shade(sgm.kind, sgm.value, 0.55)
    ctx.beginPath()
    ctx.roundRect(x0, y, x1 - x0, BAR_H * dpr, 3 * dpr)
    ctx.fill()
  }
  ctx.restore()
}

function drawControlBadges(u: uPlot, o: ChartOverlay) {
  if (!o.controls.length) return
  const ctx = u.ctx
  const dpr = devicePixelRatio
  const { left, width } = u.bbox
  const segs = controlSegments(o.controls, controlEnd(o))
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const kind of ['gas', 'air', 'drum'] as const) {
    const list = segs.filter((x) => x.kind === kind)
    const xs = list.map((x) => Math.max(left + BADGE_R * dpr, u.valToPos(x.from, 'x', true) + BADGE_R * dpr))
    const show = visibleBadges(xs, (BADGE_R * 2 + 2) * dpr)
    list.forEach((sgm, i) => {
      const cx = xs[i]
      if (!show[i] || cx > left + width) return
      const cy = rowY(u, ROWS[kind])
      const text = formatControl(kind, sgm.value)
      ctx.font = `700 ${(text.length > 2 ? 9 : 10.5) * dpr}px Inter, system-ui, sans-serif`
      ctx.beginPath()
      ctx.arc(cx, cy, BADGE_R * dpr, 0, Math.PI * 2)
      ctx.fillStyle = shade(kind, sgm.value)
      ctx.fill()
      ctx.lineWidth = 1.5 * dpr
      ctx.strokeStyle = cssVar('--c-chart')
      ctx.stroke()
      ctx.fillStyle = '#111318'
      ctx.fillText(text, cx, cy + 0.5 * dpr)
    })
  }
  ctx.restore()
}

// ── Dry End / FC start / Second Crack as points on the BT curve ──

const BT_POINTS = ['DRY', 'FCs', 'SC'] as const

function drawBtPoints(u: uPlot, o: ChartOverlay) {
  const ctx = u.ctx
  const dpr = devicePixelRatio
  const { left, top, width } = u.bbox
  ctx.save()
  ctx.font = `600 ${11 * dpr}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  for (const type of BT_POINTS) {
    const e = findEvent(o.events, type)
    if (!e || e.bt == null) continue
    const x = u.valToPos(e.t, 'x', true)
    const y = u.valToPos(e.bt, 'temp', true)
    if (x < left || x > left + width) continue
    // point
    ctx.beginPath()
    ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2)
    ctx.fillStyle = cssVar('--curve-bt')
    ctx.fill()
    ctx.lineWidth = 2 * dpr
    ctx.strokeStyle = cssVar('--c-chart')
    ctx.stroke()
    // label: name, roast time and temperature – above-left of the point (BT rises to the right)
    const time = o.chargeT === null ? '' : ` ${fmtTime(e.t - o.chargeT)}`
    const label = `${EVENT_SHORT[e.type]}${time} · ${e.bt.toFixed(1)}°`
    const w = ctx.measureText(label).width + 12 * dpr
    const h = 20 * dpr
    let bx = x - w - 8 * dpr
    let by = y - h - 8 * dpr
    if (bx < left) bx = x + 8 * dpr
    if (by < top) by = y + 8 * dpr
    ctx.fillStyle = cssVar('--chart-label-bg')
    ctx.strokeStyle = cssVar('--curve-bt')
    ctx.lineWidth = 1 * dpr
    ctx.beginPath()
    ctx.roundRect(bx, by, w, h, 6 * dpr)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = cssVar('--chart-label')
    ctx.fillText(label, bx + 6 * dpr, by + h / 2 + 0.5 * dpr)
  }
  ctx.restore()
}
