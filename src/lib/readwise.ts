import { loadConfig } from './config'
import { getVaultAdapter } from './vault'

export async function importReadwise(){
  const cfg = await loadConfig()
  const token = cfg.integrations?.readwiseToken
  if (!token) throw new Error('Readwise token non configurato')
  let nextUrl: string | null = 'https://readwise.io/api/v2/export/'
  const va = getVaultAdapter()
  const created: string[] = []
  while (nextUrl){
    const res = await fetch(nextUrl, { headers: { Authorization: `Token ${token}` } })
    if (!res.ok) throw new Error('Errore Readwise: '+res.status)
    const data = await res.json()
    const rs = data?.results || []
    for (const r of rs){
      const id = `highlight-readwise-${r.id}`
      const body = `---\n type: highlight\n id: ${id}\n titolo: \n source_type: ${r.category||'web'}\n source: ${r.source_url||''}\n tags: []\n created_at: ${(r.highlighted_at||'').slice(0,10)}\n---\n\n${r.text||''}\n\n${r.note||''}`
      const path = `vault/highlights/${id}.md`
      await va.writeFile(path, body)
      created.push(path)
    }
    nextUrl = data?.next || null
  }
  return created
}
