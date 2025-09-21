import { Note } from '@/types'

function getDate(n: Note){
  return n.meta.data_visto || n.meta.data_letto || n.meta.data_evento || n.meta.data_pubblicazione || ''
}

export default function TimelineView({ items }:{ items: Note[] }){
  const sorted = [...items].sort((a,b)=> String(getDate(b)).localeCompare(String(getDate(a))))
  return (
    <div className="card" style={{padding:12}}>
      {sorted.map(n=> (
        <div key={n.id} style={{display:'grid', gridTemplateColumns:'140px 1fr', gap:12, padding:'8px 0', borderBottom:'1px solid #1a234a'}}>
          <div style={{color:'var(--muted)'}}>{getDate(n)||'—'}</div>
          <div>
            <div style={{fontWeight:600}}>{n.title}</div>
            <div style={{color:'var(--muted)',fontSize:13}}>{n.type} · {n.meta.genere||n.meta.autore||n.meta.regista||''}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
