import { loadConfig } from './config'

async function callOpenRouter(prompt: string, system?: string){
  const cfg = await loadConfig()
  const key = cfg.ai?.openrouterKey
  const model = cfg.ai?.model || 'openrouter/auto'
  if (!key) throw new Error('OpenRouter API key non configurata')
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${key}` },
    body: JSON.stringify({ model, messages:[ ...(system?[{role:'system',content:system}]:[]), {role:'user',content:prompt}] })
  })
  const json = await res.json()
  const text = json.choices?.[0]?.message?.content || ''
  return text as string
}

export async function summarize(text: string){
  const sys = 'Sei un assistente che riassume testo in italiano in modo conciso e fedele. Rispondi con un paragrafo sintetico.'
  return callOpenRouter(text, sys)
}

export async function suggestLinks(context: { note: string; candidates: string[] }){
  const sys = 'Seleziona i titoli più pertinenti da collegare. Rispondi SOLO con una lista JSON di stringhe.'
  const prompt = `Nota:\n${context.note}\n\nCandidati:\n${context.candidates.join('\n')}\n\nRestituisci i titoli da collegare in JSON.`
  const out = await callOpenRouter(prompt, sys)
  try { return JSON.parse(out) as string[] } catch { return [] }
}

export async function askVault(question: string, contexts: { id:string; title:string; body:string }[]){
  const sys = 'Rispondi in italiano usando i contesti forniti. Se manca l\'informazione, dillo chiaramente.'
  const ctx = contexts.map(c=>`[${c.id}] ${c.title}\n${c.body}`).join('\n\n')
  const prompt = `Domanda: ${question}\n\nContesti:\n${ctx}\n\nRisposta:`
  return callOpenRouter(prompt, sys)
}
