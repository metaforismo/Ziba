import type { CategorySchema } from '@/types'
import { getVaultAdapter } from './vault'

export type EdgeRule = { key: string; label: string }
export type TypeVisual = { type: string; icon: string; color: string }
export type SynapsiumConfig = {
  initialTags: string[]
  types: CategorySchema[]
  typeVisuals: TypeVisual[]
  edgeRules: EdgeRule[]
  ai?: { openrouterKey?: string; model?: string }
  integrations?: { readwiseToken?: string }
}

const defaultTypes: CategorySchema[] = [
  { type:'film', label:'Film', icon:'🎬', color:'#4da3ff', fields:[{key:'titolo',label:'Titolo',type:'string',required:true}] },
  { type:'libro', label:'Libro', icon:'📚', color:'#39d98a', fields:[{key:'titolo',label:'Titolo',type:'string',required:true}] },
  { type:'serie_tv', label:'Serie TV', icon:'📺', color:'#ffd248', fields:[{key:'titolo',label:'Titolo',type:'string',required:true}] },
  { type:'video_youtube', label:'YouTube', icon:'📹', color:'#ff5f5f', fields:[{key:'titolo',label:'Titolo',type:'string',required:true}] },
  { type:'live_event', label:'Live', icon:'🎤', color:'#b46bff', fields:[{key:'titolo',label:'Titolo',type:'string',required:true}] },
  { type:'persona', label:'Persona', icon:'👤', color:'#ff9a3b', fields:[{key:'nome',label:'Nome',type:'string',required:true}] },
  { type:'idea', label:'Idea', icon:'💡', color:'#95a0b8', fields:[{key:'titolo',label:'Titolo',type:'string',required:true}] },
  { type:'highlight', label:'Highlight', icon:'✨', color:'#9aa5ff', fields:[
    {key:'source_type',label:'Sorgente',type:'enum',options:['pdf','web','libro','tweet','altro']},
    {key:'source',label:'Fonte',type:'string'},
    {key:'tags',label:'Tag',type:'array'},
    {key:'created_at',label:'Creato',type:'date'}
  ]}
]

const defaultVisuals: TypeVisual[] = defaultTypes.map(t=>({ type:t.type, icon:t.icon, color:t.color }))

const defaultEdgeRules: EdgeRule[] = [
  { key:'regista', label:'diretto da' },
  { key:'autore', label:'scritto da' },
  { key:'attori_principali', label:'interpretato da' },
  { key:'serie', label:'parte di' }
]

const defaultConfig: SynapsiumConfig = {
  initialTags: ['da_vedere','in_visione','visto','da_leggere','in_lettura','letto'],
  types: defaultTypes,
  typeVisuals: defaultVisuals,
  edgeRules: defaultEdgeRules,
  ai: { model: 'openrouter/auto' },
  integrations: {}
}

let cache: SynapsiumConfig | null = null

export async function loadConfig(): Promise<SynapsiumConfig> {
  if (cache) return cache
  const va = getVaultAdapter()
  const raw = await va.readFile('vault/config/synapsium.config.json')
  if (!raw) { cache = defaultConfig; return cache }
  try {
    const obj = JSON.parse(raw)
    cache = mergeConfig(defaultConfig, obj)
    return cache
  } catch {
    cache = defaultConfig
    return cache
  }
}

export async function saveConfig(cfg: SynapsiumConfig){
  const va = getVaultAdapter()
  await va.ensureDir('vault/config')
  await va.writeFile('vault/config/synapsium.config.json', JSON.stringify(cfg, null, 2))
  cache = cfg
}

function mergeConfig(base: SynapsiumConfig, extra: Partial<SynapsiumConfig>): SynapsiumConfig {
  return {
    initialTags: extra.initialTags ?? base.initialTags,
    types: extra.types ?? base.types,
    typeVisuals: extra.typeVisuals ?? base.typeVisuals,
    edgeRules: extra.edgeRules ?? base.edgeRules,
    ai: { ...base.ai, ...(extra.ai||{}) },
    integrations: { ...base.integrations, ...(extra.integrations||{}) }
  }
}
