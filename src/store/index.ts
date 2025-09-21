import { create } from 'zustand'
import { getVaultAdapter, seedIfEmpty } from '@/lib/vault'
import { parseNote, stringifyNote } from '@/lib/parsers'
import type { Note } from '@/types'

async function loadAllNotes(): Promise<Note[]> {
  const va = getVaultAdapter()
  const files = await va.readDir('vault')
  const md = files.filter(p=>p.endsWith('.md'))
  const out: Note[] = []
  for (const p of md){
    const c = await va.readFile(p)
    if (c) out.push(parseNote(p,c))
  }
  return out
}

export const useApp = create<{
  notes: Note[]
  loaded: boolean
  load: () => Promise<void>
  createFromTemplate: (type: string) => Promise<Note>
  save: (note: Note) => Promise<void>
  remove: (id: string) => Promise<void>
  findById: (id: string) => Note | undefined
}>((set,get)=>({
  notes: [],
  loaded: false,
  load: async () => {
    await seedIfEmpty()
    const notes = await loadAllNotes()
    set({ notes, loaded:true })
  },
  createFromTemplate: async (type: string) => {
    const body = `---\n type: ${type}\n id: ${type}-nuovo\n titolo: Nuovo ${type}\n---\n\n`
    const path = `vault/${type}/${Date.now()}.md`
    await getVaultAdapter().writeFile(path, body)
    const n = parseNote(path, body)
    set({ notes: [n, ...get().notes] })
    return n
  },
  save: async (note: Note) => {
    await getVaultAdapter().writeFile(note.path, stringifyNote(note))
    const arr = get().notes.map(n=> n.id===note.id ? note : n)
    set({ notes: arr })
  },
  remove: async (id: string) => {
    const n = get().notes.find(x=>x.id===id); if(!n) return
    await getVaultAdapter().removeFile(n.path)
    set({ notes: get().notes.filter(x=>x.id!==id) })
  },
  findById: (id: string) => get().notes.find(n=>n.id===id)
}))
