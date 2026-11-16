// Offline support: the service worker caches the app. Updates wait for the user and
// are never offered while a roast is being recorded.
import { registerSW } from 'virtual:pwa-register'
import { createStore } from './storage/store'

export const pwaState = createStore({ updateReady: false, offlineReady: false })

let apply: ((reload?: boolean) => Promise<void>) | null = null

export function initPwa() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  apply = registerSW({
    onNeedRefresh: () => pwaState.set({ updateReady: true }),
    onOfflineReady: () => pwaState.set({ offlineReady: true }),
    onRegisteredSW: (_url, reg) => {
      // look for a new version every hour (and on start)
      if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000)
    },
  })
}

export function applyUpdate() {
  void apply?.(true)
}
