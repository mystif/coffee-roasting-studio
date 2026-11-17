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

/** Reads a CSS custom property (for canvas drawing, which can't use CSS directly). */
export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

export function ThemeToggle() {
  const { theme } = themeState.use()
  return (
    <button
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Světlý režim' : 'Tmavý režim'}
      className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--c-chip)] text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_6px_16px_var(--sh)] hover:text-zinc-100"
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
