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
      <div className="w-full max-w-md rounded-xl bg-[var(--c-surface)] p-6 border border-[var(--c-border)] shadow-[0_16px_48px_var(--sh)]" role="dialog" aria-modal="true">
        <h2 className="text-lg font-semibold">{r.title}</h2>
        {r.message && <p className="mt-2 whitespace-pre-line text-sm text-zinc-400">{r.message}</p>}
        {r.kind === 'prompt' && (
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && text.trim() && accept()}
            className="mt-4 w-full rounded-lg bg-[var(--c-bg)] px-3 py-2 text-base text-zinc-100 outline-none focus:ring-2 focus:ring-[var(--c-accent-ring)]"
          />
        )}
        <div className="mt-5 flex justify-end gap-2">
          {r.deleteLabel && (
            <button
              onClick={() => close(DELETE)}
              className="mr-auto rounded-lg btn-gloss bg-rose-600 hover:bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white"
            >
              {r.deleteLabel}
            </button>
          )}
          {r.kind !== 'alert' && (
            <button onClick={cancel} className="rounded-lg bg-[var(--c-raised)] px-5 py-2.5 text-sm font-semibold text-zinc-100">
              Zrušit
            </button>
          )}
          <button
            ref={ok}
            onClick={accept}
            disabled={r.kind === 'prompt' && !text.trim()}
            className={`rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-40 ${
 r.danger ? 'btn-gloss bg-rose-600 hover:bg-rose-500 text-white' : 'btn-gloss bg-emerald-600 text-white hover:bg-emerald-500'
 }`}
          >
            {r.okLabel ?? (r.kind === 'alert' ? 'OK' : r.kind === 'prompt' ? 'Uložit' : 'Potvrdit')}
          </button>
        </div>
      </div>
    </div>
  )
}
