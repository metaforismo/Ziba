import { useEffect, useMemo, useState } from 'react'
import { useSettings } from '@/store/settings'
import type { SynapsiumConfig, TypeVisual, EdgeRule } from '@/lib/config'

function Section({ title, children }:{ title:string; children:any }){
  return (
    <section className="card" style={{padding:12, display:'grid', gap:12}}>
      <h3 style={{margin:'4px 0'}}>{title}</h3>
      {children}
    </section>
  )
}

export default function SettingsPage(){
  const { config, load, setConfig } = useSettings()
  const [tab,setTab] = useState<'brand'|'api'|'schema'|'graph'|'tags'|'integrations'>('brand')

  useEffect(()=>{ if(!config) load() },[config])

  if (!config) return <div>Caricamento impostazioni…</div>

  return (
    <div className="grid" style={{gap:16}}>
      <h1 style={{margin:0}}>Impostazioni</h1>
      <div className="toolbar">
        <button className={`btn ${tab==='brand'?'':'secondary'}`} onClick={()=>setTab('brand')}>Tema</button>
        <button className={`btn ${tab==='api'?'':'secondary'}`} onClick={()=>setTab('api')}>AI</button>
        <button className={`btn ${tab==='schema'?'':'secondary'}`} onClick={()=>setTab('schema')}>Schemi</button>
        <button className={`btn ${tab==='graph'?'':'secondary'}`} onClick={()=>setTab('graph')}>Grafo</button>
        <button className={`btn ${tab==='tags'?'':'secondary'}`} onClick={()=>setTab('tags')}>Tag</button>
        <button className={`btn ${tab==='integrations'?'':'secondary'}`} onClick={()=>setTab('integrations')}>Readwise</button>
      </div>

      {tab==='brand' && <Brand/>}
      {tab==='api' && <AISettings/>}
      {tab==='schema' && <SchemaEditor/>}
      {tab==='graph' && <GraphConfig/>}
      {tab==='tags' && <TagsConfig/>}
      {tab==='integrations' && <ReadwiseConfig/>}
    </div>
  )
}

function Brand(){
  const [brand,setBrand] = useState({ primary:get('--brand')||'#7c5cff', secondary:get('--brand-2')||'#00e0ff' })
  function get(v:string){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim() }
  useEffect(()=>{
    const r = document.documentElement.style
    r.setProperty('--brand', brand.primary)
    r.setProperty('--brand-2', brand.secondary)
  },[brand])
  return (
    <Section title="Tema">
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
    </Section>
  )
}

function AISettings(){
  const { config, setConfig } = useSettings()
  const [key,setKey] = useState(config?.ai?.openrouterKey||'')
  const [model,setModel] = useState(config?.ai?.model||'openrouter/auto')
  return (
    <Section title="AI (OpenRouter)">
      <label>API Key<input value={key} onChange={e=>setKey(e.target.value)} style={{width:'100%',marginTop:6}}/></label>
      <label style={{marginTop:8}}>Modello<input value={model} onChange={e=>setModel(e.target.value)} style={{width:'100%',marginTop:6}}/></label>
      <div className="toolbar" style={{marginTop:12}}>
        <button className="btn" onClick={()=> setConfig({ ...config!, ai:{ ...(config!.ai||{}), openrouterKey:key, model } })}>Salva</button>
      </div>
    </Section>
  )
}

function SchemaEditor(){
  const { config, setConfig } = useSettings()
  const [json,setJson] = useState(JSON.stringify(config?.types, null, 2))
  return (
    <Section title="Schemi (tipi e campi)">
      <div style={{fontSize:13,opacity:.7}}>Modifica la lista di tipi e campi. Dev’essere JSON valido.</div>
      <textarea style={{width:'100%',height:300}} value={json} onChange={e=>setJson(e.target.value)}/>
      <div className="toolbar"><button className="btn" onClick={()=>{
        try{
          const parsed = JSON.parse(json)
          setConfig({ ...config!, types: parsed })
        }catch{}
      }}>Salva</button></div>
    </Section>
  )
}

function GraphConfig(){
  const { config, setConfig } = useSettings()
  const [visuals,setVisuals] = useState<TypeVisual[]>(config?.typeVisuals||[])
  const [rules,setRules] = useState<EdgeRule[]>(config?.edgeRules||[])
  useEffect(()=>{ setVisuals(config?.typeVisuals||[]); setRules(config?.edgeRules||[]) },[config])
  return (
    <Section title="Grafo (icone, colori, etichette)">
      <div>
        <h4>Tipi</h4>
        {visuals.map((v,i)=>(
          <div key={v.type} style={{display:'grid',gridTemplateColumns:'160px 80px 120px 1fr',gap:8,alignItems:'center',marginBottom:6}}>
            <div>{v.type}</div>
            <input value={v.icon} onChange={e=>{ const a=[...visuals]; a[i]={...v,icon:e.target.value}; setVisuals(a) }} />
            <input type="color" value={v.color} onChange={e=>{ const a=[...visuals]; a[i]={...v,color:e.target.value}; setVisuals(a) }} />
            <div className="badge">{v.icon} {v.color}</div>
          </div>
        ))}
      </div>
      <div>
        <h4>Regole etichette connessioni</h4>
        {rules.map((r,i)=>(
          <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:6}}>
            <input value={r.key} onChange={e=>{ const a=[...rules]; a[i]={...r,key:e.target.value}; setRules(a) }} placeholder="campo YAML (es. regista)"/>
            <input value={r.label} onChange={e=>{ const a=[...rules]; a[i]={...r,label:e.target.value}; setRules(a) }} placeholder="etichetta (es. diretto da)"/>
          </div>
        ))}
        <button className="btn secondary" onClick={()=>setRules([...rules,{key:'',label:''}])}>+ Aggiungi regola</button>
      </div>
      <div className="toolbar"><button className="btn" onClick={()=> setConfig({ ...config!, typeVisuals:visuals, edgeRules:rules })}>Salva</button></div>
    </Section>
  )
}

function TagsConfig(){
  const { config, setConfig } = useSettings()
  const [tags,setTags] = useState((config?.initialTags||[]).join(', '))
  return (
    <Section title="Tag iniziali suggeriti">
      <input value={tags} onChange={e=>setTags(e.target.value)} />
      <div className="toolbar"><button className="btn" onClick={()=> setConfig({ ...config!, initialTags: tags.split(',').map(s=>s.trim()).filter(Boolean) })}>Salva</button></div>
    </Section>
  )
}

function ReadwiseConfig(){
  const { config, setConfig } = useSettings()
  const [token,setToken] = useState(config?.integrations?.readwiseToken||'')
  return (
    <Section title="Readwise">
      <label>API Token<input value={token} onChange={e=>setToken(e.target.value)} style={{width:'100%',marginTop:6}}/></label>
      <div className="toolbar" style={{marginTop:12}}>
        <button className="btn" onClick={()=> setConfig({ ...config!, integrations:{ ...(config!.integrations||{}), readwiseToken: token } })}>Salva</button>
      </div>
    </Section>
  )
}
