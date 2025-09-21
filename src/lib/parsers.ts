import matter from 'gray-matter'
import yaml from 'js-yaml'
import { Note } from '@/types'

export function extractLinks(text: string): string[] {
  const m = text.match(/\[\[([^\]]+)\]\]/g) || []
  return m.map(s=>s.slice(2,-2).trim()).filter(Boolean)
}

export function normalizeId(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9-_]+/g,'-').replace(/--+/g,'-').replace(/^-+|-+$/g,'')
}

export function parseNote(path: string, content: string): Note {
  const fm = matter(content, { engines: { yaml: s => yaml.load(s) as any } })
  const meta = (fm.data||{}) as Record<string,any>
  const type = String(meta.type||'nota')
  const title = String(meta.titolo||meta.title||meta.nome||meta.name||'Senza titolo')
  const id = String(meta.id || `${type}-${normalizeId(title)}-${normalizeId(String(meta.anno||meta.year||''))}`)
  const links = extractLinks(fm.content)
  const tags: string[] = Array.isArray(meta.tags)? meta.tags.map(String): []
  const cover = meta.copertina || meta.cover || undefined
  const dates: Record<string,string> = {}
  for (const k of Object.keys(meta)) if (/data_|date/.test(k)) dates[k]=String(meta[k])
  return { id, type, path, meta, title, body: fm.content.trim(), links, cover, tags, dates }
}

export function stringifyNote(note: Note): string {
  const { meta, body } = note
  const fm = matter.stringify(body||'', meta)
  return fm
}
