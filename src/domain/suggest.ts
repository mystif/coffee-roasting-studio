// Starting roast profile for a new coffee (3 kg green on the Dongyi BR-3.5).
//
// Base = medians of the user's own roasts on this roaster (Artisan files, 3 kg, dark blends excluded):
//   espresso (10 roasts, Drop ≥ 203 °C): Charge 202, TP 1:21 @ 88, DE 4:42, FC 8:52 @ 180.6, Drop 12:11 @ 205, DTR 24.5 %
//   filter   (17 roasts, Drop ≤ 202 °C): Charge 192, TP 1:22 @ 85, DE 4:46, FC 9:26 @ 180.7, Drop 11:42 @ 200, DTR 19 %
// plus the user's usual gas/air steps. It is then adjusted with common roasting rules for bean
// density (origin), processing and variety. It is a starting point for the first roast, not a guarantee.
import type { ControlChange, ControlKind, EventType, RoastEvent } from './events'

export type RoastStyle = 'espresso' | 'filter'

export interface CoffeeInfo {
  name: string
  country: string
  region?: string
  process: string
  variety: string
}

export interface Suggestion {
  style: RoastStyle
  greenWeightG: number
  chargeBT: number
  tp: { t: number; bt: number }
  dryEnd: { t: number; bt: number }
  fcs: { t: number; bt: number }
  drop: { t: number; bt: number }
  dtr: number
  /** gas (kPa) and air (%) steps, seconds from CHARGE */
  plan: ControlChange[]
  /** why the base was adjusted – shown to the user */
  reasons: string[]
  /** synthetic curve for the reference (seconds from CHARGE) */
  samples: { t: number[]; bt: number[]; et: number[] }
  events: RoastEvent[]
}

interface Base {
  charge: number
  tp: number
  tpBT: number
  dry: number
  fc: number
  fcBT: number
  dev: number
  dropBT: number
  gasStart: number
  gasDry: number
  gasFc: number
  gasLate: number | null
}

const BASE: Record<RoastStyle, Base> = {
  espresso: { charge: 202, tp: 81, tpBT: 88, dry: 282, fc: 532, fcBT: 180.6, dev: 176, dropBT: 205, gasStart: 5.5, gasDry: 4.5, gasFc: 3.5, gasLate: 3 },
  filter: { charge: 192, tp: 82, tpBT: 85, dry: 286, fc: 566, fcBT: 180.7, dev: 140, dropBT: 200, gasStart: 5, gasDry: 4, gasFc: 3, gasLate: null },
}

const DRY_END_TEMP = 130

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const has = (text: string, words: string[]) => words.some((w) => text.includes(w))

/** Dense, high-grown origins take more energy; soft, low-grown ones scorch easily. */
const HIGH_DENSITY = ['kenya', 'kena', 'ethiop', 'etiop', 'rwand', 'burund', 'colomb', 'kolumb', 'guatemal', 'costa rica', 'kostarik', 'panam', 'peru', 'bolivi', 'hondur', 'el salvador', 'salvador', 'tanzan', 'yemen', 'jemen']
const LOW_DENSITY = ['brazil', 'brazil', 'brazi', 'indi', 'sumatr', 'indones', 'java', 'jav', 'papua', 'png', 'mexik', 'mexic', 'nikaragu', 'nicaragu', 'ugand', 'vietnam', 'laos', 'cin', 'china', 'hawaj', 'hawai']

export function suggestProfile(c: CoffeeInfo, style: RoastStyle): Suggestion {
  const b = { ...BASE[style] }
  const reasons: string[] = [
    style === 'espresso'
      ? 'Základ: tvoje espresso pražení na Dongyi (medián 10 pražení, 3 kg): Drop ~205 °C, DTR ~24 %.'
      : 'Základ: tvoje filtrová pražení na Dongyi (medián 17 pražení, 3 kg): Drop ~200 °C, DTR ~19 %.',
  ]
  const origin = norm(`${c.country} ${c.region ?? ''} ${c.name}`)
  const proc = norm(c.process)
  const variety = norm(`${c.variety} ${c.name}`)

  // ── density (origin) ──
  if (has(origin, HIGH_DENSITY)) {
    b.charge += 3
    b.gasStart += 0.5
    b.gasDry += 0.5
    reasons.push('Hustá zrna z vyšších poloh (původ): Charge +3 °C a víc plynu do Maillardu, aby zrno dobře prohřálo.')
  } else if (has(origin, LOW_DENSITY)) {
    b.charge -= 3
    b.gasDry -= 0.5
    b.fc += 10
    reasons.push('Měkčí zrna z nižších poloh (původ): Charge −3 °C a méně plynu v Maillardu proti připálení.')
  }

  // ── processing ──
  if (has(proc, ['anaerob', 'carbonic', 'fermen', 'infus', 'thermal', 'experiment'])) {
    b.charge -= 8
    b.gasStart -= 0.5
    b.gasDry -= 0.5
    b.gasFc -= 0.5
    b.dropBT -= 2
    b.dev -= 10
    reasons.push('Experimentální/anaerobní zpracování: hodně cukrů, rychle hnědne – Charge −8 °C, méně plynu, Drop −2 °C.')
  } else if (has(proc, ['natural', 'natur', 'dry process', 'sun dried'])) {
    b.charge -= 5
    b.gasStart -= 0.5
    b.gasDry -= 0.5
    b.dropBT -= 1
    b.dev -= 8
    reasons.push('Natural: vyšší obsah cukrů a rychlejší hnědnutí – Charge −5 °C, o 0,5 kPa méně plynu od začátku i v Maillardu, Drop −1 °C.')
  } else if (has(proc, ['honey', 'pulped', 'semi'])) {
    b.charge -= 3
    b.dropBT -= 0.5
    reasons.push('Honey / pulped natural: mezi washed a natural – Charge −3 °C.')
  } else if (has(proc, ['decaf', 'bezkofein', 'swiss water', 'ea process', 'sugar cane'])) {
    b.charge -= 8
    b.dropBT -= 3
    b.dev -= 15
    reasons.push('Decaf: tmavne rychle a hůř se čte barva – Charge −8 °C, Drop −3 °C.')
  } else if (has(proc, ['wet hulled', 'giling'])) {
    b.charge -= 4
    b.gasDry -= 0.5
    reasons.push('Wet hulled: měkčí zrno s vyšší vlhkostí – Charge −4 °C, méně plynu v Maillardu.')
  } else if (has(proc, ['wash', 'mytá', 'myta', 'fully washed'])) {
    reasons.push('Washed: standardní průběh bez úprav.')
  }

  // ── variety ──
  if (has(variety, ['gesha', 'geisha'])) {
    b.dropBT -= 1.5
    b.dev -= 10
    reasons.push('Gesha: jemná květinová aromatika – kratší vývoj a Drop −1,5 °C.')
  }
  if (has(variety, ['pacamara', 'maragogyp', 'maragogip', 'elephant'])) {
    b.charge += 2
    b.dry += 15
    reasons.push('Velká zrna (Pacamara/Maragogype): Charge +2 °C a o něco delší sušení.')
  }
  if (has(variety, ['robusta', 'canephora', 'conilon'])) {
    b.dropBT += 2
    b.dev += 20
    reasons.push('Robusta: delší vývoj a Drop +2 °C.')
  }
  if (has(variety, ['peaberry', 'caracol'])) {
    b.gasDry -= 0.5
    reasons.push('Peaberry: menší kulatá zrna se prohřejí rychleji – méně plynu v Maillardu.')
  }

  // the user never goes above 5.5 kPa in their roasts → don't suggest more
  b.gasStart = clamp(b.gasStart, 2, 5.5)
  b.gasDry = clamp(b.gasDry, 2, b.gasStart)
  b.gasFc = clamp(b.gasFc, 2, b.gasDry)

  const drop = b.fc + b.dev
  const plan: ControlChange[] = [
    { t: 0, kind: 'gas', value: b.gasStart },
    { t: 0, kind: 'air', value: style === 'espresso' ? 35 : 25 },
    { t: Math.max(b.tp + 30, b.dry - 20), kind: 'gas', value: b.gasDry },
    { t: b.dry, kind: 'air', value: 50 },
    { t: b.fc - 40, kind: 'gas', value: b.gasFc },
    { t: b.fc, kind: 'air', value: 65 },
  ]
  if (b.gasLate !== null && b.dev > 120) plan.push({ t: b.fc + 90, kind: 'gas', value: Math.max(2, Math.min(b.gasLate, b.gasFc - 0.5)) })
  if (style === 'espresso') plan.push({ t: drop - 60, kind: 'air', value: 75 })
  plan.sort((x, y) => x.t - y.t || kindOrder(x.kind) - kindOrder(y.kind))

  const keyPoints = { charge: b.charge, tp: b.tp, tpBT: b.tpBT, dry: b.dry, fc: b.fc, fcBT: b.fcBT, drop, dropBT: b.dropBT }
  const samples = synthCurve(keyPoints)
  const ev = (type: EventType, t: number, bt: number): RoastEvent => ({ id: `${type}-s`, type, t, bt: round1(bt), et: null })

  return {
    style,
    greenWeightG: 3000,
    chargeBT: round1(b.charge),
    tp: { t: b.tp, bt: b.tpBT },
    dryEnd: { t: b.dry, bt: DRY_END_TEMP },
    fcs: { t: b.fc, bt: b.fcBT },
    drop: { t: drop, bt: round1(b.dropBT) },
    dtr: round1((b.dev / drop) * 100),
    plan,
    reasons,
    samples,
    events: [
      ev('CHARGE', 0, b.charge),
      { ...ev('TP', b.tp, b.tpBT), auto: true },
      ev('DRY', b.dry, DRY_END_TEMP),
      ev('FCs', b.fc, b.fcBT),
      ev('DROP', drop, b.dropBT),
    ],
  }
}

const kindOrder = (k: ControlKind) => ({ gas: 0, air: 1, drum: 2 })[k]
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(x * 2) / 2))
const round1 = (x: number) => Math.round(x * 10) / 10

/**
 * Plausible BT/ET curves through the key points: an easing fall to the Turning Point, then a
 * monotone cubic (Fritsch–Carlson) through Dry End, First Crack and Drop, flat slope at TP.
 */
export function synthCurve(p: { charge: number; tp: number; tpBT: number; dry: number; fc: number; fcBT: number; drop: number; dropBT: number }) {
  const xs = [p.tp, p.dry, (p.dry + p.fc) / 2, p.fc, p.drop]
  const ys = [p.tpBT, DRY_END_TEMP, (DRY_END_TEMP + p.fcBT) / 2 + 2, p.fcBT, p.dropBT]
  const m = monotoneSlopes(xs, ys)
  m[0] = 0
  const t: number[] = []
  const bt: number[] = []
  const et: number[] = []
  for (let s = -30; s <= p.drop + 20; s += 2) {
    let v: number
    if (s <= 0) v = p.charge
    else if (s <= p.tp) v = p.tpBT + (p.charge - p.tpBT) * Math.pow(1 - s / p.tp, 2.2)
    else if (s >= p.drop) v = p.dropBT - (s - p.drop) * 0.8 // after DROP the probe cools
    else v = hermite(xs, ys, m, s)
    t.push(s)
    bt.push(round1(v))
    et.push(round1(etAt(s, v, p)))
  }
  return { t, bt, et }
}

/** ET roughly as on the user's roaster: dips after CHARGE, then BT + a shrinking gap (~70 → 30 °C). */
function etAt(s: number, bt: number, p: { charge: number; tp: number; dry: number; fc: number; drop: number }) {
  if (s <= 0) return p.charge + 15
  if (s <= p.tp) return p.charge + 15 - (40 * s) / p.tp
  const gap = s <= p.dry ? 75 - (25 * (s - p.tp)) / (p.dry - p.tp) : s <= p.fc ? 50 - (5 * (s - p.dry)) / (p.fc - p.dry) : 45 - (15 * Math.min(1, (s - p.fc) / (p.drop - p.fc)))
  return Math.max(p.charge - 25, bt + gap)
}

function monotoneSlopes(x: number[], y: number[]): number[] {
  const n = x.length
  const d = x.slice(0, -1).map((_, i) => (y[i + 1] - y[i]) / (x[i + 1] - x[i]))
  const m = [d[0], ...d.slice(1).map((v, i) => (Math.sign(v) !== Math.sign(d[i]) ? 0 : (v + d[i]) / 2)), d[n - 2]]
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const h = a * a + b * b
    if (h > 9) {
      const k = 3 / Math.sqrt(h)
      m[i] = k * a * d[i]
      m[i + 1] = k * b * d[i]
    }
  }
  return m
}

function hermite(x: number[], y: number[], m: number[], s: number): number {
  let i = 0
  while (i < x.length - 2 && s > x[i + 1]) i++
  const h = x[i + 1] - x[i]
  const u = (s - x[i]) / h
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1
  const h10 = u ** 3 - 2 * u ** 2 + u
  const h01 = -2 * u ** 3 + 3 * u ** 2
  const h11 = u ** 3 - u ** 2
  return h00 * y[i] + h10 * h * m[i] + h01 * y[i + 1] + h11 * h * m[i + 1]
}
