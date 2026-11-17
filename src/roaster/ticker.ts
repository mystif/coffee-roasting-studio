// One-shot timer that keeps running when the tab is in the background.
// Browsers throttle setTimeout on hidden/occluded pages (down to once per minute), which would
// stall the roaster polling; timers inside a dedicated worker are not throttled that way.

export interface Ticker {
  /** calls `fn` once after `ms` (re-arming replaces the previous one) */
  after(ms: number, fn: () => void): void
  cancel(): void
}

const WORKER_SRC = `let id = null
onmessage = (e) => {
  if (id !== null) clearTimeout(id)
  id = e.data < 0 ? null : setTimeout(() => { id = null; postMessage(0) }, e.data)
}`

export function createTicker(): Ticker {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL?.createObjectURL !== 'function') return timeoutTicker()
  try {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }))
    const w = new Worker(url)
    let cb: (() => void) | null = null
    w.onmessage = () => {
      const f = cb
      cb = null
      f?.()
    }
    return {
      after(ms, fn) {
        cb = fn
        w.postMessage(Math.max(0, ms))
      },
      cancel() {
        cb = null
        w.postMessage(-1)
      },
    }
  } catch {
    return timeoutTicker()
  }
}

function timeoutTicker(): Ticker {
  let id: ReturnType<typeof setTimeout> | null = null
  return {
    after(ms, fn) {
      if (id) clearTimeout(id)
      id = setTimeout(() => {
        id = null
        fn()
      }, ms)
    },
    cancel() {
      if (id) clearTimeout(id)
      id = null
    },
  }
}
