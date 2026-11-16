import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { LiveSnapshot } from '../live/LiveSession'

export const CURVE_COLORS = { bt: '#5aa9ff', et: '#ff6b5a', ror: '#ffd166' }

const AXIS = { stroke: '#9aa0ac', grid: { stroke: 'rgba(255,255,255,.06)', width: 1 }, ticks: { show: false } }

export const fmtTime = (s: number) => {
  const sign = s < 0 ? '−' : ''
  const a = Math.abs(Math.round(s))
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`
}

interface Props {
  snap: LiveSnapshot
  follow: boolean
  onFollowChange: (follow: boolean) => void
}

/** Live BT/ET/RoR chart. Drag = zoom to selection, wheel = zoom, horizontal swipe = pan, double-click = live view. */
export function LiveChart({ snap, follow, onFollowChange }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const plot = useRef<uPlot | null>(null)
  const followRef = useRef(follow)
  const userRange = useRef<[number, number] | null>(null)
  const onFollowRef = useRef(onFollowChange)
  onFollowRef.current = onFollowChange

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
            const end = Math.max(600, (Number.isFinite(max) ? max : 0) + 60)
            return [0, end]
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
        { ...AXIS, incrs: [15, 30, 60, 120, 300, 600], values: (_u, splits) => splits.map(fmtTime) },
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
  }, [snap])

  return <div ref={wrap} className="h-full w-full" />
}
