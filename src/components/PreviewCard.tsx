import { Note } from '@/types'
import { Link } from 'react-router-dom'

function Stars({ v }:{ v?: string }){
  const n = v? (v.includes('/')? Number(v.split('/')[0]) : Number(v)) : 0
  return <span aria-label="voto">{'★★★★★'.slice(0,n)}<span style={{opacity:.25}}>{'★★★★★'.slice(n)}</span></span>
}

export default function PreviewCard({ n }:{ n: Note }){
  return (
    <Link to={`/note/${encodeURIComponent(n.id)}`} className="card" style={{display:'block', textDecoration:'none', color:'inherit'}}>
      <div style={{display:'grid', gridTemplateColumns:'120px 1fr', gap:12, padding:12}}>
        <div style={{width:120,height:160,background:'#121938',borderRadius:12,overflow:'hidden',display:'grid',placeItems:'center',border:'1px solid #1a234a'}}>
          {n.cover? <img src={n.cover} alt={n.title} style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <span className="badge">{n.type}</span>}
        </div>
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
            <h3 style={{margin:'4px 0'}}>{n.title}</h3>
            <span className="badge"><Stars v={String(n.meta.voto||'')}/></span>
          </div>
          <div style={{color:'var(--muted)',fontSize:14,display:'flex',gap:10,flexWrap:'wrap'}}>
            {n.meta.anno && <span>Anno: {n.meta.anno}</span>}
            {n.meta.genere && <span>Genere: {n.meta.genere}</span>}
            {n.meta.autore && <span>Autore: {String(n.meta.autore).replace(/\[\[|\]\]/g,'')}</span>}
            {n.meta.regista && <span>Regista: {String(n.meta.regista).replace(/\[\[|\]\]/g,'')}</span>}
          </div>
          <p style={{color:'#cbd3ee', marginTop:8, maxHeight:48, overflow:'hidden', textOverflow:'ellipsis'}}>{n.meta.sinossi||''}</p>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:8}}>
            {n.tags.map(t=> <span key={t} className="badge">#{t}</span>)}
          </div>
        </div>
      </div>
    </Link>
  )
}
