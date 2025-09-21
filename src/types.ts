export type VaultPath = string

export type NoteMeta = Record<string, any>

export type Note = {
  id: string
  type: string
  path: VaultPath
  meta: NoteMeta
  title: string
  body: string
  links: string[]
  cover?: string
  tags: string[]
  dates: Record<string,string>
}

export type VaultFile = { path: VaultPath; content: string }

export type VaultAdapter = {
  readDir: (path: VaultPath) => Promise<VaultPath[]>
  readFile: (path: VaultPath) => Promise<string|null>
  writeFile: (path: VaultPath, content: string) => Promise<void>
  removeFile: (path: VaultPath) => Promise<void>
  ensureDir: (path: VaultPath) => Promise<void>
  saveAsset: (path: VaultPath, file: File) => Promise<VaultPath>
}

export type SchemaField = {
  key: string
  label: string
  type: 'string'|'number'|'date'|'enum'|'array'|'link'|'links'
  required?: boolean
  options?: string[]
}

export type CategorySchema = { type: string; label: string; icon: string; color: string; fields: SchemaField[] }
