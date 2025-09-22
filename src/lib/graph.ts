import { Note } from '@/types'

type Graph = { nodes: {id:string,label:string,type:string}[]; edges: {id:string,source:string,target:string,label?:string}[] }

import { loadConfig } from './config'

export async function buildGraphAsync(notes: Note[]): Promise<Graph> {
  const cfg = await loadConfig()
  const labelMap: Record<string,string> = Object.fromEntries((cfg.edgeRules||[]).map(r=>[r.key,r.label]))
  const nodes = notes.map(n=>({ id:n.id, label:n.title, type:n.type }))
  const edges: Graph['edges'] = []
  const index = Object.fromEntries(notes.map(n=>[n.title.toLowerCase(), n.id]))
  for (const n of notes){
    for (const l of n.links){
      const t = index[l.toLowerCase()]
      if (t) edges.push({ id: `${n.id}->${t}`, source: n.id, target: t })
    }
    for (const [k,v] of Object.entries(n.meta)){
      if (typeof v==='string' && v.startsWith('[[')){
        const l = v.replace(/\[\[|\]\]/g,'').trim().toLowerCase()
        const t = index[l]; if (t) edges.push({ id:`${n.id}:${k}->${t}`, source:n.id, target:t, label:labelMap[k]||k })
      }
      if (Array.isArray(v)){
        for (const item of v){
          if (typeof item==='string' && item.startsWith('[[')){
            const l = item.replace(/\[\[|\]\]/g,'').trim().toLowerCase()
            const t = index[l]; if (t) edges.push({ id:`${n.id}:${k}->${t}`, source:n.id, target:t, label:labelMap[k]||k })
          }
        }
      }
    }
  }
  return { nodes, edges }
}
