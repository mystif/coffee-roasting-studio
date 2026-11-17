import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { parseAlog } from '../io/alog'
import { alogToRecord } from '../io/alogImport'
import { flushBackups } from '../storage/backup'
import { addCoffee, emptyCoffee } from '../storage/coffees'
import { db, type Coffee } from '../storage/db'
import { fmtDate } from '../storage/roastQueries'
import type { RoastRecord } from '../storage/roastRecord'
import { lossPct } from '../storage/roastRecord'
import { ClayButton } from './clay'
import { fmtTime } from './LiveChart'
import { inputCls } from './nav'
import { parseKg } from './roastPanels'

interface Row {
  fileName: string
  preview?: RoastRecord
  error?: string
  coffee: string
  roasted: string
  include: boolean
  exists: boolean
  /** when the file was saved – used if the date inside the file is clearly wrong */
  fileDate: string
}

/** Reads the chosen .alog files and lets the user name the coffee before importing. */
export async function readAlogFiles(files: File[]): Promise<Row[]> {
  return Promise.all(
    files.map(async (f): Promise<Row> => {
      try {
        const rec = alogToRecord(parseAlog(await f.text()), { fileName: f.name })
        const exists = !!(await db.roasts.get(rec.id))
        const kg = rec.roastedWeightG ? String(rec.roastedWeightG / 1000).replace('.', ',') : ''
        return { fileName: f.name, preview: rec, coffee: rec.coffee, roasted: kg, include: true, exists, fileDate: new Date(f.lastModified).toISOString() }
      } catch (e) {
        return { fileName: f.name, error: e instanceof Error ? e.message : String(e), coffee: '', roasted: '', include: false, exists: false, fileDate: '' }
      }
    }),
  )
}

export function ImportDialog({ initial, onClose }: { initial: Row[]; onClose: (imported: number) => void }) {
  const coffees = useLiveQuery(() => db.coffees.orderBy('name').toArray(), [])
  const [rows, setRows] = useState(initial)
  const [all, setAll] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  const selected = rows.filter((r) => r.include && r.preview)

  const run = async () => {
    setBusy(true)
    const known = new Map((coffees ?? []).map((c) => [c.name.toLowerCase(), c]))
    const resolve = async (name: string): Promise<Coffee | null> => {
      const n = name.trim()
      if (!n) return null
      const hit = known.get(n.toLowerCase())
      if (hit) return hit
      const c = await addCoffee({ ...emptyCoffee(), name: n })
      known.set(n.toLowerCase(), c)
      return c
    }
    const out: RoastRecord[] = []
    for (const r of selected) {
      const c = await resolve(r.coffee)
      const prev = r.exists ? await db.roasts.get(r.preview!.id) : undefined
      const roastedWeightG = parseKg(r.roasted) ?? r.preview!.roastedWeightG ?? prev?.roastedWeightG ?? null
      out.push({
        ...r.preview!,
        coffee: c?.name ?? r.preview!.coffee,
        coffeeId: c?.id ?? null,
        roastedWeightG,
        lossPct: lossPct(r.preview!.greenWeightG, roastedWeightG),
        // re-import keeps what the user added in the app
        rating: prev?.rating ?? null,
        notes: r.preview!.notes || prev?.notes || '',
      })
    }
    await db.roasts.bulkPut(out)
    await flushBackups()
    onClose(out.length)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8">
      <div className="flex max-h-full w-full max-w-6xl flex-col gap-4 rounded-3xl bg-[#1f2128] p-6 shadow-[0_20px_60px_rgba(0,0,0,.6)]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Import z Artisanu</h2>
            <p className="text-sm text-zinc-400">
              Zkontroluj název kávy (Artisan ho v tvých souborech nemá – výchozí je název souboru) a případně doplň praženou hmotnost.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <input value={all} onChange={(e) => setAll(e.target.value)} list="import-coffees" placeholder="Káva pro všechny vybrané" className={`${inputCls} w-64`} />
            <ClayButton onClick={() => setRows((r) => r.map((x) => (x.include ? { ...x, coffee: all } : x)))} disabled={!all.trim()}>
              Použít
            </ClayButton>
          </div>
        </div>
        <datalist id="import-coffees">
          {coffees?.map((c) => <option key={c.id} value={c.name} />)}
        </datalist>
        <div className="min-h-0 overflow-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-[#1f2128] text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="py-2 pr-2 font-normal"></th>
                <th className="pr-3 font-normal">Soubor</th>
                <th className="pr-3 font-normal">Datum</th>
                <th className="pr-3 text-right font-normal">Čas</th>
                <th className="pr-3 text-right font-normal">DTR</th>
                <th className="pr-3 text-right font-normal">Zelená</th>
                <th className="pr-3 font-normal">Pražená (kg)</th>
                <th className="pr-3 font-normal">Káva</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.fileName + i} className="border-t border-white/5">
                  <td className="py-1.5 pr-2">
                    <input type="checkbox" checked={r.include} disabled={!r.preview} onChange={(e) => set(i, { include: e.target.checked })} />
                  </td>
                  <td className="max-w-56 truncate pr-3" title={r.fileName}>
                    {r.fileName}
                    {r.exists && <span className="ml-2 text-xs text-amber-300">už importováno – přepíše se</span>}
                    {r.error && <span className="ml-2 text-xs text-rose-300">{r.error}</span>}
                  </td>
                  <td className="pr-3 text-zinc-300">
                    {r.preview ? fmtDate(r.preview.roastDate) : ''}
                    {r.preview && r.fileDate && Math.abs(Date.parse(r.preview.roastDate) - Date.parse(r.fileDate)) > 7 * 864e5 && (
                      <button
                        className="ml-2 text-xs text-amber-300 underline"
                        title={`Datum v souboru se liší od data uložení souboru (${fmtDate(r.fileDate)}) – možná špatně nastavené hodiny`}
                        onClick={() => set(i, { preview: { ...r.preview!, roastDate: r.fileDate } })}
                      >
                        použít {fmtDate(r.fileDate).split(' ').slice(0, 3).join(' ')}?
                      </button>
                    )}
                  </td>
                  <td className="pr-3 text-right">{r.preview?.phases ? fmtTime(r.preview.phases.total) : '—'}</td>
                  <td className="pr-3 text-right">{r.preview?.phases?.dtr != null ? `${r.preview.phases.dtr.toFixed(1)} %` : '—'}</td>
                  <td className="pr-3 text-right">{r.preview?.greenWeightG ? `${(r.preview.greenWeightG / 1000).toString().replace('.', ',')} kg` : '—'}</td>
                  <td className="pr-3">
                    <input value={r.roasted} inputMode="decimal" placeholder="—" onChange={(e) => set(i, { roasted: e.target.value })} className={`${inputCls} w-24 !py-1`} disabled={!r.preview} />
                  </td>
                  <td className="pr-3">
                    <input value={r.coffee} list="import-coffees" onChange={(e) => set(i, { coffee: e.target.value })} className={`${inputCls} w-64 !py-1`} disabled={!r.preview} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-3">
          <ClayButton variant="primary" onClick={() => void run()} disabled={busy || selected.length === 0}>
            {busy ? 'Importuji…' : `Importovat ${selected.length} ${selected.length === 1 ? 'pražení' : 'pražení'}`}
          </ClayButton>
          <ClayButton onClick={() => onClose(0)} disabled={busy}>
            Zrušit
          </ClayButton>
          <p className="ml-auto text-xs text-zinc-500">Nové názvy káv se přidají do seznamu Kávy. Originální soubory se nemění.</p>
        </div>
      </div>
    </div>
  )
}
