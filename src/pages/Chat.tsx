import { useEffect, useMemo, useState } from 'react'
import { useApp } from '@/store'
import { askVault } from '@/lib/ai'

function rank(query: string, text: string){
  const q = query.toLowerCase().split(/\W+/).filter(Boolean)
  const t = text.toLowerCase()
  return q.map(w=> t.includes(w) ? 1 : 0).reduce((a,b)=>a+b,0)
}

export default function Chat(){
  const { notes, load, loaded } = useApp()
  const [q,setQ] = useState('')
  const [a,setA] = useState('')
  useEffect(()=>{ if(!loaded) load() },[loaded])

  async function ask(){
    const scored = notes.map(n=>({ n, s: rank(q, n.title + ' ' + n.body) }))
    const top = scored.sort((a,b)=>b.s-a.s).slice(0,5).map(x=>({ id:x.n.id, title:x.n.title, body:x.n.body }))
    const res = await askVault(q, top)
    setA(res)
  }

  return (
    <div className="grid" style={{gap:12}}>
      <h1 style={{margin:0}}>Chat con il tuo Vault</h1>
      <div className="toolbar">
        <input placeholder="Fai una domanda…" value={q} onChange={e=>setQ(e.target.value)} style={{width:'100%'}}/>
        <button className="btn" onClick={ask}>Chiedi</button>
      </div>
      {a && <div className="card" style={{padding:12,whiteSpace:'pre-wrap'}}>{a}</div>}
    </div>
  )
}
