export type EventType = 'CHARGE' | 'TP' | 'DRY' | 'FCs' | 'FCe' | 'SC' | 'DROP' | 'CUSTOM'

export const EVENT_LABEL: Record<EventType, string> = {
  CHARGE: 'Charge',
  TP: 'Turning Point',
  DRY: 'Dry End',
  FCs: 'FC start',
  FCe: 'FC end',
  SC: 'Second Crack',
  DROP: 'Drop',
  CUSTOM: 'Vlastní',
}

export const EVENT_SHORT: Record<EventType, string> = {
  CHARGE: 'CHARGE',
  TP: 'TP',
  DRY: 'DE',
  FCs: 'FCs',
  FCe: 'FCe',
  SC: 'SC',
  DROP: 'DROP',
  CUSTOM: '★',
}

export interface RoastEvent {
  id: string
  type: EventType
  /** seconds on the session timeline */
  t: number
  bt: number | null
  et: number | null
  /** set by automatic detection (can be overridden manually) */
  auto?: boolean
  note?: string
}

export type ControlKind = 'gas' | 'air' | 'drum'

export interface ControlChange {
  t: number
  kind: ControlKind
  value: number
}

export const CONTROL_UNIT: Record<ControlKind, string> = { gas: 'kPa', air: '%', drum: '%' }

/** Order the space bar walks through. TP is automatic, SC optional. */
export const MAIN_SEQUENCE: EventType[] = ['CHARGE', 'DRY', 'FCs', 'FCe', 'DROP']

export const findEvent = (events: RoastEvent[], type: EventType) => events.find((e) => e.type === type)

export function nextExpected(events: RoastEvent[]): EventType | null {
  if (findEvent(events, 'DROP')) return null
  return MAIN_SEQUENCE.find((t) => !findEvent(events, t)) ?? null
}
