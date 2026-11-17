import { Component, type ReactNode } from 'react'

/** Keeps a UI error from blanking the app; recording and saving run outside React and continue. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { error: Error | null; key: string }) {
    // navigating to another screen clears the error
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#16171d] p-8 text-center text-zinc-100">
        <h1 className="text-2xl font-semibold">Na této obrazovce nastala chyba</h1>
        <p className="max-w-xl text-zinc-400">
          Záznam pražení běží dál a průběžně se ukládá. Přejdi na jinou obrazovku, nebo stránku obnov – rozpracované pražení se obnoví.
        </p>
        <pre className="max-w-xl overflow-auto rounded-xl bg-black/30 p-3 text-left text-xs text-rose-300">{this.state.error.message}</pre>
        <div className="flex gap-3">
          <a href="#/" className="rounded-2xl bg-emerald-500 px-5 py-2.5 font-semibold text-emerald-950">
            Zpět na pražení
          </a>
          <button className="rounded-2xl bg-[#2a2d36] px-5 py-2.5 font-semibold" onClick={() => location.reload()}>
            Obnovit stránku
          </button>
        </div>
      </div>
    )
  }
}
