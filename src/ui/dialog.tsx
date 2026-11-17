// In-app replacements for window.alert / confirm / prompt. Native dialogs are silently
// suppressed in some embedded browsers (e.g. the Claude app's browser pane), so the app
// never relies on them.
import { useEffect, useRef, useState } from 'react'
import { createStore } from '../storage/store'

interface Request {
  kind: 'alert' | 'confirm' | 'prompt'
  title: string
  message?: string
  defaultValue?: string
  okLabel?: string
  danger?: boolean
  /** prompt only: extra red button that resolves with DELETE */
  deleteLabel?: string
  resolve: (value: string | boolean | null) => void
}

export const DELETE = '\u0000delete'

const queue = createStore<{ current: Request | null }>({ current: null })

function open(r: Omit<Request, 'resolve'>): Promise<string | boolean | null> {
  return new Promise((resolve) => queue.set({ current: { ...r, resolve } }))
}

export const showAlert = (title: string, message?: string) => open({ kind: 'alert', title, message }).then(() => undefined)

export const askConfirm = (title: string, opts: { message?: string; okLabel?: string; danger?: boolean } = {}) =>
  open({ kind: 'confirm', title, ...opts }).then((v) => v === true)

export const askText = (title: string, defaultValue = '', opts: { message?: string; okLabel?: string } = {}) =>
  open({ kind: 'prompt', title, defaultValue, ...opts }).then((v) => (typeof v === 'string' ? v : null))

/** Note editor: resolves with the text, DELETE, or null (cancel). */
export const askNote = (title: string, defaultValue = '', opts: { message?: string; allowDelete?: boolean } = {}) =>
  open({ kind: 'prompt', title, defaultValue, message: opts.message, deleteLabel: opts.allowDelete ? 'Smazat poznámku' : undefined }).then((v) =>
    typeof v === 'string' ? v : null,
  )

/** Mount once at the app root. */
export function DialogHost() {
  const { current: r } = queue.use()
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const ok = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!r) return
    setText(r.defaultValue ?? '')
    setTimeout(() => (r.kind === 'prompt' ? input.current?.select() : ok.current?.focus()), 0)
  }, [r])

  if (!r) return null
  const close = (value: string | boolean | null) => {
    queue.set({ current: null })
    r.resolve(value)
  }
  const accept = () => close(r.kind === 'prompt' ? text : true)
  const cancel = () => close(r.kind === 'prompt' ? null : false)

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6"
      onMouseDown={(e) => e.target === e.currentTarget && cancel()}
      onKeyDown={(e) => e.key === 'Escape' && cancel()}
    >
      <div className="w-full max-w-md rounded-3xl bg-[var(--c-surface)] p-6 shadow-[0_20px_60px_var(--sh)]" role="dialog" aria-modal="true">
        <h2 className="text-lg font-semibold">{r.title}</h2>
        {r.message && <p className="mt-2 whitespace-pre-line text-sm text-zinc-400">{r.message}</p>}
        {r.kind === 'prompt' && (
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && text.trim() && accept()}
            className="mt-4 w-full rounded-xl bg-[var(--c-bg)] px-3 py-2 text-base text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-400"
          />
        )}
        <div className="mt-5 flex justify-end gap-2">
          {r.deleteLabel && (
            <button
              onClick={() => close(DELETE)}
              className="mr-auto rounded-2xl bg-gradient-to-b from-rose-400 to-rose-600 px-4 py-2.5 text-sm font-semibold text-rose-950 shadow-[0_4px_10px_var(--sh)]"
            >
              {r.deleteLabel}
            </button>
          )}
          {r.kind !== 'alert' && (
            <button onClick={cancel} className="rounded-2xl bg-[var(--c-raised)] px-5 py-2.5 text-sm font-semibold text-zinc-100 shadow-[0_4px_10px_var(--sh)]">
              Zrušit
            </button>
          )}
          <button
            ref={ok}
            onClick={accept}
            disabled={r.kind === 'prompt' && !text.trim()}
            className={`rounded-2xl px-5 py-2.5 text-sm font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_4px_10px_var(--sh)] disabled:opacity-40 ${
              r.danger ? 'bg-gradient-to-b from-rose-400 to-rose-600 text-rose-950' : 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-emerald-950'
            }`}
          >
            {r.okLabel ?? (r.kind === 'alert' ? 'OK' : r.kind === 'prompt' ? 'Uložit' : 'Potvrdit')}
          </button>
        </div>
      </div>
    </div>
  )
}
