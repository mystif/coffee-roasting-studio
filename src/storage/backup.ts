// Automatic backup of every saved roast as a JSON file into a folder the user picks
// (ideally iCloud Drive / Dropbox). Protects against the browser's data being cleared.
import { db, getSetting, setSetting } from './db'
import { backupFileName, type RoastRecord } from './roastRecord'
import { createStore } from './store'

// File System Access API bits missing from TypeScript's DOM lib
type PermissionMode = { mode: 'readwrite' }
interface DirHandle extends FileSystemDirectoryHandle {
  queryPermission(d: PermissionMode): Promise<PermissionState>
  requestPermission(d: PermissionMode): Promise<PermissionState>
}
declare global {
  interface Window {
    showDirectoryPicker?: (o?: { id?: string; mode?: 'readwrite' }) => Promise<DirHandle>
  }
}

const picker = () => (typeof window === 'undefined' ? undefined : window.showDirectoryPicker)

export type BackupStatus = 'unsupported' | 'unset' | 'needs-permission' | 'ok' | 'error'

export const backupState = createStore({
  status: (picker() ? 'unset' : 'unsupported') as BackupStatus,
  folder: '',
  pending: 0,
  error: '',
})

let dir: DirHandle | null = null
const RW: PermissionMode = { mode: 'readwrite' }

export async function initBackup() {
  if (!picker()) return
  dir = (await getSetting<DirHandle>('backupDir')) ?? null
  if (!dir) return refreshPending()
  backupState.set({ folder: dir.name })
  const perm = await dir.queryPermission(RW)
  backupState.set({ status: perm === 'granted' ? 'ok' : 'needs-permission' })
  await flushBackups()
}

/** User gesture required. */
export async function chooseBackupFolder() {
  const pick = picker()
  if (!pick) return
  const h = await pick({ id: 'roast-backup', mode: 'readwrite' })
  dir = h
  await setSetting('backupDir', h)
  backupState.set({ folder: h.name, status: 'ok', error: '' })
  await flushBackups()
}

/** User gesture required (Chrome asks again after a restart unless "allow on every visit"). */
export async function grantBackupPermission() {
  if (!dir) return
  const perm = await dir.requestPermission(RW)
  backupState.set({ status: perm === 'granted' ? 'ok' : 'needs-permission' })
  await flushBackups()
}

/** Writes every roast not yet backed up. Safe to call any time. */
export async function flushBackups() {
  if (dir && backupState.get().status === 'ok') {
    const todo = await db.roasts.filter((r) => !r.backedUp).toArray()
    for (const r of todo) {
      try {
        await writeFile(dir, backupFileName(r), JSON.stringify({ ...r, backedUp: true }, null, 1))
        await db.roasts.update(r.id, { backedUp: true })
      } catch (e) {
        backupState.set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
        break
      }
    }
  }
  await refreshPending()
}

async function refreshPending() {
  backupState.set({ pending: await db.roasts.filter((r) => !r.backedUp).count() })
}

async function writeFile(d: DirHandle, name: string, content: string) {
  const fh = await d.getFileHandle(name, { create: true })
  const w = await fh.createWritable()
  await w.write(content)
  await w.close()
}

export type { RoastRecord }
