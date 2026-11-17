import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { fmtTime } from './LiveChart'

export const COMPARE_COLORS = ['#5aa9ff', '#ff6b5a', '#4ade80', '#f59e0b', '#c084fc', '#22d3ee', '#f472b6', '#a3e635']

const AXIS = { stroke: '#9aa0ac', grid: { stroke: 'rgba(255,255,255,.06)', width: 1 }, ticks: { show: false } }

interface Props {
  grid: number[]
  series: ({ bt: (number | null)[]; et: (number | null)[]; ror: (number | null)[] } | null)[]
  showET: boolean
  showRoR: boolean
}

/** BT (solid), ET (thin) and RoR (dashed) of several roasts, time from CHARGE. Drag = zoom, double-click = reset. */
export function CompareChart({ grid, series, showET, showRoR }: Props) {
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrap.current!
    const s: uPlot.Series[] = [{}]
    const data: (number | null)[][] = [grid]
    series.forEach((x, i) => {
      if (!x) return
      const color = COMPARE_COLORS[i % COMPARE_COLORS.length]
      s.push({ scale: 'temp', stroke: color, width: 2.2, spanGaps: false })
      data.push(x.bt)
      if (showET) {
        s.push({ scale: 'temp', stroke: color + '88', width: 1, spanGaps: false })
        data.push(x.et)
      }
      if (showRoR) {
        s.push({ scale: 'ror', stroke: color, width: 1.4, dash: [6, 4], spanGaps: false })
        data.push(x.ror)
      }
    })
    const u = new uPlot(
      {
        width: el.clientWidth,
        height: el.clientHeight,
        legend: { show: false },
        cursor: { drag: { x: true, y: false, setScale: true } },
        scales: {
          x: { time: false },
          temp: { range: (_u, min, max) => [Math.min(60, Math.floor(min / 10) * 10), Math.max(240, Math.ceil(max / 10) * 10)] },
          ror: { range: [0, 25] },
        },
        axes: [
          { ...AXIS, incrs: [30, 60, 120, 300], values: (_u, v) => v.map(fmtTime) },
          { ...AXIS, scale: 'temp', size: 48, values: (_u, v) => v.map((x) => `${x}°`) },
          { ...AXIS, scale: 'ror', side: 1, size: 40, grid: { show: false }, stroke: '#ffd166' },
        ],
        series: s,
      },
      data as uPlot.AlignedData,
      el,
    )
    const ro = new ResizeObserver(() => u.setSize({ width: el.clientWidth, height: el.clientHeight }))
    ro.observe(el)
    return () => {
      ro.disconnect()
      u.destroy()
    }
  }, [grid, series, showET, showRoR])

  return <div ref={wrap} className="h-full w-full" />
}
