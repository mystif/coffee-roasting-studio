import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { LiveSnapshot } from '../live/LiveSession'
import { EVENT_SHORT, findEvent, type ControlChange, type ControlKind, type RoastEvent } from '../domain/events'
import { PHASE_COLOR } from '../domain/phases'
import type { ReferenceCurve } from '../domain/reference'
import { cssVar, themeState } from './theme'
import { controlSegments, formatControl, shade, textOn, visibleBadges, type Segment } from './chartMarks'

/** For DOM elements (theme-aware CSS variables). The canvas reads the resolved values via cssVar. */
export const CURVE_COLORS = { bt: 'var(--curve-bt)', et: 'var(--curve-et)', ror: 'var(--curve-ror)' }

const axis = () => ({ stroke: cssVar('--chart-axis'), grid: { stroke: cssVar('--chart-grid'), width: 1 }, ticks: { show: false } })

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
  const clickRef = useRef({ onBtClick, onNoteClick })
  clickRef.current = { onBtClick, onNoteClick }
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
            const c = zeroT(overlayRef.current)
            const refEnd = overlayRef.current.reference?.t.at(-1) ?? 0
            if (c !== null) return [c - 30, Math.max(c + 720, c + Math.min(refEnd, 1500) + 30, last + 60)]
            return last < 540 ? [0, Math.max(600, last + 60)] : [last - 540, last + 60]
          },
        },
        temp: {
          range: (_u, min, max) => [
            Math.min(overlayRef.current.reference ? 0 : 30, Number.isFinite(min) ? Math.floor(min / 10) * 10 : 30), // room for the gas/air bars (+ plan lanes)
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
            const c = zeroT(overlayRef.current) ?? 0
            const out: number[] = []
            for (let v = c + Math.ceil((min - c) / incr) * incr; v <= max; v += incr) out.push(v)
            return out
          },
          values: (_u, splits) => splits.map((v) => fmtTime(v - (zeroT(overlayRef.current) ?? 0))),
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
    if (e.type === 'CUSTOM') continue // notes are labelled on the BT curve (drawNotes)
    const label = `${EVENT_SHORT[e.type]}${e.bt != null ? ' ' + e.bt.toFixed(1) + '°' : ''}`
    const w = ctx.measureText(label).width + 8 * dpr
    ctx.fillStyle = cssVar('--chart-label-bg')
    ctx.fillRect(x + 3 * dpr, top + 4 * dpr, w, 16 * dpr)
    ctx.fillStyle = e.auto ? cssVar('--chart-label-auto') : cssVar('--chart-label')
    ctx.fillText(label, x + 7 * dpr, top + 6.5 * dpr)
  }
  drawControlBadges(u, o)
  drawBtPoints(u, o)
  drawNotes(u, o)
  drawRefPoints(u, o)
  drawEstimates(u, o)
  ctx.restore()
}

function drawReference(u: uPlot, o: ChartOverlay) {
  const ref = o.reference
  const zero = zeroT(o)
  if (!ref || zero === null) return
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
      const px = u.valToPos(zero + ref.t[i], 'x', true)
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
  // reference events are labelled on the reference BT curve (drawRefPoints)
  ctx.restore()
}

// ── manual control log: one bar per control, shade = value, value in a circle ──
// Lanes from the bottom: your gas, your air, (drum if it changed), then the reference plan
// ("plán") for gas/air/drum – so you can see what to set and when.

const LANE_PITCH = 22 // px (badge Ø 20 px)
const BAR_H = 10
const BADGE_R = 10
const PLAN_BAR_H = 6
const PLAN_BADGE_R = 8

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

const laneY = (u: uPlot, i: number) => u.bbox.top + u.bbox.height - (16 + i * LANE_PITCH) * devicePixelRatio

function drawControlBars(u: uPlot, o: ChartOverlay) {
  const ls = lanes(o)
  if (!ls.length) return
  const ctx = u.ctx
  const dpr = devicePixelRatio
  const { left, width } = u.bbox
  ctx.save()
  ls.forEach((lane, i) => {
    const h = (lane.plan ? PLAN_BAR_H : BAR_H) * dpr
    for (const sgm of lane.segs) {
      const x0 = Math.max(left, u.valToPos(sgm.from, 'x', true))
      const x1 = Math.min(left + width, u.valToPos(sgm.to, 'x', true))
      if (x1 <= x0) continue
      const y = laneY(u, i) - h / 2
      ctx.fillStyle = shade(sgm.kind, sgm.value, lane.plan ? 0.3 : 0.55)
      ctx.beginPath()
      ctx.roundRect(x0, y, x1 - x0, h, 3 * dpr)
      ctx.fill()
      if (lane.plan) {
        ctx.setLineDash([3 * dpr, 3 * dpr])
        ctx.strokeStyle = shade(sgm.kind, sgm.value, 0.8)
        ctx.lineWidth = dpr
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
  })
  ctx.restore()
}

function drawControlBadges(u: uPlot, o: ChartOverlay) {
  const ls = lanes(o)
  if (!ls.length) return
  const ctx = u.ctx
  const dpr = devicePixelRatio
  const { left, width } = u.bbox
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ls.forEach((lane, li) => {
    const r = (lane.plan ? PLAN_BADGE_R : BADGE_R) * dpr
    const xs = lane.segs.map((x) => Math.max(left + r, u.valToPos(x.from, 'x', true) + r))
    const show = visibleBadges(xs, 2 * r + 2 * dpr)
    const cy = laneY(u, li)
    lane.segs.forEach((sgm, i) => {
      const cx = xs[i]
      if (!show[i] || cx > left + width) return
      const text = formatControl(sgm.kind, sgm.value)
      ctx.font = `700 ${(lane.plan ? (text.length > 2 ? 8 : 9) : text.length > 2 ? 9 : 10.5) * dpr}px Inter, system-ui, sans-serif`
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      if (lane.plan) {
        // plan: light badge with a coloured ring, text in the normal label colour (readable in both themes)
        ctx.fillStyle = cssVar('--c-chart')
        ctx.fill()
        ctx.fillStyle = shade(sgm.kind, sgm.value, 0.35)
        ctx.fill()
        ctx.lineWidth = 1.5 * dpr
        ctx.strokeStyle = shade(sgm.kind, sgm.value)
        ctx.stroke()
        ctx.fillStyle = cssVar('--chart-label')
      } else {
        ctx.fillStyle = shade(sgm.kind, sgm.value)
        ctx.fill()
        ctx.lineWidth = 1.5 * dpr
        ctx.strokeStyle = cssVar('--c-chart')
        ctx.stroke()
        ctx.fillStyle = textOn(sgm.kind, sgm.value)
      }
      ctx.fillText(text, cx, cy + 0.5 * dpr)
    })
  })
  // lane captions at the right edge
  ctx.textAlign = 'right'
  ctx.font = `600 ${9 * dpr}px Inter, system-ui, sans-serif`
  const name = { gas: 'plyn', air: 'vzduch', drum: 'buben' } as const
  ls.forEach((lane, li) => {
    ctx.fillStyle = cssVar('--chart-axis')
    ctx.fillText(`${lane.plan ? 'plán ' : ''}${name[lane.kind]}`, left + width - 4 * dpr, laneY(u, li) - 9 * dpr)
  })
  ctx.restore()
}

// ── Dry End / FC start / Second Crack as points on the BT curve ──

const BT_POINTS = ['TP', 'DRY', 'FCs', 'SC'] as const

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

// ── estimated Dry End / First Crack: dotted line + target point on BT ──
function drawEstimates(u: uPlot, o: ChartOverlay) {
  if (!o.estimates?.length) return
  const ctx = u.ctx
  const dpr = devicePixelRatio
  const { left, top, width, height } = u.bbox
  ctx.save()
  ctx.font = `italic 600 ${11 * dpr}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'top'
  for (const e of o.estimates) {
    const x = u.valToPos(e.t, 'x', true)
    if (x < left || x > left + width) continue
    const y = u.valToPos(e.target, 'temp', true)
    ctx.strokeStyle = cssVar('--curve-bt')
    ctx.globalAlpha = 0.55
    ctx.setLineDash([2 * dpr, 4 * dpr])
    ctx.lineWidth = 1.5 * dpr
    ctx.beginPath()
    ctx.moveTo(x, top + 24 * dpr)
    ctx.lineTo(x, top + height)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2)
    ctx.lineWidth = 2 * dpr
    ctx.stroke()
    ctx.globalAlpha = 1
    const label = `~${EVENT_SHORT[e.type]} ${o.chargeT === null ? '' : fmtTime(e.t - o.chargeT)}`
    const w = ctx.measureText(label).width + 10 * dpr
    const bx = Math.min(x + 4 * dpr, left + width - w)
    ctx.fillStyle = cssVar('--chart-label-bg')
    ctx.fillRect(bx, top + 26 * dpr, w, 17 * dpr)
    ctx.fillStyle = cssVar('--chart-label-auto')
    ctx.fillText(label, bx + 5 * dpr, top + 29 * dpr)
  }
  ctx.restore()
}

// ── reference events as badges on the reference BT curve ──
const REF_POINTS = ['CHARGE', 'DRY', 'FCs', 'DROP'] as const

function drawRefPoints(u: uPlot, o: ChartOverlay) {
  const ref = o.reference
  const zero = zeroT(o)
  if (!ref || zero === null) return
  const ctx = u.ctx
  const dpr = devicePixelRatio
  const { left, top, width, height } = u.bbox
  ctx.save()
  ctx.font = `600 ${10.5 * dpr}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  for (const type of REF_POINTS) {
    const e = findEvent(ref.events, type)
    if (!e || e.bt == null) continue
    const x = u.valToPos(zero + e.t, 'x', true)
    const y = u.valToPos(e.bt, 'temp', true)
    if (x < left || x > left + width) continue
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
    const w = ctx.measureText(label).width + 12 * dpr
    const h = 18 * dpr
    let bx = x + 8 * dpr
    let by = y + 8 * dpr
    if (bx + w > left + width) bx = x - w - 8 * dpr
    if (by + h > top + height) by = y - h - 8 * dpr
    ctx.beginPath()
    ctx.roundRect(bx, by, w, h, 6 * dpr)
    ctx.fillStyle = cssVar('--chart-label-bg')
    ctx.fill()
    ctx.setLineDash([3 * dpr, 2 * dpr])
    ctx.lineWidth = dpr
    ctx.strokeStyle = cssVar('--chart-ref-bt')
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = cssVar('--chart-label-auto')
    ctx.fillText(label, bx + 6 * dpr, by + h / 2 + 0.5 * dpr)
  }
  ctx.restore()
}

// ── notes (custom events) as amber points on the BT curve ──
function drawNotes(u: uPlot, o: ChartOverlay) {
  const notes = o.events.filter((e) => e.type === 'CUSTOM' && e.bt != null)
  if (!notes.length) return
  const ctx = u.ctx
  const dpr = devicePixelRatio
  const { left, top, width } = u.bbox
  ctx.save()
  ctx.font = `600 ${11 * dpr}px Inter, system-ui, sans-serif`
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
    const w = ctx.measureText(text).width + 12 * dpr
    const h = 20 * dpr
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
