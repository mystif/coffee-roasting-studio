// Choices for describing a green coffee (dropdowns instead of free text) and how each one
// shifts the suggested roast. Effects are deliberately small and add up; they are common
// roasting rules of thumb, applied on top of the user's own roasts on the Dongyi.

export interface Effect {
  /** Charge BT (°C) */
  charge?: number
  /** gas at the start / in Maillard / before FC (kPa) */
  gasStart?: number
  gasDry?: number
  gasFc?: number
  /** Dry End later/earlier (s) */
  dry?: number
  /** First Crack later/earlier (s) */
  fc?: number
  /** development time (s) */
  dev?: number
  /** Drop BT (°C) */
  drop?: number
}

export interface Choice {
  id: string
  label: string
  effect: Effect
  /** shown in the suggestion's reasons */
  why?: string
}

export type Density = 'low' | 'medium' | 'high'

const DENSITY: Record<Density, Choice> = {
  high: { id: 'high', label: 'vysoká', effect: { charge: 3, gasStart: 0.5, gasDry: 0.5 }, why: 'hustá zrna z vysokých poloh: Charge +3 °C a víc plynu do Maillardu, aby zrno dobře prohřálo' },
  medium: { id: 'medium', label: 'střední', effect: {} },
  low: { id: 'low', label: 'nízká', effect: { charge: -3, gasDry: -0.5, fc: 10 }, why: 'měkčí zrna z nižších poloh: Charge −3 °C a méně plynu v Maillardu proti připálení' },
}

/** Countries with the typical density of their coffee (used when altitude is not known). */
export const COUNTRIES: { name: string; density: Density }[] = [
  { name: 'Bolívie', density: 'high' },
  { name: 'Brazílie', density: 'low' },
  { name: 'Burundi', density: 'high' },
  { name: 'Čína (Yunnan)', density: 'medium' },
  { name: 'Dominikánská republika', density: 'medium' },
  { name: 'Ekvádor', density: 'high' },
  { name: 'Etiopie', density: 'high' },
  { name: 'Filipíny', density: 'medium' },
  { name: 'Guatemala', density: 'high' },
  { name: 'Haiti', density: 'low' },
  { name: 'Havaj (Kona)', density: 'medium' },
  { name: 'Honduras', density: 'medium' },
  { name: 'Indie', density: 'low' },
  { name: 'Indonésie (Sumatra, Jáva, Sulawesi)', density: 'low' },
  { name: 'Jamajka', density: 'medium' },
  { name: 'Jemen', density: 'high' },
  { name: 'Keňa', density: 'high' },
  { name: 'Kolumbie', density: 'high' },
  { name: 'Kongo (DR)', density: 'medium' },
  { name: 'Kostarika', density: 'high' },
  { name: 'Kuba', density: 'low' },
  { name: 'Laos', density: 'medium' },
  { name: 'Malawi', density: 'medium' },
  { name: 'Mexiko', density: 'medium' },
  { name: 'Myanmar', density: 'medium' },
  { name: 'Nikaragua', density: 'medium' },
  { name: 'Panama', density: 'high' },
  { name: 'Papua Nová Guinea', density: 'medium' },
  { name: 'Peru', density: 'medium' },
  { name: 'Rwanda', density: 'high' },
  { name: 'Salvador', density: 'medium' },
  { name: 'Tanzanie', density: 'high' },
  { name: 'Thajsko', density: 'medium' },
  { name: 'Uganda', density: 'medium' },
  { name: 'Vietnam', density: 'low' },
  { name: 'Zambie', density: 'medium' },
  { name: 'Směs (blend)', density: 'medium' },
]

export const PROCESSES: Choice[] = [
  { id: 'washed', label: 'Washed (mytá)', effect: {}, why: 'washed: čisté zpracování, bez úprav' },
  { id: 'semi-washed', label: 'Semi-washed', effect: { charge: -1 } },
  { id: 'white-honey', label: 'White honey', effect: { charge: -1 } },
  { id: 'yellow-honey', label: 'Yellow honey', effect: { charge: -2 }, why: 'honey: víc cukrů na zrnu – Charge −2 °C' },
  { id: 'red-honey', label: 'Red honey', effect: { charge: -3, drop: -0.5 }, why: 'red honey: hodně cukrů – Charge −3 °C' },
  { id: 'black-honey', label: 'Black honey', effect: { charge: -4, gasDry: -0.5, drop: -0.5 }, why: 'black honey: nejvíc cukrů z honey – Charge −4 °C, méně plynu v Maillardu' },
  { id: 'pulped-natural', label: 'Pulped natural', effect: { charge: -3 }, why: 'pulped natural: mezi washed a natural – Charge −3 °C' },
  {
    id: 'natural',
    label: 'Natural (sušená v plodu)',
    effect: { charge: -5, gasStart: -0.5, gasDry: -0.5, drop: -1, dev: -8 },
    why: 'natural: hodně cukrů, rychle hnědne – Charge −5 °C, o 0,5 kPa méně plynu, Drop −1 °C',
  },
  { id: 'wet-hulled', label: 'Wet hulled (Giling basah)', effect: { charge: -4, gasDry: -0.5 }, why: 'wet hulled: měkké a vlhčí zrno – Charge −4 °C, méně plynu v Maillardu' },
  {
    id: 'anaerobic',
    label: 'Anaerobní fermentace',
    effect: { charge: -8, gasStart: -0.5, gasDry: -0.5, gasFc: -0.5, drop: -2, dev: -10 },
    why: 'anaerobní fermentace: rychle hnědne a snadno se připálí – Charge −8 °C, méně plynu, Drop −2 °C',
  },
  {
    id: 'carbonic',
    label: 'Carbonic maceration',
    effect: { charge: -8, gasStart: -0.5, gasDry: -0.5, gasFc: -0.5, drop: -2, dev: -10 },
    why: 'carbonic maceration: jako anaerobní – šetrně, Charge −8 °C, Drop −2 °C',
  },
  { id: 'infused', label: 'Infused / ochucená fermentace', effect: { charge: -8, gasDry: -0.5, drop: -2, dev: -10 }, why: 'infused: šetrně, aby se aromatika nespálila – Charge −8 °C, Drop −2 °C' },
  { id: 'monsooned', label: 'Monsooned', effect: { charge: -6, gasDry: -0.5, drop: -1 }, why: 'monsooned: nafouklé lehké zrno – Charge −6 °C, méně plynu' },
  { id: 'decaf', label: 'Decaf (bez kofeinu)', effect: { charge: -8, drop: -3, dev: -15 }, why: 'decaf: tmavne rychle a hůř se čte barva – Charge −8 °C, Drop −3 °C' },
]

export const VARIETIES: Choice[] = [
  { id: 'unknown', label: 'nevím / směs', effect: {} },
  { id: 'bourbon', label: 'Bourbon', effect: {} },
  { id: 'yellow-bourbon', label: 'Yellow / Red Bourbon', effect: {} },
  { id: 'pink-bourbon', label: 'Pink Bourbon', effect: { drop: -1, dev: -5 }, why: 'Pink Bourbon: jemná aromatika – Drop −1 °C' },
  { id: 'caturra', label: 'Caturra', effect: {} },
  { id: 'catuai', label: 'Catuaí', effect: {} },
  { id: 'typica', label: 'Typica', effect: {} },
  { id: 'castillo', label: 'Castillo / Colombia', effect: {} },
  { id: 'catimor', label: 'Catimor / Sarchimor', effect: { charge: 1 } },
  { id: 'mundo-novo', label: 'Mundo Novo', effect: {} },
  { id: 'sl28', label: 'SL28 / SL34 / Ruiru', effect: { charge: 2, gasDry: 0.5 }, why: 'SL28/SL34: velmi hustá zrna – Charge +2 °C, víc plynu v Maillardu' },
  { id: 'heirloom', label: 'Ethiopian heirloom / landrace', effect: { gasDry: -0.5 }, why: 'etiopské odrůdy: malá zrna se prohřejí rychleji – méně plynu v Maillardu' },
  { id: 'gesha', label: 'Gesha / Geisha', effect: { drop: -1.5, dev: -10 }, why: 'Gesha: jemná květinová aromatika – kratší vývoj, Drop −1,5 °C' },
  { id: 'pacamara', label: 'Pacamara / Maragogype', effect: { charge: 2, dry: 15 }, why: 'velká zrna Pacamara/Maragogype: Charge +2 °C a delší sušení' },
  { id: 'java', label: 'Java', effect: {} },
  { id: 'robusta', label: 'Robusta (Canephora)', effect: { drop: 2, dev: 20 }, why: 'Robusta: delší vývoj, Drop +2 °C' },
]

/** Altitude overrides the country's typical density when known. */
export const ALTITUDES: Choice[] = [
  { id: 'unknown', label: 'nevím (podle země)', effect: {} },
  { id: 'lt1000', label: 'pod 1000 m', effect: DENSITY.low.effect, why: 'pod 1000 m: ' + DENSITY.low.why },
  { id: '1000-1400', label: '1000–1400 m', effect: { charge: -1 } },
  { id: '1400-1800', label: '1400–1800 m', effect: {} },
  { id: '1800-2100', label: '1800–2100 m', effect: DENSITY.high.effect, why: '1800–2100 m: ' + DENSITY.high.why },
  { id: 'gt2100', label: 'nad 2100 m', effect: { charge: 5, gasStart: 0.5, gasDry: 0.5, dry: 10 }, why: 'nad 2100 m: velmi hustá zrna – Charge +5 °C, víc plynu, o něco delší sušení' },
]

export const SCREENS: Choice[] = [
  { id: 'unknown', label: 'nevím', effect: {} },
  { id: 'small', label: 'malá (screen ≤ 15)', effect: { charge: -2, gasDry: -0.5 }, why: 'malá zrna: prohřejí se rychle – Charge −2 °C, méně plynu v Maillardu' },
  { id: 'medium', label: 'střední (16–17)', effect: {} },
  { id: 'large', label: 'velká (18+)', effect: { charge: 2, dry: 10 }, why: 'velká zrna: Charge +2 °C, o něco delší sušení' },
  { id: 'peaberry', label: 'peaberry (kulatá)', effect: { gasDry: -0.5 }, why: 'peaberry: kulatá zrna se prohřejí rychleji – méně plynu v Maillardu' },
]

export const MOISTURES: Choice[] = [
  { id: 'unknown', label: 'nevím', effect: {} },
  { id: 'dry', label: 'pod 10 % (suchá)', effect: { charge: -2, dry: -15 }, why: 'suchá zelená káva (< 10 %): kratší sušení, Charge −2 °C' },
  { id: 'normal', label: '10–11,5 %', effect: {} },
  { id: 'wet', label: 'nad 11,5 % (vlhčí)', effect: { charge: 2, gasStart: 0.5, dry: 15 }, why: 'vlhčí zelená káva (> 11,5 %): delší sušení, Charge +2 °C, víc plynu na startu' },
]

export const CROPS: Choice[] = [
  { id: 'unknown', label: 'nevím', effect: {} },
  { id: 'fresh', label: 'nová sklizeň (do 6 měsíců)', effect: {} },
  { id: 'aging', label: '6–12 měsíců', effect: { charge: -1 } },
  { id: 'past', label: 'starší než rok (past crop)', effect: { charge: -2, drop: -1, dev: -10 }, why: 'starší sklizeň: zrno je sušší a aromatika křehčí – Charge −2 °C, kratší vývoj' },
]

export const densityOf = (country: string): Density | null => {
  const c = COUNTRIES.find((x) => x.name.toLowerCase() === country.trim().toLowerCase())
  return c ? c.density : null
}

export const densityEffect = (d: Density) => DENSITY[d]

export const findChoice = (list: Choice[], value: string | undefined) =>
  value ? list.find((c) => c.id === value || c.label.toLowerCase() === value.trim().toLowerCase()) : undefined
