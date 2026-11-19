import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { LiveSnapshot } from '../live/LiveSession'
import { EVENT_SHORT, findEvent, type ControlChange, type ControlKind, type RoastEvent } from '../domain/events'
import { PHASE_COLOR } from '../domain/phases'
import { valueAt, type ReferenceCurve } from '../domain/reference'
import { chartScale, cssVar, laneScale, displayState, themeState } from './theme'
import { controlSegments, formatControl, shade, textOn, visibleBadges, type Segment } from './chartMarks'

/** For DOM elements (theme-aware CSS variables). The canvas reads the resolved values via cssVar. */
export const CURVE_COLORS = { bt: 'var(--curve-bt)', et: 'var(--curve-et)', ror: 'var(--curve-ror)' }

const axis = () => ({
  stroke: cssVar('--chart-axis'),
  grid: { stroke: cssVar('--chart-grid'), width: 1 },
  ticks: { show: false },
  font: `${Math.round(12 * chartScale())}px Inter, system-ui, sans-serif`,
})

// smooth (monotone spline – no overshoot), ~2.75 px, no point markers, soft gradient glow down to the x-axis
const spline = uPlot.paths.spline!()
const FILL_ALPHA = 0.15 // spec: 15–20 %; three overlapping areas → the lower end

/** Linear gradient from just under the curve's highest visible point (≈18 %) to fully transparent at the x-axis. */
function areaGradient(u: uPlot, si: number, color: string): CanvasGradient | string {
  const { top, height } = u.bbox
  if (!height) return 'transparent'
  const scale = u.series[si].scale!
  const ys = u.data[si] as (number | null)[]
  const xs = u.data[0] as number[]
  const { min = -Infinity, max = Infinity } = u.scales.x
  let peak = -Infinity
  for (let i = 0; i < ys.length; i++) {
    const v = ys[i]
    if (v != null && xs[i] >= min && xs[i] <= max && v > peak) peak = v
  }
  const y0 = Number.isFinite(peak) ? Math.min(top + height - 1, Math.max(top, u.valToPos(peak, scale, true))) : top
  const g = u.ctx.createLinearGradient(0, y0, 0, top + height)
  g.addColorStop(0, withAlpha(color, FILL_ALPHA))
  g.addColorStop(1, withAlpha(color, 0))
  return g
}

/** '#rrggbb' + alpha → rgba() */
const withAlpha = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  return m ? `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})` : hex
}

const curve = (label: string, scale: string, colorVar: string): uPlot.Series => {
  const color = cssVar(colorVar)
  return {
    label,
    scale,
    stroke: color,
    width: 2.75,
    paths: spline,
    points: { show: false },
    fill: (u, si) => areaGradient(u, si, color),
    spanGaps: false,
  }
}

/** New events flash for this long (ms): brighter line, label fades in. */
const FLASH_MS = 700
/** event id → performance.now() when it first appeared (shared: only the live chart gets new events) */
const flashes = new Map<string, number>()
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Zoom per scroll pixel (0.0015 → one mouse-wheel notch ≈ 9 %, a trackpad swipe zooms gently). */
const ZOOM_SENSITIVITY = 0.0015
const PAN_SENSITIVITY = 0.6

/** Time origin of the chart: CHARGE, or the preview anchor while a reference is shown before CHARGE. */
const zeroT = (o: ChartOverlay): number | null => o.chargeT ?? (o.reference ? (o.previewAt ?? 0) : null)

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
  /** background curve, aligned at CHARGE */
  reference?: ReferenceCurve | null
  /** before CHARGE the reference is previewed as if CHARGE happened at this session time (now) */
  previewAt?: number | null
  /** estimated Dry End / First Crack (session time) */
  estimates?: { type: 'DRY' | 'FCs'; t: number; target: number }[]
}

interface Props {
  snap: LiveSnapshot
  overlay: ChartOverlay
  follow: boolean
  onFollowChange: (follow: boolean) => void
  /** gives access to the chart (e.g. for PNG export) */
  onReady?: (u: uPlot | null) => void
  /** click on/near the BT curve (session time) – e.g. to add a note */
  onBtClick?: (t: number) => void
  /** click on an existing note point */
  onNoteClick?: (eventId: string) => void
}

/** Live BT/ET/RoR chart. Drag = zoom to selection, wheel = zoom, horizontal swipe = pan, double-click = live view. */
export function LiveChart({ snap, overlay, follow, onFollowChange, onReady, onBtClick, onNoteClick }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const plot = useRef<uPlot | null>(null)
  const followRef = useRef(follow)
  const userRange = useRef<[number, number] | null>(null)
  const onFollowRef = useRef(onFollowChange)
  onFollowRef.current = onFollowChange
  const overlayRef = useRef(overlay)
  overlayRef.current = overlay
  const laneSpaceRef = useRef(-1)
  const seenEvents = useRef<Set<string> | null>(null)
  const clickRef = useRef({ onBtClick, onNoteClick })
  clickRef.current = { onBtClick, onNoteClick }
  const { theme } = themeState.use()
  const { display } = displayState.use()

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
      padding: [8, null, (_u: uPlot) => lanesSpace(overlayRef.current), null] as uPlot.Padding,
      cursor: { drag: { x: true, y: false, setScale: true }, points: { size: 7 } },
      scales: {
        x: {
          time: false,
          range: (_u, _min, max) => {
            if (!followRef.current && userRange.current) return userRange.current
            const last = Number.isFinite(max) ? max : 0
            const c = zeroT(overlayRef.current)
            const refEnd = overlayRef.current.reference?.t.at(-1) ?? 0
            if (c !== null) return [c - 30, Math.max(c + 720, c + Math.min(refEnd, 1500) + 30, last + 60)]
            return last < 540 ? [0, Math.max(600, last + 60)] : [last - 540, last + 60]
          },
        },
        temp: {
          range: (_u, min, max) => [
            Math.min(60, Number.isFinite(min) ? Math.floor(min / 10) * 10 : 60),
            Math.max(250, Number.isFinite(max) ? Math.ceil(max / 10) * 10 + 10 : 250),
          ],
        },
        ror: { range: (_u, _min, max) => [0, Math.max(20, Number.isFinite(max) ? Math.ceil(max) + 2 : 20)] },
      },
      axes: [
        {
          ...AXIS,
          size: X_AXIS_SIZE * chartScale(),
          incrs: [15, 30, 60, 120, 300, 600],
          // ticks on whole minutes of roast time (counted from CHARGE)
          splits: (_u, _ax, min, max, incr) => {
            const c = zeroT(overlayRef.current) ?? 0
            const out: number[] = []
            for (let v = c + Math.ceil((min - c) / incr) * incr; v <= max; v += incr) out.push(v)
            return out
          },
          values: (_u, splits) => splits.map((v) => fmtTime(v - (zeroT(overlayRef.current) ?? 0))),
        },
        { ...AXIS, scale: 'temp', values: (_u, splits) => splits.map((v) => `${v}°`), size: 58 * chartScale() }, // wide enough for the lane captions below
        {
          ...AXIS,
          scale: 'ror',
          side: 1,
          grid: { show: false },
          stroke: cssVar('--curve-ror'),
          values: (_u, splits) => splits.map((v) => `${v}`),
          size: 46 * chartScale(), // room for the highlighted current RoR
        },
      ],
      series: [
        {},
        curve('BT', 'temp', '--curve-bt'),
        curve('ET', 'temp', '--curve-et'),
        curve('RoR', 'ror', '--curve-ror'),
      ],
      hooks: {
        drawClear: [(u) => drawPhases(u, overlayRef.current), (u) => drawControlBars(u, overlayRef.current), (u) => drawReference(u, overlayRef.current)],
        draw: [(u) => drawMarks(u, overlayRef.current), (u) => placeRorDot(u, overlayRef.current)],
        setCursor: [(u) => placeTip(u, overlayRef.current)],
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
    if (import.meta.env.DEV) Object.assign(window, { __chart: u }) // development only: lets UI checks read the scales

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { min, max } = u.scales.x
      if (min == null || max == null) return
      const span = max - min
      let nMin: number
      let nMax: number
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const shift = (e.deltaX / u.over.clientWidth) * span * PAN_SENSITIVITY
        nMin = min + shift
        nMax = max + shift
      } else {
        // proportional to the scroll amount: a trackpad sends many tiny deltas, a mouse wheel ~100 per notch
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY // lines → px
        const factor = Math.exp(Math.max(-60, Math.min(60, dy)) * ZOOM_SENSITIVITY)
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
    // click (not a drag-zoom) on a note point → edit/delete; near the BT curve → new note there
    let downX = 0
    const onDown = (e: MouseEvent) => (downX = e.clientX)
    const onClick = (e: MouseEvent) => {
      if (Math.abs(e.clientX - downX) > 3) return
      const x = e.offsetX
      const y = e.offsetY
      const tAt = u.posToVal(x, 'x')
      for (const ev of overlayRef.current.events) {
        if (ev.type !== 'CUSTOM' || ev.bt == null) continue
        const px = u.valToPos(ev.t, 'x')
        const py = u.valToPos(ev.bt, 'temp')
        if (Math.hypot(px - x, py - y) <= 12) return clickRef.current.onNoteClick?.(ev.id)
      }
      if (!clickRef.current.onBtClick) return
      const data = u.data as (number | null)[][]
      const xs = data[0] as number[]
      if (!xs.length) return
      let i = 0
      for (let k = 0; k < xs.length; k++) if (Math.abs(xs[k] - tAt) < Math.abs(xs[i] - tAt)) i = k
      const bt = data[1][i]
      if (bt == null || Math.abs(xs[i] - tAt) > 10) return
      if (Math.abs(u.valToPos(bt, 'temp') - y) <= 22) clickRef.current.onBtClick(xs[i])
    }
    u.over.addEventListener('mousedown', onDown)
    u.over.addEventListener('click', onClick)
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
  }, [theme, display]) // colours and sizes are baked into the chart → rebuild on theme / monitor change

  useEffect(() => {
    const u = plot.current
    if (!u) return
    const space = lanesSpace(overlay)
    if (space !== laneSpaceRef.current) {
      laneSpaceRef.current = space
      u.setSize({ width: u.width, height: u.height }) // recompute padding for the lanes under the axis
    }
    u.setData([snap.t, snap.bt, snap.et, snap.ror] as uPlot.AlignedData, true)
    // events that were not there before flash briefly (not the ones present when the chart opened)
    const ids = overlay.events.map((e) => e.id)
    if (seenEvents.current === null) seenEvents.current = new Set(ids)
    const fresh = ids.filter((id) => !seenEvents.current!.has(id))
    fresh.forEach((id) => seenEvents.current!.add(id))
    if (fresh.length && !reducedMotion()) {
      const t0 = performance.now()
      fresh.forEach((id) => flashes.set(id, t0))
      const tick = () => {
        if (plot.current !== u) return
        u.redraw(false, false)
        if (performance.now() - t0 < FLASH_MS) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }
  }, [snap, overlay, theme, display])

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
  const dpr = devicePixelRatio * chartScale() // css px × monitor scale
  const { top, height, left, width } = u.bbox
  ctx.save()
  ctx.font = `700 ${13 * dpr}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'top'
  // events: dashed vertical line + label with temperature; a label that would overlap the previous one goes a row lower
  const rowEnd: number[] = []
  for (const e of [...o.events].sort((p, q) => p.t - q.t)) {
    const x = u.valToPos(e.t, 'x', true)
    if (x < left || x > left + width) continue
    const since = flashes.has(e.id) ? performance.now() - flashes.get(e.id)! : Infinity
    const flash = since < FLASH_MS ? 1 - since / FLASH_MS : 0 // 1 → 0 right after the event was marked
    ctx.strokeStyle = cssVar('--chart-event-line')
    ctx.setLineDash([4 * dpr, 4 * dpr])
    ctx.lineWidth = dpr
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, top + height)
    ctx.stroke()
    ctx.setLineDash([])
    if (flash > 0) {
      ctx.save()
      ctx.strokeStyle = cssVar('--c-accent')
      ctx.globalAlpha = flash
      ctx.lineWidth = (1 + 3 * flash) * dpr
      ctx.shadowColor = cssVar('--c-accent')
      ctx.shadowBlur = 14 * dpr * flash
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, top + height)
      ctx.stroke()
      ctx.restore()
    }
    ctx.globalAlpha = since < FLASH_MS ? Math.min(1, since / 250) : 1 // label fades in
    if (e.type === 'CUSTOM') continue // notes are labelled on the BT curve (drawNotes)
    const label = `${EVENT_SHORT[e.type]}${e.bt != null ? ' ' + e.bt.toFixed(1) + '°' : ''}`
    const w = ctx.measureText(label).width + 10 * dpr
    let row = 0
    while ((rowEnd[row] ?? -Infinity) > x + 3 * dpr) row++
    rowEnd[row] = x + 3 * dpr + w + 4 * dpr
    const y = top + (4 + row * 22) * dpr
    ctx.fillStyle = cssVar('--chart-label-bg')
    ctx.fillRect(x + 3 * dpr, y, w, 19 * dpr)
    ctx.fillStyle = e.auto ? cssVar('--chart-label-auto') : cssVar('--chart-label')
    ctx.fillText(label, x + 8 * dpr, y + 3 * dpr)
    ctx.globalAlpha = 1
  }
  ctx.globalAlpha = 1
  drawLiveTail(u, o)
  drawControlBadges(u, o)
  drawNowLine(u, o)
  drawRorValue(u)
  drawBtPoints(u, o)
  drawNotes(u, o)
  drawRefPoints(u, o)
  drawEstimates(u, o)
  ctx.restore()
}

/** Half width of the tolerance band around the reference BT (°C). */
const TOLERANCE_C = 3

function drawReference(u: uPlot, o: ChartOverlay) {
  const ref = o.reference
  const zero = zeroT(o)
  if (!ref || zero === null) return
  const ctx = u.ctx
  const dpr = devicePixelRatio * chartScale() // css px × monitor scale
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
      const px = u.valToPos(zero + ref.t[i], 'x', true)
      const py = u.valToPos(y, scale, true)
      if (pen) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
      pen = true
    }
    ctx.stroke()
  }
  // ±TOLERANCE_C band around the reference BT: shows at a glance when the roast leaves the profile
  ctx.fillStyle = withAlpha(cssVar('--curve-bt'), 0.09)
  let seg: number[] = []
  const flush = () => {
    if (seg.length > 1) {
      ctx.beginPath()
      seg.forEach((i, k) => {
        const px = u.valToPos(zero + ref.t[i], 'x', true)
        const py = u.valToPos((ref.bt[i] as number) + TOLERANCE_C, 'temp', true)
        if (k) ctx.lineTo(px, py)
        else ctx.moveTo(px, py)
      })
      for (let k = seg.length - 1; k >= 0; k--) ctx.lineTo(u.valToPos(zero + ref.t[seg[k]], 'x', true), u.valToPos((ref.bt[seg[k]] as number) - TOLERANCE_C, 'temp', true))
      ctx.closePath()
      ctx.fill()
    }
    seg = []
  }
  for (let i = 0; i < ref.t.length; i++) {
    if (ref.bt[i] === null) flush()
    else seg.push(i)
  }
  flush()
  line(ref.et, 'temp', cssVar('--chart-ref-et'), 1.5)
  line(ref.bt, 'temp', cssVar('--chart-ref-bt'), 2)
  line(ref.ror, 'ror', cssVar('--chart-ref-ror'), 1.5)
  ctx.setLineDash([])
  // reference events are labelled on the reference BT curve (drawRefPoints)
  ctx.restore()
}

// ── manual control log: one bar per control, shade = value, value in a circle ──
// Lanes from the bottom: your gas, your air, (drum if it changed), then the reference plan
// ("plán") for gas/air/drum – so you can see what to set and when.

// lanes sit below the time axis (outside the plot), compact
const X_AXIS_SIZE = 26 // px reserved for the time labels
const LANE_PITCH = 21 // px per lane (value box 16 px high)
const LINE_W = 2 // your setting: solid line
const PLAN_LINE_W = 1.5 // reference plan: dashed line
const BOX_H = 16
const BOX_FONT = 11

/** Room needed under the time axis for the gas/air/drum lanes (css px). */
const lanesSpace = (o: ChartOverlay) => {
  const n = lanes(o).length
  return (n ? n * LANE_PITCH + 6 : 4) * laneScale()
}

interface Lane {
  kind: ControlKind
  plan: boolean
  segs: Segment[]
}

function lanes(o: ChartOverlay): Lane[] {
  const out: Lane[] = []
  const live = controlSegments(o.controls, findEvent(o.events, 'DROP')?.t ?? o.now ?? 0)
  for (const kind of ['gas', 'air', 'drum'] as ControlKind[]) {
    const segs = live.filter((x) => x.kind === kind)
    // drum only matters if it was changed during the roast
    if (segs.length && (kind !== 'drum' || new Set(segs.map((x) => x.value)).size > 1)) out.push({ kind, plan: false, segs })
  }
  const zero = zeroT(o)
  const ref = o.reference
  if (ref && zero !== null && ref.controls.length) {
    const end = zero + (findEvent(ref.events, 'DROP')?.t ?? ref.t[ref.t.length - 1] ?? 0)
    const plan = controlSegments(
      ref.controls.map((c) => ({ ...c, t: zero + c.t })),
      end,
    )
    for (const kind of ['gas', 'air', 'drum'] as ControlKind[]) {
      const segs = plan.filter((x) => x.kind === kind)
      if (segs.length && (kind !== 'drum' || new Set(segs.map((x) => x.value)).size > 1)) out.push({ kind, plan: true, segs })
    }
  }
  return out
}

const laneY = (u: uPlot, i: number) => u.bbox.top + u.bbox.height + X_AXIS_SIZE * devicePixelRatio * chartScale() + (4 + LANE_PITCH / 2 + i * LANE_PITCH) * devicePixelRatio * laneScale()

function drawControlBars(u: uPlot, o: ChartOverlay) {
  const ls = lanes(o)
  if (!ls.length) return
  const ctx = u.ctx
  const dpr = devicePixelRatio * laneScale()
  const { left, width } = u.bbox
  ctx.save()
  ctx.lineCap = 'round'
  ls.forEach((lane, i) => {
    const y = laneY(u, i)
    for (const sgm of lane.segs) {
      const x0 = Math.max(left, u.valToPos(sgm.from, 'x', true))
      const x1 = Math.min(left + width, u.valToPos(sgm.to, 'x', true))
      if (x1 <= x0) continue
      ctx.strokeStyle = shade(sgm.kind, sgm.value, lane.plan ? 0.75 : 0.95)
      ctx.lineWidth = (lane.plan ? PLAN_LINE_W : LINE_W) * dpr
      // a change made in the last few seconds glows softly
      const fresh = !lane.plan && o.now !== null && o.now - sgm.from >= 0 && o.now - sgm.from <= 3
      ctx.shadowColor = shade(sgm.kind, sgm.value)
      ctx.shadowBlur = fresh ? 10 * dpr : 0
      ctx.setLineDash(lane.plan ? [4 * dpr, 3 * dpr] : [])
      ctx.beginPath()
      ctx.moveTo(x0, y)
      ctx.lineTo(x1, y)
      ctx.stroke()
    }
  })
  ctx.restore()
}

/** Value of each change in a rounded rectangle at the start of its line. */
function drawControlBadges(u: uPlot, o: ChartOverlay) {
  const ls = lanes(o)
  if (!ls.length) return
  const ctx = u.ctx
  const dpr = devicePixelRatio * laneScale()
  const { left, width } = u.bbox
  const h = BOX_H * dpr
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${BOX_FONT * dpr}px Inter, system-ui, sans-serif`
  ls.forEach((lane, li) => {
    const texts = lane.segs.map((x) => formatControl(x.kind, x.value))
    const ws = texts.map((t) => Math.max(ctx.measureText(t).width + 8 * dpr, h * 1.3))
    const xs = lane.segs.map((x) => Math.max(left, u.valToPos(x.from, 'x', true)))
    const show = visibleBadges(xs, Math.max(...ws) + 2 * dpr)
    const cy = laneY(u, li)
    lane.segs.forEach((sgm, i) => {
      const x = Math.min(xs[i], left + width - ws[i])
      if (!show[i] || xs[i] > left + width) return
      ctx.beginPath()
      ctx.roundRect(x, cy - h / 2, ws[i], h, 4 * dpr)
      if (lane.plan) {
        // plan: tinted box with a coloured border, text in the normal label colour (readable in both themes)
        ctx.fillStyle = cssVar('--c-chart')
        ctx.fill()
        ctx.fillStyle = shade(sgm.kind, sgm.value, 0.3)
        ctx.fill()
        ctx.lineWidth = 1.25 * dpr
        ctx.setLineDash([3 * dpr, 2 * dpr])
        ctx.strokeStyle = shade(sgm.kind, sgm.value)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = cssVar('--chart-label')
      } else {
        ctx.fillStyle = shade(sgm.kind, sgm.value)
        ctx.fill()
        ctx.fillStyle = textOn(sgm.kind, sgm.value)
      }
      ctx.fillText(texts[i], x + ws[i] / 2, cy + 0.5 * dpr)
    })
  })
  // lane captions left of the plot (under the temperature axis)
  ctx.textAlign = 'right'
  ctx.font = `600 ${9.5 * devicePixelRatio * chartScale()}px Inter, system-ui, sans-serif` // must fit under the temperature axis
  const name = { gas: 'plyn', air: 'vzduch', drum: 'buben' } as const
  ls.forEach((lane, li) => {
    ctx.fillStyle = cssVar('--chart-axis')
    ctx.fillText(`${lane.plan ? 'plán ' : ''}${name[lane.kind]}`, left - 4 * devicePixelRatio, laneY(u, li))
  })
  ctx.restore()
}

// ── Dry End / FC start / Second Crack as points on the BT curve ──

const BT_POINTS = ['TP', 'DRY', 'FCs', 'SC'] as const

function drawBtPoints(u: uPlot, o: ChartOverlay) {
  const ctx = u.ctx
  const dpr = devicePixelRatio * chartScale() // css px × monitor scale
  const { left, top, width } = u.bbox
  ctx.save()
  ctx.font = `700 ${13.5 * dpr}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  for (const type of BT_POINTS) {
    const e = findEvent(o.events, type)
    if (!e || e.bt == null) continue
    const x = u.valToPos(e.t, 'x', true)
    const y = u.valToPos(e.bt, 'temp', true)
    if (x < left || x > left + width) continue
    // point
    ctx.beginPath()
    ctx.arc(x, y, 6 * dpr, 0, Math.PI * 2)
    ctx.fillStyle = cssVar('--curve-bt')
    ctx.fill()
    ctx.lineWidth = 2 * dpr
    ctx.strokeStyle = cssVar('--c-chart')
    ctx.stroke()
    // label: name, roast time and temperature – above-left of the point (BT rises to the right)
    const time = o.chargeT === null ? '' : ` ${fmtTime(e.t - o.chargeT)}`
    const label = `${EVENT_SHORT[e.type]}${time} · ${e.bt.toFixed(1)}°`
    const w = ctx.measureText(label).width + 14 * dpr
    const h = 25 * dpr
    let bx = x - w - 8 * dpr
    let by = y - h - 8 * dpr
    if (bx < left) bx = x + 8 * dpr
    if (by < top) by = y + 8 * dpr
    ctx.fillStyle = cssVar('--chart-label-bg')
    ctx.strokeStyle = cssVar('--curve-bt')
    ctx.lineWidth = 1.5 * dpr
    ctx.beginPath()
    ctx.roundRect(bx, by, w, h, 7 * dpr)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = cssVar('--chart-label')
    ctx.fillText(label, bx + 7 * dpr, by + h / 2 + 0.5 * dpr)
  }
  ctx.restore()
}

/** From this many seconds before the expected FC the estimate turns into a countdown. */
const FC_COUNTDOWN_SEC = 60

// ── estimated Dry End / First Crack: dotted line + target point on BT ──
function drawEstimates(u: uPlot, o: ChartOverlay) {
  if (!o.estimates?.length) return
  const ctx = u.ctx
  const dpr = devicePixelRatio * chartScale() // css px × monitor scale
  const { left, top, width, height } = u.bbox
  ctx.save()
  ctx.font = `italic 700 ${13 * dpr}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'top'
  for (const e of o.estimates) {
    const x = u.valToPos(e.t, 'x', true)
    if (x < left || x > left + width) continue
    const y = u.valToPos(e.target, 'temp', true)
    // the last minute before the expected First Crack: stronger label with a countdown
    const inSec = o.now === null ? null : e.t - o.now
    const soon = e.type === 'FCs' && inSec !== null && inSec > 0 && inSec <= FC_COUNTDOWN_SEC
    ctx.strokeStyle = cssVar('--curve-bt')
    ctx.globalAlpha = soon ? 0.95 : 0.55
    ctx.setLineDash([2 * dpr, 4 * dpr])
    ctx.lineWidth = 1.5 * dpr
    ctx.beginPath()
    ctx.moveTo(x, top + 28 * dpr)
    ctx.lineTo(x, top + height)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2)
    ctx.lineWidth = 2 * dpr
    ctx.stroke()
    ctx.globalAlpha = 1
    if (soon) {
      ctx.font = `800 ${15 * dpr}px Inter, system-ui, sans-serif`
      const label = `FC za ${fmtTime(inSec!)}`
      const w = ctx.measureText(label).width + 16 * dpr
      const bx = Math.min(x + 4 * dpr, left + width - w)
      ctx.fillStyle = cssVar('--curve-bt')
      ctx.beginPath()
      ctx.roundRect(bx, top + 28 * dpr, w, 24 * dpr, 6 * dpr)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillText(label, bx + 8 * dpr, top + 32 * dpr)
      ctx.font = `italic 700 ${13 * dpr}px Inter, system-ui, sans-serif`
      continue
    }
    const label = `~${EVENT_SHORT[e.type]} ${o.chargeT === null ? '' : fmtTime(e.t - o.chargeT)}`
    const w = ctx.measureText(label).width + 12 * dpr
    const bx = Math.min(x + 4 * dpr, left + width - w)
    ctx.fillStyle = cssVar('--chart-label-bg')
    ctx.fillRect(bx, top + 28 * dpr, w, 20 * dpr)
    ctx.fillStyle = cssVar('--chart-label-auto')
    ctx.fillText(label, bx + 6 * dpr, top + 31.5 * dpr)
  }
  ctx.restore()
}

// ── reference events as badges on the reference BT curve ──
const REF_POINTS = ['CHARGE', 'DRY', 'FCs', 'DROP'] as const
/** A reference event lights up this many seconds before the live roast reaches its time. */
const REF_GLOW_SEC = 30

function drawRefPoints(u: uPlot, o: ChartOverlay) {
  const ref = o.reference
  const zero = zeroT(o)
  if (!ref || zero === null) return
  const ctx = u.ctx
  const dpr = devicePixelRatio * chartScale() // css px × monitor scale
  const { left, top, width, height } = u.bbox
  ctx.save()
  ctx.font = `600 ${12.5 * dpr}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  for (const type of REF_POINTS) {
    const e = findEvent(ref.events, type)
    if (!e || e.bt == null) continue
    const x = u.valToPos(zero + e.t, 'x', true)
    const y = u.valToPos(e.bt, 'temp', true)
    if (x < left || x > left + width) continue
    const ahead = o.now === null || o.chargeT === null || findEvent(o.events, 'DROP') ? null : zero + e.t - o.now
    const near = ahead !== null && ahead >= 0 && ahead <= REF_GLOW_SEC
    ctx.shadowColor = cssVar('--curve-bt')
    ctx.shadowBlur = near ? 14 * dpr : 0
    // hollow point on the dashed reference curve
    ctx.beginPath()
    ctx.arc(x, y, 4.5 * dpr, 0, Math.PI * 2)
    ctx.fillStyle = cssVar('--c-chart')
    ctx.fill()
    ctx.lineWidth = 2 * dpr
    ctx.strokeStyle = cssVar('--chart-ref-bt')
    ctx.stroke()
    // label below-right (live labels sit above-left), time for all but CHARGE
    const time = type === 'CHARGE' ? '' : ` ${fmtTime(e.t)}`
    const label = `ref ${EVENT_SHORT[type]}${time} · ${e.bt.toFixed(1)}°`
    const w = ctx.measureText(label).width + 14 * dpr
    const h = 22 * dpr
    let bx = x + 8 * dpr
    let by = y + 8 * dpr
    if (bx + w > left + width) bx = x - w - 8 * dpr
    if (by + h > top + height) by = y - h - 8 * dpr
    ctx.beginPath()
    ctx.roundRect(bx, by, w, h, 6 * dpr)
    ctx.fillStyle = cssVar('--chart-label-bg')
    ctx.fill()
    ctx.setLineDash(near ? [] : [3 * dpr, 2 * dpr])
    ctx.lineWidth = near ? 1.5 * dpr : dpr
    ctx.strokeStyle = near ? cssVar('--curve-bt') : cssVar('--chart-ref-bt')
    ctx.stroke()
    ctx.setLineDash([])
    ctx.shadowBlur = 0
    ctx.fillStyle = near ? cssVar('--chart-label') : cssVar('--chart-label-auto')
    ctx.fillText(label, bx + 7 * dpr, by + h / 2 + 0.5 * dpr)
  }
  ctx.restore()
}

// ── notes (custom events) as amber points on the BT curve ──
function drawNotes(u: uPlot, o: ChartOverlay) {
  const notes = o.events.filter((e) => e.type === 'CUSTOM' && e.bt != null)
  if (!notes.length) return
  const ctx = u.ctx
  const dpr = devicePixelRatio * chartScale() // css px × monitor scale
  const { left, top, width } = u.bbox
  ctx.save()
  ctx.font = `600 ${13 * dpr}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  for (const e of notes) {
    const x = u.valToPos(e.t, 'x', true)
    const y = u.valToPos(e.bt as number, 'temp', true)
    if (x < left || x > left + width) continue
    ctx.beginPath()
    ctx.arc(x, y, 6 * dpr, 0, Math.PI * 2)
    ctx.fillStyle = '#f59e0b'
    ctx.fill()
    ctx.lineWidth = 2 * dpr
    ctx.strokeStyle = cssVar('--c-chart')
    ctx.stroke()
    const time = o.chargeT === null ? '' : `${fmtTime(e.t - o.chargeT)} · `
    const text = `★ ${time}${(e.note || 'poznámka').slice(0, 40)}`
    const w = ctx.measureText(text).width + 14 * dpr
    const h = 24 * dpr
    let bx = x - w / 2
    let by = y - h - 12 * dpr
    bx = Math.min(Math.max(bx, left), left + width - w)
    if (by < top) by = y + 12 * dpr
    ctx.beginPath()
    ctx.roundRect(bx, by, w, h, 6 * dpr)
    ctx.fillStyle = cssVar('--chart-label-bg')
    ctx.fill()
    ctx.lineWidth = 1.5 * dpr
    ctx.strokeStyle = '#f59e0b'
    ctx.stroke()
    ctx.fillStyle = cssVar('--chart-label')
    ctx.fillText(text, bx + 6 * dpr, by + h / 2 + 0.5 * dpr)
  }
  ctx.restore()
}


// ── current RoR highlighted on the RoR scale (right axis): big bold number in a tag ──
function drawRorValue(u: uPlot) {
  const ror = u.data[3] as (number | null)[]
  let v: number | null = null
  for (let i = ror.length - 1; i >= 0 && i >= ror.length - 3; i--) if (ror[i] != null) { v = ror[i]; break }
  if (v === null) return
  const ctx = u.ctx
  const dpr = devicePixelRatio * chartScale()
  const { left, top, width, height } = u.bbox
  const y = Math.min(top + height, Math.max(top, u.valToPos(v, 'ror', true)))
  const x = left + width + 2 * dpr
  const text = v.toFixed(1).replace('.', ',')
  ctx.save()
  ctx.font = `800 ${14 * dpr}px Inter, system-ui, sans-serif`
  const w = ctx.measureText(text).width + 10 * dpr
  const h = 20 * dpr
  ctx.fillStyle = cssVar('--curve-ror')
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + 6 * dpr, y - h / 2)
  ctx.lineTo(x + 6 * dpr + w, y - h / 2)
  ctx.lineTo(x + 6 * dpr + w, y + h / 2)
  ctx.lineTo(x + 6 * dpr, y + h / 2)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + 11 * dpr, y + 0.5 * dpr)
  ctx.restore()
}

// ── pulsing dot at the live end of the RoR curve (a DOM element, so it can animate between redraws) ──
function placeRorDot(u: uPlot, o: ChartOverlay) {
  let dot = u.over.querySelector<HTMLDivElement>('.ror-pulse')
  if (!dot) {
    dot = document.createElement('div')
    dot.className = 'ror-pulse'
    u.over.appendChild(dot)
  }
  const t = u.data[0] as number[]
  const ror = u.data[3] as (number | null)[]
  const i = ror.length - 1
  const v = i >= 0 ? ror[i] : null
  const { min, max } = u.scales.ror
  const live = !findEvent(o.events, 'DROP')
  const x = v == null ? NaN : u.valToPos(t[i], 'x')
  const visible = live && v != null && min != null && max != null && v >= min && v <= max && x >= 0 && x <= u.over.clientWidth
  dot.style.display = visible ? 'block' : 'none'
  if (!visible) return
  const size = 9 * chartScale()
  dot.style.width = dot.style.height = `${size}px`
  dot.style.left = `${x}px`
  dot.style.top = `${u.valToPos(v!, 'ror')}px`
}

// ── "now" line: thin vertical line at the latest reading with the roast time in a pill on the time axis ──
function drawNowLine(u: uPlot, o: ChartOverlay) {
  const t = u.data[0] as number[]
  const last = t.at(-1)
  if (last === undefined || findEvent(o.events, 'DROP')) return
  const ctx = u.ctx
  const dpr = devicePixelRatio * chartScale()
  const { left, top, width, height } = u.bbox
  const x = u.valToPos(last, 'x', true)
  if (x < left || x > left + width) return
  ctx.save()
  ctx.strokeStyle = cssVar('--chart-label')
  ctx.globalAlpha = 0.3
  ctx.lineWidth = devicePixelRatio
  ctx.beginPath()
  ctx.moveTo(x, top)
  ctx.lineTo(x, top + height)
  ctx.stroke()
  ctx.globalAlpha = 1
  const zero = zeroT(o)
  const text = fmtTime(zero === null ? last - (t[0] ?? 0) : last - zero)
  ctx.font = `700 ${11 * dpr}px Inter, system-ui, sans-serif`
  const w = ctx.measureText(text).width + 12 * dpr
  const h = 17 * dpr
  const bx = Math.min(Math.max(x - w / 2, left), left + width - w)
  ctx.fillStyle = cssVar('--chart-label')
  ctx.beginPath()
  ctx.roundRect(bx, top + height + 3 * dpr, w, h, h / 2)
  ctx.fill()
  ctx.fillStyle = cssVar('--c-chart')
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(text, bx + w / 2, top + height + 3 * dpr + h / 2 + 0.5 * dpr)
  ctx.restore()
}

// ── hover detail: values at the cursor, the gas/air set at that moment and the deviation from the reference ──
function placeTip(u: uPlot, o: ChartOverlay) {
  let tip = u.over.querySelector<HTMLDivElement>('.chart-tip')
  if (!tip) {
    tip = document.createElement('div')
    tip.className = 'chart-tip'
    u.over.appendChild(tip)
  }
  const { left, top, idx } = u.cursor
  const xs = u.data[0] as number[]
  if (idx == null || left == null || top == null || left < 0 || !xs.length) {
    tip.style.display = 'none'
    return
  }
  const t = xs[idx]
  const val = (k: number) => (u.data[k] as (number | null)[])[idx]
  const f1 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1).replace('.', ','))
  const zero = zeroT(o)
  const at = (kind: ControlKind) => {
    let v: number | null = null
    for (const c of o.controls) if (c.kind === kind && c.t <= t) v = c.value
    return v === null ? '—' : formatControl(kind, v)
  }
  const rows: [string, string, string][] = [
    ['BT', `${f1(val(1))} °C`, 'var(--curve-bt)'],
    ['ET', `${f1(val(2))} °C`, 'var(--curve-et)'],
    ['RoR', f1(val(3)), 'var(--curve-ror)'],
  ]
  if (o.controls.length) {
    rows.push(['plyn', `${at('gas')} kPa`, 'var(--chart-axis)'])
    rows.push(['vzduch', `${at('air')} %`, 'var(--chart-axis)'])
  }
  const bt = val(1)
  if (o.reference && zero !== null && bt != null) {
    const r = valueAt(o.reference.t, o.reference.bt, t - zero)
    if (r !== null) {
      const d = bt - r
      const color = Math.abs(d) <= TOLERANCE_C ? 'var(--color-emerald-400)' : 'var(--color-rose-400)'
      rows.push(['vs ref', `${d >= 0 ? '+' : '−'}${f1(Math.abs(d))} °C`, color])
    }
  }
  const time = fmtTime(zero === null ? t - xs[0] : t - zero)
  tip.innerHTML =
    `<div class="chart-tip-time">${time}</div>` +
    rows.map(([k, v, c]) => `<div class="chart-tip-row"><span style="color:${c}">${k}</span><b>${v}</b></div>`).join('')
  tip.style.display = 'block'
  tip.style.fontSize = `${12 * chartScale()}px`
  const w = tip.offsetWidth
  const h = tip.offsetHeight
  const x = left + 16 + w > u.over.clientWidth ? left - 16 - w : left + 16
  tip.style.left = `${Math.max(0, x)}px`
  tip.style.top = `${Math.min(Math.max(0, top - h / 2), u.over.clientHeight - h)}px`
}

// ── the newest seconds of BT glow slightly: shows where the curve is being drawn ──
function drawLiveTail(u: uPlot, o: ChartOverlay) {
  if (o.chargeT === null || findEvent(o.events, 'DROP')) return
  const t = u.data[0] as number[]
  const bt = u.data[1] as (number | null)[]
  const pts: [number, number][] = []
  for (let i = bt.length - 1; i >= 0 && pts.length < 4 && t[t.length - 1] - t[i] <= 3; i--) {
    const v = bt[i]
    if (v != null) pts.unshift([u.valToPos(t[i], 'x', true), u.valToPos(v, 'temp', true)])
  }
  if (pts.length < 2) return
  const ctx = u.ctx
  const dpr = devicePixelRatio * chartScale()
  ctx.save()
  ctx.strokeStyle = cssVar('--curve-bt')
  ctx.shadowColor = cssVar('--curve-bt')
  ctx.shadowBlur = 12 * dpr
  ctx.lineWidth = 3.5 * devicePixelRatio
  ctx.lineCap = 'round'
  ctx.beginPath()
  pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.stroke()
  ctx.restore()
}
