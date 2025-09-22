import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function YouTubeCard({ url }:{ url:string }){
  const id = (url.match(/v=([^&]+)/)?.[1] || url.match(/youtu\.be\/([^?]+)/)?.[1] || '').trim()
  const thumb = id? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ''
  return (
    <a href={url} target="_blank" rel="noreferrer" className="card" style={{display:'grid',gridTemplateColumns:'160px 1fr',gap:10,padding:8,textDecoration:'none',color:'inherit'}}>
      <div style={{width:160,height:90,background:'#101736',borderRadius:8,overflow:'hidden',border:'1px solid #1a234a'}}>{thumb && <img src={thumb} alt="thumb" style={{width:'100%',height:'100%',objectFit:'cover'}}/>}</div>
      <div>
        <div style={{fontWeight:600}}>YouTube</div>
        <div style={{color:'var(--muted)',fontSize:13}}>{url}</div>
      </div>
    </a>
  )
}

function LinkCard({ url }:{ url:string }){
  const u = new URL(url)
  return (
    <a href={url} target="_blank" rel="noreferrer" className="card" style={{display:'block',padding:8,textDecoration:'none',color:'inherit'}}>
      <div style={{fontWeight:600}}>{u.hostname}</div>
      <div style={{color:'var(--muted)',fontSize:13}}>{u.pathname}</div>
    </a>
  )
}

export default function MarkdownBody({ children }:{ children: string }){
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
      a({href,children}){
        const url = String(href||'')
        if (url.includes('youtube.com') || url.includes('youtu.be')) return <YouTubeCard url={url}/>
        return <LinkCard url={url}/>
      }
    }}>
      {children}
    </ReactMarkdown>
  )
}
