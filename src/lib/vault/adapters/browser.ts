import { VaultAdapter } from '@/types'

const KEY = 'synapsium.vault'

type Store = { [path: string]: string }

function load(): Store {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}

function save(store: Store) { localStorage.setItem(KEY, JSON.stringify(store)) }

function norm(p: string) { return p.replace(/\\/g,'/').replace(/\/+/, '/') }

export const browserVault: VaultAdapter = {
  async readDir(path) {
    const s = load()
    const prefix = norm(path).replace(/\/$/,'') + '/'
    const set = new Set<string>()
    Object.keys(s).forEach(k=>{ if (k.startsWith(prefix)) set.add(k) })
    return Array.from(set)
  },
  async readFile(path) {
    const s = load(); return s[norm(path)] ?? null
  },
  async writeFile(path, content) {
    const s = load(); s[norm(path)] = content; save(s)
  },
  async removeFile(path) {
    const s = load(); delete s[norm(path)]; save(s)
  },
  async ensureDir(_path) { return },
  async saveAsset(path, file) {
    const array = await file.arrayBuffer()
    const b64 = btoa(String.fromCharCode(...new Uint8Array(array)))
    const ext = file.name.split('.').pop() || 'bin'
    const dataUrl = `data:${file.type||'application/octet-stream'};base64,${b64}`
    const safe = path.replace(/\/$/,'') + '/' + Date.now() + '-' + file.name.replace(/[^a-z0-9_.-]+/gi,'_')
    await this.writeFile(safe, `ASSET:${ext}\n${dataUrl}`)
    return safe
  }
}
