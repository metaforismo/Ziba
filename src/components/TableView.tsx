import { useMemo, useState } from 'react'
import { Note } from '@/types'

export default function TableView({ items }:{ items: Note[] }){
  const [q,setQ] = useState('')
  const data = useMemo(()=>{
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter(n=> n.title.toLowerCase().includes(s) || (n.tags||[]).some(t=>t.toLowerCase().includes(s)))
  },[items,q])

  return (
    <div className="card" style={{padding:12}}>
      <div className="toolbar" style={{marginBottom:8}}>
        <input placeholder="Filtra..." value={q} onChange={e=>setQ(e.target.value)} style={{width:'100%'}}/>
      </div>
      <table className="table">
        <thead>
          <tr><th>Titolo</th><th>Tipo</th><th>Anno</th><th>Voto</th><th>Tag</th></tr>
        </thead>
        <tbody>
          {data.map(n=> (
            <tr key={n.id}>
              <td>{n.title}</td>
              <td>{n.type}</td>
              <td>{n.meta.anno||''}</td>
              <td>{n.meta.voto||''}</td>
              <td>{(n.tags||[]).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
