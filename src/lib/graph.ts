import { Note } from '@/types'

type Graph = { nodes: {id:string,label:string,type:string}[]; edges: {id:string,source:string,target:string,label?:string}[] }

export function buildGraph(notes: Note[]): Graph {
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
        const t = index[l]; if (t) edges.push({ id:`${n.id}:${k}->${t}`, source:n.id, target:t, label:k })
      }
      if (Array.isArray(v)){
        for (const item of v){
          if (typeof item==='string' && item.startsWith('[[')){
            const l = item.replace(/\[\[|\]\]/g,'').trim().toLowerCase()
            const t = index[l]; if (t) edges.push({ id:`${n.id}:${k}->${t}`, source:n.id, target:t, label:k })
          }
        }
      }
    }
  }
  return { nodes, edges }
}
