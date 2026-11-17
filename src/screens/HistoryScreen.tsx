import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef, useState } from 'react'
import { ClayButton } from '../ui/clay'
import { ImportDialog, readAlogFiles } from '../ui/ImportDialog'
import { download, exportAll, importAll } from '../io/exportFiles'
import { flushBackups } from '../storage/backup'
import { db } from '../storage/db'
import { createProfileFromRoast } from '../storage/profiles'
import { findEvent } from '../domain/events'
import type { RoastRecord } from '../storage/roastRecord'
import { fmtDate, fmtKg, roastSummary } from '../storage/roastQueries'
import { fmtTime } from '../ui/LiveChart'
import { Page, go, inputCls } from '../ui/nav'

export function HistoryScreen({ coffeeId }: { coffeeId: string | null }) {
  const roasts = useLiveQuery(() => db.roasts.orderBy('roastDate').reverse().toArray(), [])
  const coffees = useLiveQuery(() => db.coffees.orderBy('name').toArray(), [])
  const [q, setQ] = useState('')
  const filter = coffeeId ?? ''
  const fileInput = useRef<HTMLInputElement>(null)
  const restoreInput = useRef<HTMLInputElement>(null)
  const [importRows, setImportRows] = useState<Awaited<ReturnType<typeof readAlogFiles>> | null>(null)
  const [notice, setNotice] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const profiled = useLiveQuery(async () => new Set((await db.profiles.toArray()).map((p) => p.fromRoastId)), [])
  /** One click: roast → profile with the default name (renamable in Profily). Skips roasts without CHARGE or already saved. */
  const saveProfiles = async (list: RoastRecord[]) => {
    let made = 0
    let skipped = 0
    for (const r of list) {
      if (!findEvent(r.events, 'CHARGE') || profiled?.has(r.id)) skipped++
      else {
        await createProfileFromRoast(r)
        made++
      }
    }
    setNotice(
      made
        ? `Uloženo ${made} ${made === 1 ? 'profil' : made < 5 ? 'profily' : 'profilů'}${skipped ? ` (${skipped} přeskočeno – už jsou profilem nebo nemají Charge)` : ''}. ${made === 1 ? 'Najdeš ho' : 'Najdeš je'} v záložce Profily.`
        : 'Nic nového – vybraná pražení už jsou profilem nebo nemají Charge.',
    )
  }

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (roasts ?? []).filter(
      (r) => (!filter || r.coffeeId === filter) && (!needle || `${r.coffee} ${r.notes}`.toLowerCase().includes(needle)),
    )
  }, [roasts, filter, q])

  return (
    <Page
      title="Historie pražení"
      actions={
        <>
          <select
            value={filter}
            onChange={(e) => go(e.target.value ? `#/historie?kava=${e.target.value}` : '#/historie')}
            className={inputCls}
          >
            <option value="">Všechny kávy</option>
            {coffees?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat v názvu a poznámkách" className={`${inputCls} w-64`} />
          {picked.length > 0 && (
            <>
              <ClayButton onClick={() => void saveProfiles((roasts ?? []).filter((r) => picked.includes(r.id)))} title="Každé vybrané pražení uloží jako referenční profil">
                Uložit jako profily ({picked.length})
              </ClayButton>
              <ClayButton
                variant="primary"
                onClick={() => go(`#/analyza?ids=${picked.slice(0, 8).join(',')}`)}
                disabled={picked.length < 2}
                title={picked.length > 8 ? 'Porovná se prvních 8 vybraných' : undefined}
              >
                Porovnat ({Math.min(picked.length, 8)})
              </ClayButton>
            </>
          )}
          <ClayButton onClick={() => fileInput.current?.click()} title="Vyber jeden nebo více souborů .alog">
            Importovat z Artisanu
          </ClayButton>
          <input
            ref={fileInput}
            type="file"
            accept=".alog"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              if (files.length) setImportRows(await readAlogFiles(files))
            }}
          />
        </>
      }
    >
      {importRows && (
        <ImportDialog
          initial={importRows}
          onClose={(n) => {
            setImportRows(null)
            if (n) setNotice(`Importováno ${n} pražení z Artisanu.`)
          }}
        />
      )}
      {notice && <p className="mb-3 rounded-2xl bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200 ring-1 ring-emerald-400/30">{notice}</p>}
      {roasts && roasts.length === 0 && (
        <p className="text-zinc-400">Zatím žádné uložené pražení. Každé pražení se sem uloží automaticky po Finish – a starší pražení z Artisanu sem dostaneš tlačítkem Importovat z Artisanu.</p>
      )}
      {rows.length > 0 && (
        <table className="w-full border-separate border-spacing-y-1.5 text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="w-8 px-3 font-normal" title="Vyber 2–8 pražení k porovnání"></th>
              <th className="px-3 font-normal">Datum</th>
              <th className="px-3 font-normal">Káva</th>
              <th className="px-3 text-right font-normal">Zelená</th>
              <th className="px-3 text-right font-normal">Ztráta</th>
              <th className="px-3 text-right font-normal">Čas</th>
              <th className="px-3 text-right font-normal">FCs</th>
              <th className="px-3 text-right font-normal">Drop BT</th>
              <th className="px-3 text-right font-normal">DTR</th>
              <th className="px-3 text-right font-normal">Hodn.</th>
              <th className="px-3 text-right font-normal">Záloha</th>
              <th className="px-3 text-right font-normal">Profil</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = roastSummary(r)
              return (
                <tr
                  key={r.id}
                  onClick={() => go(`#/historie/${r.id}`)}
                  className="cursor-pointer bg-[var(--c-surface)] tabular-nums shadow-[0_4px_12px_var(--sh-soft)] transition hover:bg-[var(--c-raised2)] [&>td:first-child]:rounded-l-2xl [&>td:last-child]:rounded-r-2xl [&>td]:px-3 [&>td]:py-2.5"
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4" />
                  </td>
                  <td className="text-zinc-300">{fmtDate(r.roastDate)}</td>
                  <td className="font-semibold">
                    {r.coffee || 'Bez názvu'}
                    {r.source === 'import' && <span className="ml-2 text-xs font-normal text-zinc-500">Artisan</span>}
                  </td>
                  <td className="text-right">{fmtKg(r.greenWeightG)}</td>
                  <td className="text-right">{r.lossPct == null ? '—' : `${r.lossPct.toFixed(1)} %`}</td>
                  <td className="text-right">{s.total == null ? '—' : fmtTime(s.total)}</td>
                  <td className="text-right">{s.fcsTime == null ? '—' : `${fmtTime(s.fcsTime)} · ${s.fcsBT?.toFixed(1)}°`}</td>
                  <td className="text-right">{s.dropBT == null ? '—' : `${s.dropBT.toFixed(1)}°`}</td>
                  <td className="text-right">{s.dtr == null ? '—' : `${s.dtr.toFixed(1)} %`}</td>
                  <td className="text-right">{r.rating ?? '—'}</td>
                  <td className="text-right">{r.backedUp ? <span className="text-emerald-400">✓</span> : <span className="text-amber-300">čeká</span>}</td>
                  <td className="text-right" onClick={(e) => e.stopPropagation()}>
                    {profiled?.has(r.id) ? (
                      <a href="#/profily" className="text-xs font-semibold text-emerald-300 hover:underline" title="Už je uložené jako profil">
                        ✓ profil
                      </a>
                    ) : findEvent(r.events, 'CHARGE') ? (
                      <button
                        onClick={() => void saveProfiles([r])}
                        className="whitespace-nowrap rounded-lg bg-[var(--c-raised)] px-2.5 py-1 text-xs font-semibold text-zinc-200 shadow-[0_2px_6px_var(--sh)] hover:text-zinc-100"
                        title="Uložit jako referenční profil (název můžeš změnit v Profilech)"
                      >
                        + profil
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-500" title="Bez Charge nelze zarovnat">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {roasts && roasts.length > 0 && rows.length === 0 && <p className="text-zinc-400">Filtru neodpovídá žádné pražení.</p>}
      <div className="mt-8 flex flex-wrap items-center gap-3 rounded-3xl bg-[var(--c-surface)] p-4 text-sm">
        <span className="font-semibold">Data</span>
        <span className="text-zinc-400">Kompletní záloha všech pražení, káv a profilů v jednom souboru.</span>
        <ClayButton
          className="ml-auto"
          onClick={async () => download(`coffee-roasting-studio-zaloha-${new Date().toISOString().slice(0, 10)}.json`, await exportAll(), 'application/json')}
        >
          Stáhnout zálohu všeho
        </ClayButton>
        <ClayButton onClick={() => restoreInput.current?.click()}>Obnovit ze zálohy</ClayButton>
        <input
          ref={restoreInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              const n = await importAll(await f.text())
              await flushBackups()
              setNotice(`Obnoveno: ${n.roasts} pražení, ${n.coffees} káv, ${n.profiles} profilů (existující se přepsala, nic se nesmazalo).`)
            } catch (err) {
              setNotice(`Obnova selhala: ${err instanceof Error ? err.message : String(err)}`)
            }
          }}
        />
      </div>
    </Page>
  )
}
