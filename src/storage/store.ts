import { useSyncExternalStore } from 'react'

/** Tiny observable value for module-level state shown in the UI. */
export function createStore<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(patch: Partial<T>) {
      value = { ...value, ...patch }
      listeners.forEach((l) => l())
    },
    subscribe(fn: () => void) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    use(): T {
      return useSyncExternalStore(this.subscribe, this.get)
    },
  }
}
