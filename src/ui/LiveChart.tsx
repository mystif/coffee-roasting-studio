import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { LiveSnapshot } from '../live/LiveSession'
import { CONTROL_UNIT, EVENT_SHORT, findEvent, type ControlChange, type RoastEvent } from '../domain/events'
import { PHASE_COLOR } from '../domain/phases'

export const CURVE_COLORS = { bt: '#5aa9ff', et: '#ff6b5a', ror: '#ffd166' }

const AXIS = { stroke: '#9aa0ac', grid: { stroke: 'rgba(255,255,255,.06)', width: 1 }, ticks: { show: false } }

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
}

interface Props {
  snap: LiveSnapshot
  overlay: ChartOverlay
  follow: boolean
  onFollowChange: (follow: boolean) => void
}

/** Live BT/ET/RoR chart. Drag = zoom to selection, wheel = zoom, horizontal swipe = pan, double-click = live view. */
export function LiveChart({ snap, overlay, follow, onFollowChange }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const plot = useRef<uPlot | null>(null)
  const followRef = useRef(follow)
  const userRange = useRef<[number, number] | null>(null)
  const onFollowRef = useRef(onFollowChange)
  onFollowRef.current = onFollowChange
  const overlayRef = useRef(overlay)
  overlayRef.current = overlay

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
            if (c !== null) return [Math.max(0, c - 30), Math.max(c + 720, last + 60)]
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
          incrs: [15, 30, 60, 120, 300, 600],
          values: (_u, splits) => splits.map((v) => fmtTime(v - (overlayRef.current.chargeT ?? 0))),
        },
        { ...AXIS, scale: 'temp', values: (_u, splits) => splits.map((v) => `${v}°`), size: 48 },
        {
          ...AXIS,
          scale: 'ror',
          side: 1,
          grid: { show: false },
          stroke: CURVE_COLORS.ror,
          values: (_u, splits) => splits.map((v) => `${v}`),
          size: 40,
        },
      ],
      series: [
        {},
        { label: 'BT', scale: 'temp', stroke: CURVE_COLORS.bt, width: 2.5, spanGaps: false },
        { label: 'ET', scale: 'temp', stroke: CURVE_COLORS.et, width: 2, spanGaps: false },
        { label: 'RoR', scale: 'ror', stroke: CURVE_COLORS.ror, width: 2, spanGaps: false },
      ],
      hooks: {
        drawClear: [(u) => drawPhases(u, overlayRef.current)],
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
      u.destroy()
      plot.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    plot.current?.setData([snap.t, snap.bt, snap.et, snap.ror] as uPlot.AlignedData, true)
  }, [snap, overlay])

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
    ctx.strokeStyle = 'rgba(255,255,255,.35)'
    ctx.setLineDash([4 * dpr, 4 * dpr])
    ctx.lineWidth = dpr
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, top + height)
    ctx.stroke()
    ctx.setLineDash([])
    const label = `${e.type === 'CUSTOM' ? e.note || '★' : EVENT_SHORT[e.type]}${e.bt != null ? ' ' + e.bt.toFixed(1) + '°' : ''}`
    const w = ctx.measureText(label).width + 8 * dpr
    ctx.fillStyle = 'rgba(30,32,40,.92)'
    ctx.fillRect(x + 3 * dpr, top + 4 * dpr, w, 16 * dpr)
    ctx.fillStyle = e.auto ? '#cbd5e1' : '#ffffff'
    ctx.fillText(label, x + 7 * dpr, top + 6.5 * dpr)
  }
  // manual control records: small flags along the bottom (gas row, air row, drum row)
  const rows: Record<string, number> = { gas: 0, air: 1, drum: 2 }
  const color: Record<string, string> = { gas: '#fb923c', air: '#38bdf8', drum: '#a78bfa' }
  const short: Record<string, string> = { gas: 'G', air: 'A', drum: 'B' }
  for (const c of o.controls) {
    const x = u.valToPos(c.t, 'x', true)
    if (x < left || x > left + width) continue
    const y = top + height - (14 + rows[c.kind] * 16) * dpr - 8 * dpr
    const label = `${short[c.kind]} ${c.value}${CONTROL_UNIT[c.kind] === '%' ? '%' : ''}`
    ctx.fillStyle = color[c.kind]
    ctx.fillRect(x, y, 2 * dpr, 14 * dpr)
    ctx.fillText(label, x + 4 * dpr, y + 1.5 * dpr)
  }
  ctx.restore()
}
