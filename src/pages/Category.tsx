import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useApp } from '@/store'
import GalleryView from '@/components/GalleryView'
import TableView from '@/components/TableView'

export default function Category(){
  const { type = '' } = useParams()
  const { notes, load, loaded } = useApp()
  const [view,setView] = useState<'gallery'|'table'>('gallery')
  const [q,setQ] = useState('')
  useEffect(()=>{ if(!loaded) load() },[loaded])

  const items = useMemo(()=> notes.filter(n=>n.type===type).filter(n=> n.title.toLowerCase().includes(q.toLowerCase())),[notes,type,q])

  return (
    <div className="grid" style={{gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h1 style={{margin:0,textTransform:'capitalize'}}>{type.replace('_',' ')}</h1>
        <div className="toolbar">
          <input placeholder="Cerca..." value={q} onChange={e=>setQ(e.target.value)} />
          <button className="btn secondary" onClick={()=>setView(v=>v==='gallery'?'table':'gallery')}>{view==='gallery'?'Tabella':'Gallery'}</button>
        </div>
      </div>
      {view==='gallery'? <GalleryView items={items}/> : <TableView items={items}/>}
    </div>
  )
}
