import { useLiveQuery } from 'dexie-react-hooks'
import { askConfirm, showAlert } from '../ui/dialog'
import { useState } from 'react'
import { findEvent } from '../domain/events'
import { phaseStats } from '../domain/phases'
import { roast } from '../live/runtime'
import { db, type Profile } from '../storage/db'
import { deleteProfile, profileChoice, updateProfile } from '../storage/profiles'
import { fmtDate } from '../storage/roastQueries'
import { ClayButton, Panel } from '../ui/clay'
import { fmtTime } from '../ui/LiveChart'
import { Page, go, inputCls } from '../ui/nav'

export function ProfilesScreen() {
  const profiles = useLiveQuery(() => db.profiles.orderBy('name').toArray(), [])
  return (
    <Page title="Profily">
      <div className="grid max-w-5xl gap-3">
        {profiles?.length === 0 && (
          <p className="text-zinc-400">
            Zatím žádný profil. Otevři povedené pražení v Historii a klikni <b>Uložit jako profil</b>. Profil pak vybereš při Start Roasting
            jako referenční křivku.
          </p>
        )}
        {profiles?.map((p) => <ProfileCard key={p.id} p={p} />)}
      </div>
    </Page>
  )
}

function ProfileCard({ p }: { p: Profile }) {
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState({ name: p.name, notes: p.notes, drop: p.targetDropBT?.toString() ?? '', time: p.targetTime ? fmtTime(p.targetTime) : '' })
  const stats = phaseStats(p.events, findEvent(p.events, 'DROP')?.t ?? p.samples.t.at(-1) ?? 0)
  const charge = findEvent(p.events, 'CHARGE')
  const fcs = findEvent(p.events, 'FCs')

  const use = () => {
    const first = (k: 'gas' | 'air' | 'drum') => p.controls.find((c) => c.kind === k)?.value
    if (!roast.prepare({ coffee: p.coffee, coffeeId: p.coffeeId, greenWeightG: roast.getSnapshot().greenWeightG, reference: profileChoice(p), current: { gas: first('gas'), air: first('air'), drum: first('drum') } }))
      return void showAlert('Právě probíhá pražení', 'Profil vybereš po jeho dokončení.')
    go('#/')
  }
  const save = async () => {
    const [m, s] = v.time.split(':').map(Number)
    await updateProfile(p.id, {
      name: v.name.trim() || p.name,
      notes: v.notes,
      targetDropBT: v.drop ? Number(v.drop.replace(',', '.')) : null,
      targetTime: Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : p.targetTime,
    })
    setEdit(false)
  }

  return (
    <Panel className="grid gap-3">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">{p.name}</p>
          <p className="text-sm text-zinc-400">
            {p.coffee || '—'} · vytvořeno {fmtDate(p.createdAt)}
            {p.fromRoastId && (
              <>
                {' · '}
                <a className="underline hover:text-zinc-100" href={`#/historie/${p.fromRoastId}`}>
                  zdrojové pražení
                </a>
              </>
            )}
          </p>
        </div>
        <ClayButton variant="primary" onClick={use}>
          Použít pro další pražení
        </ClayButton>
        <ClayButton onClick={() => setEdit((e) => !e)}>{edit ? 'Zavřít' : 'Upravit'}</ClayButton>
      </div>
      <div className="grid grid-cols-6 gap-2 text-sm tabular-nums">
        <Info label="Cíl Drop" value={p.targetDropBT == null ? '—' : `${p.targetDropBT.toFixed(1)} °C`} />
        <Info label="Cílový čas" value={p.targetTime == null ? '—' : fmtTime(p.targetTime)} />
        <Info label="FCs" value={fcs && charge ? `${fmtTime(fcs.t - charge.t)} · ${fcs.bt?.toFixed(1)}°` : '—'} />
        <Info label="Drying" value={stats?.drying == null ? '—' : `${fmtTime(stats.drying)} · ${stats.dryingPct?.toFixed(0)} %`} />
        <Info label="Maillard" value={stats?.maillard == null ? '—' : `${fmtTime(stats.maillard)} · ${stats.maillardPct?.toFixed(0)} %`} />
        <Info label="DTR" value={stats?.dtr == null ? '—' : `${stats.dtr.toFixed(1)} %`} />
      </div>
      {p.notes && !edit && <p className="whitespace-pre-wrap text-sm text-zinc-300">{p.notes}</p>}
      {edit && (
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Název
              <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Cílová teplota Drop (°C)
              <input value={v.drop} inputMode="decimal" onChange={(e) => setV({ ...v, drop: e.target.value })} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Předpokládaný čas (m:ss)
              <input value={v.time} onChange={(e) => setV({ ...v, time: e.target.value })} placeholder="11:30" className={inputCls} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Poznámky
            <textarea rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className={inputCls} />
          </label>
          <div className="flex gap-2">
            <ClayButton variant="primary" onClick={() => void save()}>
              Uložit
            </ClayButton>
            <ClayButton
              variant="danger"
              className="ml-auto"
              onClick={async () => {
                if (await askConfirm(`Smazat profil „${p.name}“?`, { message: 'Pražení v historii zůstanou.', okLabel: 'Smazat', danger: true })) await deleteProfile(p.id)
              }}
            >
              Smazat profil
            </ClayButton>
          </div>
        </div>
      )}
    </Panel>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--c-bg)] px-3 py-2">
      <div className="text-[0.6875rem] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  )
}
