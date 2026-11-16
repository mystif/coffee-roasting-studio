// Test helper: the user's own Artisan roasts, available only on the local machine (not in git).
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAlog, type AlogRoast } from '../io/alog'

const dirs = ['../../_data/', '../../test/Roast_profil/'].map((d) => fileURLToPath(new URL(d, import.meta.url)))
const files = new Map<string, string>()
for (const d of dirs) if (existsSync(d)) for (const f of readdirSync(d)) if (f.endsWith('.alog') && !files.has(f)) files.set(f, join(d, f))

export const realRoastNames = [...files.keys()].sort()
export const loadRealRoast = (name: string): AlogRoast => parseAlog(readFileSync(files.get(name)!, 'utf8'))
