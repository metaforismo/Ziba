import { useEffect, useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { autocompletion, Completion, CompletionSource } from '@codemirror/autocomplete'
import { useApp } from '@/store'
import { useSettings } from '@/store/settings'

export default function Editor({ value, onChange }:{ value:string; onChange:(v:string)=>void }){
  const notes = useApp(s=>s.notes)
  const tagLib = Array.from(new Set(notes.flatMap(n=>n.tags)))
  const cfgTags = useSettings(s=>s.config?.initialTags||[])

  const linkSrc = useMemo<CompletionSource>(()=>{
    const opts: Completion[] = notes.map(n=>({ label: `[[${n.title}]]`, type: 'text' }))
    return (ctx)=>{
      const before = ctx.state.sliceDoc(0, ctx.pos)
      const m = before.match(/\[\[[^\]]*$/)
      if (!m) return null
      return { from: ctx.pos - m[0].length, options: opts }
    }
  },[notes])

  const tagSrc = useMemo<CompletionSource>(()=>{
    const all = Array.from(new Set([...(cfgTags||[]), ...tagLib]))
    const opts: Completion[] = all.map(t=>({ label: `#${t}`, type: 'keyword' }))
    return (ctx)=>{
      const before = ctx.state.sliceDoc(0, ctx.pos)
      const m = before.match(/#[^\s#]*$/)
      if (!m) return null
      return { from: ctx.pos - m[0].length, options: opts }
    }
  },[tagLib,cfgTags])

  useEffect(()=>{},[])

  return (
    <div className="card" style={{padding:8}}>
      <CodeMirror height="60vh" theme={{
        variant: 'dark',
        settings: { background: '#0e142a', foreground:'#e9ecff', caret:'#7c5cff', selection:'#202a52' }
      }}
      value={value}
      onChange={onChange}
      extensions={[autocompletion({override:[linkSrc, tagSrc]})]}
      />
    </div>
  )
}
