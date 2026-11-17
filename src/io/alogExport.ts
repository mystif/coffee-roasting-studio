// App roast record → Artisan .alog (a Python dict literal, read by Artisan with ast.literal_eval).
// Mirrors the structure of the user's own Artisan 3.1 files for the keys that matter.
import { findEvent, type EventType } from '../domain/events'
import type { RoastRecord } from '../storage/roastRecord'

/** Python literal value: `float` keeps a decimal point even for whole numbers. */
type Py = null | boolean | string | number | { float: number } | Py[] | { [k: string]: Py }

const f = (n: number): Py => ({ float: n })

function py(v: Py): string {
  if (v === null) return 'None'
  if (v === true) return 'True'
  if (v === false) return 'False'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v)
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`
  if (Array.isArray(v)) return `[${v.map(py).join(', ')}]`
  if ('float' in v && Object.keys(v).length === 1 && typeof v.float === 'number') {
    const n = v.float
    return Number.isInteger(n) ? `${n}.0` : String(n)
  }
  return `{${Object.entries(v as Record<string, Py>).map(([k, x]) => `${py(k)}: ${py(x)}`).join(', ')}}`
}

/** Artisan slider events store the shown value s as internal v = s / 10 + 1. */
const internal = (shown: number) => Math.round((shown / 10 + 1) * 100) / 100

const ETYPES = ['Air', 'Drum', 'Damper', 'Power', '--']
const ETYPE_IDX = { air: 0, drum: 1, gas: 3 } as const

/** Artisan timeindex slots: CHARGE, DRY, FCs, FCe, SCs, SCe, DROP, COOL. */
const SLOTS: EventType[] = ['CHARGE', 'DRY', 'FCs', 'FCe', 'SC', 'SC', 'DROP', 'DROP']

export function recordToAlog(r: RoastRecord): string {
  const t = r.samples.t
  const idxAt = (sec: number) => {
    let best = 0
    for (let i = 0; i < t.length; i++) if (Math.abs(t[i] - sec) < Math.abs(t[best] - sec)) best = i
    return best
  }
  const timeindex = SLOTS.map((type, slot) => {
    if (slot === 5 || slot === 7) return 0 // SCe, COOL not recorded
    const e = findEvent(r.events, type)
    if (!e) return slot === 0 ? -1 : 0
    return idxAt(e.t)
  })

  const ev: { idx: number; type: number; value: number; label: string }[] = r.controls.map((c) => ({
    idx: idxAt(c.t),
    type: ETYPE_IDX[c.kind],
    value: c.kind === 'gas' ? internal(c.value * 10) : internal(c.value),
    label: c.kind === 'gas' ? `${String(c.value).replace('.', ',')} kPa` : `${c.value}%`,
  }))
  // custom events become Artisan "--" events with the note as label
  for (const e of r.events.filter((x) => x.type === 'CUSTOM')) ev.push({ idx: idxAt(e.t), type: 4, value: 0, label: e.note ?? '' })
  ev.sort((a, b) => a.idx - b.idx)

  const d = new Date(r.roastDate)
  const p2 = (n: number) => String(n).padStart(2, '0')
  const temp = (v: (number | null)[]) => v.map((x) => f(x ?? -1))
  const kg = (g: number | null) => f(g ? g / 1000 : 0)
  const charge = findEvent(r.events, 'CHARGE')
  const drop = findEvent(r.events, 'DROP')
  const tp = findEvent(r.events, 'TP')
  const interval = r.sampleIntervalMs / 1000

  const alog: Record<string, Py> = {
    recording_version: '3.1.0',
    version: '3.1.0',
    revision: '',
    build: '',
    artisan_os: 'Coffee Roasting Studio',
    mode: 'C',
    title: r.coffee || 'Roaster Scope',
    beans: r.coffee,
    weight: [kg(r.greenWeightG), kg(r.roastedWeightG), 'Kg'],
    roastertype: 'Dongyi BR',
    roastersize: f(3.5),
    machinesetup: 'BR',
    operator: '',
    organization: '',
    roastdate: d.toDateString(),
    roastisodate: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`,
    roasttime: `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`,
    roastepoch: Math.floor(d.getTime() / 1000),
    roasttzoffset: d.getTimezoneOffset() * 60,
    roastUUID: (r.id.startsWith('artisan-') ? r.id.slice(8) : r.id).replace(/-/g, '').slice(0, 32),
    roastbatchnr: 0,
    roastbatchprefix: '',
    roastbatchpos: 1,
    roastingnotes: r.notes,
    cuppingnotes: '',
    samplinginterval: f(interval),
    timex: t.map(f),
    temp1: temp(r.samples.et),
    temp2: temp(r.samples.bt),
    timeindex,
    specialevents: ev.map((e) => e.idx),
    specialeventstype: ev.map((e) => e.type),
    specialeventsvalue: ev.map((e) => f(e.value)),
    specialeventsStrings: ev.map((e) => e.label),
    etypes: ETYPES,
    default_etypes: [true, true, true, true, true],
    extradevices: [],
    extratimex: [],
    extratemp1: [],
    extratemp2: [],
    extraname1: [],
    extraname2: [],
    xmin: f(charge ? charge.t - 30 : 0),
    xmax: f((drop?.t ?? t[t.length - 1] ?? 600) + 60),
    ymin: 60,
    ymax: 250,
    zmin: 0,
    zmax: 20,
    computed: {
      TP_idx: tp ? idxAt(tp.t) : null,
      TP_time: tp && charge ? f(Math.round(tp.t - charge.t)) : null,
      TP_BT: tp?.bt != null ? f(tp.bt) : null,
      CHARGE_BT: charge?.bt != null ? f(charge.bt) : null,
      DROP_BT: drop?.bt != null ? f(drop.bt) : null,
      totaltime: r.phases ? f(Math.round(r.phases.total)) : null,
      dryphasetime: r.phases?.drying != null ? f(Math.round(r.phases.drying)) : null,
      midphasetime: r.phases?.maillard != null ? f(Math.round(r.phases.maillard)) : null,
      finishphasetime: r.phases?.development != null ? f(Math.round(r.phases.development)) : null,
      weightin: kg(r.greenWeightG),
      weightout: kg(r.roastedWeightG),
      weight_loss: r.lossPct != null ? f(r.lossPct) : null,
    },
  }
  return py(alog)
}

export function alogFileName(r: RoastRecord): string {
  const d = new Date(r.roastDate)
  const p2 = (n: number) => String(n).padStart(2, '0')
  const name = (r.coffee || 'prazeni').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60)
  return `${name} ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}${p2(d.getMinutes())}.alog`
}
