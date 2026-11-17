import { useMemo, useState } from 'react'
import { alignCurves } from '../domain/compare'
import { suggestProfile, type RoastStyle, type Suggestion } from '../domain/suggest'
import { roast } from '../live/runtime'
import type { Coffee } from '../storage/db'
import { createProfileFromSuggestion, profileChoice } from '../storage/profiles'
import { ClayButton } from './clay'
import { COMPARE_COLORS, CompareChart } from './CompareChart'
import { showAlert } from './dialog'
import { fmtTime } from './LiveChart'
import { go } from './nav'

const STYLE_LABEL: Record<RoastStyle, string> = { espresso: 'Espresso · středně pražená', filter: 'Filtr · světlejší' }

/** Suggested starting profiles (espresso + filter) for a coffee, from its origin, processing and variety. */
export function SuggestPanel({ coffee }: { coffee: Coffee }) {
  const info = { name: coffee.name, country: coffee.country, region: coffee.region, process: coffee.process, variety: coffee.variety }
  const variants = useMemo(() => (['espresso', 'filter'] as const).map((s) => suggestProfile(info, s)), [coffee]) // eslint-disable-line react-hooks/exhaustive-deps
  const aligned = useMemo(() => alignCurves(variants.map((v) => ({ samples: v.samples, events: v.events }))), [variants])
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const missing = [!coffee.country && 'zemi původu', !coffee.process && 'zpracování'].filter(Boolean)

  const save = async (s: Suggestion, use: boolean) => {
    const p = await createProfileFromSuggestion(coffee, s)
    setSaved((x) => ({ ...x, [s.style]: true }))
    if (use) {
      const first = (k: 'gas' | 'air') => s.plan.find((c) => c.kind === k)?.value
      const ok = roast.prepare({ coffee: coffee.name, coffeeId: coffee.id, greenWeightG: 3000, reference: profileChoice(p), current: { gas: first('gas'), air: first('air') } })
      if (!ok) return void showAlert('Právě probíhá pražení', 'Profil je uložený, vybereš ho po dokončení pražení.')
      go('#/')
    }
  }

  return (
    <div className="grid gap-4 rounded-2xl bg-[var(--c-bg)] p-4">
      <div>
        <p className="font-semibold">Návrh profilu pro první pražení · 3 kg zelené kávy</p>
        <p className="text-xs text-zinc-400">
          Vychází z tvých pražení na Dongyi a je upravený podle původu, zpracování a odrůdy. Je to výchozí bod, ne záruka – po prvním pražení
          ho dolaď podle chuti.
          {missing.length > 0 && <span className="text-amber-300"> Doplň {missing.join(' a ')} – návrh bude přesnější.</span>}
        </p>
      </div>
      <div className="h-56 rounded-xl bg-[var(--c-chart)] p-2">
        <CompareChart grid={aligned.grid} series={aligned.series} showET={false} showRoR />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {variants.map((s, i) => (
          <div key={s.style} className="grid gap-2 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: COMPARE_COLORS[i] }} />
              {STYLE_LABEL[s.style]}
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
            <div className="rounded-xl bg-[var(--c-surface)] p-2 text-xs leading-relaxed text-zinc-300">
              {s.plan.map((c, k) => (
                <div key={k} className="flex justify-between tabular-nums">
                  <span className="text-zinc-400">{fmtTime(c.t)}</span>
                  <span>{c.kind === 'gas' ? `plyn ${String(c.value).replace('.', ',')} kPa` : `vzduch ${c.value} %`}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <ClayButton variant="primary" onClick={() => void save(s, true)}>
                Použít pro další pražení
              </ClayButton>
              <ClayButton onClick={() => void save(s, false)} disabled={saved[s.style]}>
                {saved[s.style] ? '✓ Uloženo v Profilech' : 'Uložit jako profil'}
              </ClayButton>
            </div>
          </div>
        ))}
      </div>
      <ul className="list-disc space-y-0.5 pl-5 text-xs text-zinc-400">
        {variants[0].reasons.slice(1).length === 0 && <li>Bez úprav – vychází přímo z tvých průměrných pražení.</li>}
        {variants[0].reasons.slice(1).map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
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
