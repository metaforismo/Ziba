import { useEffect, useMemo, useState } from 'react'
import { useApp } from '@/store'
import { getVaultAdapter } from '@/lib/vault'
import { parseNote } from '@/lib/parsers'

export default function Highlights(){
  const { notes, load, loaded } = useApp()
  const [q,setQ] = useState('')
  useEffect(()=>{ if(!loaded) load() },[loaded])

  const items = useMemo(()=> notes.filter(n=>n.type==='highlight').filter(n=> n.title.toLowerCase().includes(q.toLowerCase()) || n.body.toLowerCase().includes(q.toLowerCase())),[notes,q])

  return (
    <div className="grid" style={{gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h1 style={{margin:0}}>Highlights</h1>
        <div className="toolbar">
          <input placeholder="Cerca…" value={q} onChange={e=>setQ(e.target.value)} />
          <button className="btn secondary" onClick={async()=>{ try{ const { importReadwise } = await import('@/lib/readwise'); await importReadwise(); await load() }catch{} }}>Importa Readwise</button>
          <QuickCapture/>
        </div>
      </div>
      <div className="card" style={{padding:12}}>
        {items.map(n=> (
          <div key={n.id} style={{borderBottom:'1px solid #1a234a',padding:'10px 0'}}>
            <div style={{fontWeight:600}}>{n.title||'Highlight'}</div>
            <div style={{color:'var(--muted)',fontSize:13}}>{n.meta.source_type||''} · {n.meta.source||''} · {n.meta.created_at||''}</div>
            <div style={{marginTop:6}}>{n.body}</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:8}}>
              {(n.tags||[]).map((t:string)=> <span key={t} className="badge">#{t}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function QuickCapture(){
  const [open,setOpen] = useState(false)
  const [text,setText] = useState('')
  const [source,setSource] = useState('')
  const [tags,setTags] = useState('')
  const { load } = useApp()
  async function save(){
    const body = `---\n type: highlight\n id: highlight-${Date.now()}\n titolo: \n source_type: web\n source: ${source}\n tags: [${tags.split(',').map(s=>s.trim()).filter(Boolean).map(s=>`"${s}"`).join(', ')}]\n created_at: ${new Date().toISOString().slice(0,10)}\n---\n\n${text}`
    const path = `vault/highlights/${Date.now()}.md`
    await getVaultAdapter().writeFile(path, body)
    setOpen(false); setText(''); setSource(''); setTags(''); await load()
  }
  return (
    <>
      <button className="btn" onClick={()=>setOpen(true)}>+ Cattura</button>
      {open && (
        <div className="card" style={{position:'fixed',inset:'20% 10%',padding:16,zIndex:100}}>
          <h3 style={{marginTop:0}}>Quick Capture</h3>
          <textarea style={{width:'100%',height:150}} placeholder="Testo dell'highlight" value={text} onChange={e=>setText(e.target.value)} />
          <input style={{width:'100%',marginTop:8}} placeholder="Fonte (URL o riferimento)" value={source} onChange={e=>setSource(e.target.value)} />
          <input style={{width:'100%',marginTop:8}} placeholder="Tag (separati da virgola)" value={tags} onChange={e=>setTags(e.target.value)} />
          <div className="toolbar" style={{marginTop:10}}>
            <button className="btn secondary" onClick={()=>setOpen(false)}>Annulla</button>
            <button className="btn" onClick={save}>Salva</button>
          </div>
        </div>
      )}
    </>
  )
}
