import { useEffect, useRef, useState } from 'react'

/** Smoothly animates a number to its new value (ease-out, `ms` long). null and the first value are shown at once. */
export function useTween(value: number | null, ms = 350): number | null {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = from.current
    if (value === null || start === null || ms <= 0) {
      from.current = value
      setShown(value)
      return
    }
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      const v = start + (value - start) * (1 - (1 - k) ** 3)
      from.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}

/** Counts from 0 up to `target` (ease-out, `ms` long) when it first appears or changes; null stays null. */
export function useCountUp(target: number | null, ms = 500): number | null {
  const [v, setV] = useState<number | null>(target === null ? null : 0)
  useEffect(() => {
    if (target === null) return setV(null)
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return setV(target)
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      setV(target * (1 - (1 - k) ** 3))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}
