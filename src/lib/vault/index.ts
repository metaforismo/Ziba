import { browserVault } from './adapters/browser'
import type { VaultAdapter } from '@/types'

let active: VaultAdapter = browserVault

export function setVaultAdapter(a: VaultAdapter){ active = a }
export function getVaultAdapter(){ return active }

export async function seedIfEmpty(){
  const files = await active.readDir('vault')
  if (files.length>0) return
  const welcome = `---\n type: idea\n id: idea-benvenuto\n titolo: Benvenuto su Synapsium\n tags: [synapsium]\n---\n\nQuesta è una nota di esempio. Prova a creare un [[film]] o un [[libro]].`
  await active.writeFile('vault/idee_concetti/benvenuto.md', welcome)
}
