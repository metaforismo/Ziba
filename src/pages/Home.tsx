import { useEffect, useMemo, useState } from 'react'
import { useApp } from '@/store'
import GalleryView from '@/components/GalleryView'
import TimelineView from '@/components/TimelineView'

export default function Home(){
  const { load, loaded, notes, createFromTemplate } = useApp()
  const [view,setView] = useState<'gallery'|'timeline'>('gallery')

  useEffect(()=>{ if(!loaded) load() },[loaded])

  const watching = useMemo(()=> notes.filter(n=>['in_visione','in_lettura'].includes(String(n.meta.status||''))),[notes])
  const backlog = useMemo(()=> notes.filter(n=>['da_vedere','da_leggere'].includes(String(n.meta.status||''))),[notes])
  const recent = useMemo(()=> notes.slice(0,12),[notes])

  return (
    <div className="grid" style={{gap:24}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div className="brand"><span className="dot"/><h1 style={{margin:0}}>Synapsium</h1></div>
        <div className="toolbar">
          <button className="btn" onClick={()=>createFromTemplate('film')}>+ Film</button>
          <button className="btn" onClick={()=>createFromTemplate('libro')}>+ Libro</button>
          <button className="btn" onClick={()=>createFromTemplate('idea')}>+ Idea</button>
          <button className="btn secondary" onClick={()=>setView(v=>v==='gallery'?'timeline':'gallery')}>{view==='gallery'?'Timeline':'Gallery'}</button>
        </div>
      </div>

      <section className="grid" style={{gap:12}}>
        <h2 style={{margin:'6px 0'}}>In visione/lettura</h2>
        {view==='gallery'? <GalleryView items={watching}/> : <TimelineView items={watching}/>}        
      </section>

      <section className="grid" style={{gap:12}}>
        <h2 style={{margin:'6px 0'}}>Da vedere/leggere</h2>
        {view==='gallery'? <GalleryView items={backlog}/> : <TimelineView items={backlog}/>}        
      </section>

      <section className="grid" style={{gap:12}}>
        <h2 style={{margin:'6px 0'}}>Ultimi aggiunti</h2>
        {view==='gallery'? <GalleryView items={recent}/> : <TimelineView items={recent}/>}        
      </section>
    </div>
  )
}
