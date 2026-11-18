import { createStore } from '../storage/store'

export type Theme = 'dark' | 'light'

function stored(): Theme {
  try {
    return localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export const themeState = createStore({ theme: stored() })

function apply(t: Theme) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = t
}
apply(themeState.get().theme)

export function toggleTheme() {
  const theme: Theme = themeState.get().theme === 'dark' ? 'light' : 'dark'
  try {
    localStorage.setItem('theme', theme)
  } catch {
    /* private mode – theme just isn't remembered */
  }
  apply(theme)
  themeState.set({ theme })
}

// ── monitor size: "small" = 13,3" MacBook (1280×800), "large" = 27" 1920×1080 ──
export type Display = 'small' | 'large'
const storedDisplay = (): Display => {
  try {
    return localStorage.getItem('display') === 'large' ? 'large' : 'small'
  } catch {
    return 'small'
  }
}
export const displayState = createStore({ display: storedDisplay() })
/** Scale of the chart's texts, badges and lanes. */
export const chartScale = () => (displayState.get().display === 'large' ? 1.5 : 1)
/** The gas/air/drum lanes under the chart get even bigger badges on the large monitor. */
export const laneScale = () => (displayState.get().display === 'large' ? 1.6 : 1)
const applyDisplay = (d: Display) => {
  if (typeof document !== 'undefined') document.documentElement.dataset.display = d
}
applyDisplay(displayState.get().display)

export function setDisplay(display: Display) {
  try {
    localStorage.setItem('display', display)
  } catch {
    /* not remembered */
  }
  applyDisplay(display)
  displayState.set({ display })
}

/** One button in the header: shows the current monitor size, a click switches to the other one. */
export function DisplayToggle() {
  const { display } = displayState.use()
  const next: Display = display === 'large' ? 'small' : 'large'
  return (
    <button
      onClick={() => setDisplay(next)}
      title={display === 'large' ? 'Velký monitor (27″, 1920×1080) – kliknutím přepneš na 13″' : 'Malý monitor (13,3″ MacBook) – kliknutím přepneš na 27″'}
      className="flex h-7 shrink-0 items-center rounded-full border border-[var(--c-border)] bg-[var(--c-chip)] px-2 text-xs font-semibold tabular-nums text-zinc-200 hover:bg-[var(--c-active)]"
    >
      {display === 'large' ? '27″' : '13″'}
    </button>
  )
}

/** Reads a CSS custom property (for canvas drawing, which can't use CSS directly). */
export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

export function ThemeToggle() {
  const { theme } = themeState.use()
  return (
    <button
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Světlý režim' : 'Tmavý režim'}
      className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--c-chip)] text-zinc-300 border border-[var(--c-border)] hover:text-zinc-100"
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}
