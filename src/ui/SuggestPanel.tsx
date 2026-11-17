import { useMemo, useState } from 'react'
import { alignCurves } from '../domain/compare'
import { STYLE_LABEL, suggestProfile, type RoastStyle } from '../domain/suggest'
import { roast } from '../live/runtime'
import type { Coffee } from '../storage/db'
import { createProfileFromSuggestion, profileChoice } from '../storage/profiles'
import { ClayButton } from './clay'
import { COMPARE_COLORS, CompareChart } from './CompareChart'
import { showAlert } from './dialog'
import { fmtTime } from './LiveChart'
import { go, inputCls } from './nav'

const STYLES: RoastStyle[] = ['filter', 'medium', 'dark']

/** Suggested starting profile for a coffee – choose the roast type, see the plan, save or use it. */
export function SuggestPanel({ coffee, onEdit }: { coffee: Coffee; onEdit?: () => void }) {
  const [style, setStyle] = useState<RoastStyle>('medium')
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const info = {
    name: coffee.name,
    country: coffee.country,
    region: coffee.region,
    process: coffee.process,
    variety: coffee.variety,
    altitude: coffee.altitude,
    screen: coffee.screen,
    moisture: coffee.moisture,
    crop: coffee.crop,
  }
  const s = useMemo(() => suggestProfile(info, style), [coffee, style]) // eslint-disable-line react-hooks/exhaustive-deps
  const aligned = useMemo(() => alignCurves([{ samples: s.samples, events: s.events }]), [s])
  const color = COMPARE_COLORS[0] // same colour as the single curve in the chart

  const save = async (use: boolean) => {
    const p = await createProfileFromSuggestion(coffee, s)
    setSaved((x) => ({ ...x, [style]: true }))
    if (use) {
      const first = (k: 'gas' | 'air') => s.plan.find((c) => c.kind === k)?.value
      const ok = roast.prepare({ coffee: coffee.name, coffeeId: coffee.id, greenWeightG: 3000, reference: profileChoice(p), current: { gas: first('gas'), air: first('air') } })
      if (!ok) return void showAlert('Právě probíhá pražení', 'Profil je uložený, vybereš ho po dokončení pražení.')
      go('#/')
    }
  }

  return (
    <div className="grid gap-4 rounded-2xl bg-[var(--c-bg)] p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Návrh profilu pro první pražení · 3 kg zelené kávy</p>
          <p className="text-xs text-zinc-400">
            Vychází z tvých pražení na Dongyi, upravený podle popisu kávy. Je to výchozí bod – po prvním pražení ho dolaď podle chuti.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Typ pražení
          <select value={style} onChange={(e) => setStyle(e.target.value as RoastStyle)} className={`${inputCls} font-semibold`}>
            {STYLES.map((x) => (
              <option key={x} value={x}>
                {STYLE_LABEL[x]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {s.missing.length > 0 && (
        <p className="rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-400/30">
          Pro přesnější návrh doplň: <b>{s.missing.join(', ')}</b>.{' '}
          {onEdit && (
            <button className="underline" onClick={onEdit}>
              Doplnit údaje
            </button>
          )}
        </p>
      )}

      <div className="h-56 rounded-xl bg-[var(--c-chart)] p-2">
        <CompareChart grid={aligned.grid} series={aligned.series} showET={false} showRoR />
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-4 text-sm">
        <div className="grid content-start gap-2">
          <p className="flex items-center gap-2 font-semibold">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {STYLE_LABEL[style]}
          </p>
          <table className="w-full tabular-nums">
            <tbody>
              <Row k="Charge BT" v={`${s.chargeBT.toFixed(0)} °C`} />
              <Row k="Turning Point" v={`${fmtTime(s.tp.t)} · ~${s.tp.bt.toFixed(0)} °C`} />
              <Row k="Dry End" v={`${fmtTime(s.dryEnd.t)} · ${s.dryEnd.bt} °C`} />
              <Row k="FC start" v={`${fmtTime(s.fcs.t)} · ${s.fcs.bt.toFixed(1)} °C`} />
              <Row k="Drop" v={`${fmtTime(s.drop.t)} · ${s.drop.bt.toFixed(1)} °C`} />
              <Row k="DTR" v={`${s.dtr.toFixed(1)} %`} />
            </tbody>
          </table>
        </div>
        <div className="grid content-start gap-2">
          <p className="font-semibold">Plán plynu a vzduchu</p>
          <div className="rounded-xl bg-[var(--c-surface)] p-2 text-xs leading-relaxed text-zinc-300">
            {s.plan.map((c, k) => (
              <div key={k} className="flex justify-between tabular-nums">
                <span className="text-zinc-400">{fmtTime(c.t)}</span>
                <span>{c.kind === 'gas' ? `plyn ${String(c.value).replace('.', ',')} kPa` : `vzduch ${c.value} %`}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ul className="list-disc space-y-0.5 pl-5 text-xs text-zinc-400">
        {s.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <ClayButton variant="primary" onClick={() => void save(true)}>
          Použít pro další pražení
        </ClayButton>
        <ClayButton onClick={() => void save(false)} disabled={saved[style]}>
          {saved[style] ? '✓ Uloženo v Profilech' : 'Uložit jako profil'}
        </ClayButton>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr className="border-t border-white/5">
      <td className="py-0.5 text-zinc-400">{k}</td>
      <td className="text-right font-semibold">{v}</td>
    </tr>
  )
}
