import { parsePyLiteral, type PyValue } from './pyLiteral'

/** Subset of an Artisan .alog that the app uses. Times are seconds from recording start. */
export interface AlogRoast {
  title: string
  roastDate: string
  samplingInterval: number
  t: number[]
  bt: (number | null)[]
  et: (number | null)[]
  /** Artisan timeindex: CHARGE, DRY, FCs, FCe, SCs, SCe, DROP, COOL (sample index; 0 = not set except CHARGE) */
  timeindex: number[]
  greenWeight: number | null
  roastedWeight: number | null
  weightUnit: string
  specialEvents: { idx: number; type: number; value: number; label: string }[]
  eventTypes: string[]
  computed: Record<string, number | null>
  /** epoch seconds of t = 0 */
  roastEpoch: number | null
  uuid: string
  beans: string
  roastingNotes: string
  cuppingNotes: string
}

type Dict = { [k: string]: PyValue }

const temp = (v: PyValue): number | null => (typeof v === 'number' && v !== -1 ? v : null)

export function parseAlog(src: string): AlogRoast {
  const d = parsePyLiteral(src)
  if (!d || typeof d !== 'object' || Array.isArray(d) || !Array.isArray(d.timex)) {
    throw new Error('Soubor není platný záznam Artisan (.alog)')
  }
  const o = d as Dict
  const arr = (k: string) => (Array.isArray(o[k]) ? (o[k] as PyValue[]) : [])
  const weight = arr('weight')
  const evIdx = arr('specialevents')
  return {
    title: String(o.title ?? ''),
    roastDate: String(o.roastisodate ?? o.roastdate ?? ''),
    samplingInterval: Number(o.samplinginterval ?? 0),
    t: arr('timex').map(Number),
    et: arr('temp1').map(temp),
    bt: arr('temp2').map(temp),
    timeindex: arr('timeindex').map(Number),
    greenWeight: typeof weight[0] === 'number' && weight[0] > 0 ? weight[0] : null,
    roastedWeight: typeof weight[1] === 'number' && weight[1] > 0 ? weight[1] : null,
    weightUnit: String(weight[2] ?? 'Kg'),
    specialEvents: evIdx.map((idx, k) => ({
      idx: Number(idx),
      type: Number(arr('specialeventstype')[k]),
      value: Number(arr('specialeventsvalue')[k]),
      label: String(arr('specialeventsStrings')[k] ?? ''),
    })),
    eventTypes: arr('etypes').map(String),
    roastEpoch: typeof o.roastepoch === 'number' ? o.roastepoch : null,
    uuid: String(o.roastUUID ?? ''),
    beans: String(o.beans ?? ''),
    roastingNotes: String(o.roastingnotes ?? ''),
    cuppingNotes: String(o.cuppingnotes ?? ''),
    computed: Object.fromEntries(
      Object.entries((o.computed as Dict) ?? {}).map(([k, v]) => [k, typeof v === 'number' ? v : null]),
    ),
  }
}
