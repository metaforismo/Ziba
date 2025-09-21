import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '@/store'
import { parseNote, stringifyNote } from '@/lib/parsers'
import Editor from '@/components/Editor'
import PreviewCard from '@/components/PreviewCard'
import GraphView from '@/components/GraphView'
import { getVaultAdapter } from '@/lib/vault'

export default function NotePage({ mode }:{ mode?: 'graph'|'settings' }){
  const nav = useNavigate()
  if (mode==='graph') return (
    <div className="grid" style={{gap:16}}>
      <h1 style={{margin:0}}>Grafo</h1>
      <GraphView/>
    </div>
  )
  if (mode==='settings') return <Settings/>
  const { id='' } = useParams()
  const { findById, load, loaded, save, remove } = useApp()
  const base = findById(id)
  const [raw,setRaw] = useState(base? stringifyNote(base): '')
  const current = useMemo(()=> base? parseNote(base.path, raw) : null, [base,raw])

  useEffect(()=>{ if(!loaded) load() },[loaded])
  useEffect(()=>{ if(base) setRaw(stringifyNote(base)) },[base?.id])

  if (!base) return <div>Nota non trovata.</div>

  return (
    <div className="grid" style={{gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h1 style={{margin:0}}>{current?.title||base.title}</h1>
        <div className="toolbar">
          <label className="btn secondary" style={{display:'inline-flex',alignItems:'center',gap:8}}>
            <input type="file" accept="image/*" style={{display:'none'}} onChange={async e=>{
              const f = e.target.files?.[0]; if (!f || !current) return
              const p = await getVaultAdapter().saveAsset('assets', f)
              const meta = { ...current.meta, copertina: p }
              const n = { ...current, meta }
              setRaw(stringifyNote(n))
            }}/>
            Carica copertina
          </label>
          <button className="btn secondary" onClick={async()=>{ await remove(base.id); nav(-1) }}>Elimina</button>
          <button className="btn" onClick={async()=>{ if(!current) return; await save(current) }}>Salva</button>
        </div>
      </div>
      <div className="split">
        <Editor value={raw} onChange={setRaw}/>
        {current && <div className="card" style={{padding:12}}><PreviewCard n={current}/></div>}
      </div>
    </div>
  )
}

function Settings(){
  const [tmdb,setTmdb] = useState(localStorage.getItem('synapsium.tmdb')||'')
  const [yt,setYt] = useState(localStorage.getItem('synapsium.youtube')||'')
  const [brand,setBrand] = useState({ primary:get('--brand')||'#7c5cff', secondary:get('--brand-2')||'#00e0ff' })
  function get(v:string){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim() }
  useEffect(()=>{
    const r = document.documentElement.style
    r.setProperty('--brand', brand.primary)
    r.setProperty('--brand-2', brand.secondary)
  },[brand])
  return (
    <div className="grid" style={{gap:16}}>
      <h1 style={{margin:0}}>Impostazioni</h1>
      <div className="card" style={{padding:12,display:'grid',gap:12}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div>
            <h3>API</h3>
            <label>TMDB API Key<input value={tmdb} onChange={e=>setTmdb(e.target.value)} style={{width:'100%',marginTop:6}}/></label>
            <label style={{marginTop:8}}>YouTube API Key<input value={yt} onChange={e=>setYt(e.target.value)} style={{width:'100%',marginTop:6}}/></label>
            <div className="toolbar" style={{marginTop:12}}>
              <button className="btn" onClick={()=>{ localStorage.setItem('synapsium.tmdb',tmdb); localStorage.setItem('synapsium.youtube',yt) }}>Salva</button>
            </div>
          </div>
          <div>
            <h3>Tema</h3>
            <div style={{display:'flex',gap:12}}>
              <div>
                <div style={{fontSize:12,opacity:.7,marginBottom:4}}>Colore primario</div>
                <input type="color" value={brand.primary} onChange={e=>setBrand(b=>({...b,primary:e.target.value}))}/>
              </div>
              <div>
                <div style={{fontSize:12,opacity:.7,marginBottom:4}}>Colore secondario</div>
                <input type="color" value={brand.secondary} onChange={e=>setBrand(b=>({...b,secondary:e.target.value}))}/>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
