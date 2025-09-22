import { create } from 'zustand'
import type { SynapsiumConfig } from '@/lib/config'
import { loadConfig, saveConfig } from '@/lib/config'

export const useSettings = create<{
  config: SynapsiumConfig | null
  load: () => Promise<void>
  setConfig: (c: SynapsiumConfig) => Promise<void>
}>((set)=>({
  config: null,
  load: async () => {
    const cfg = await loadConfig()
    set({ config: cfg })
  },
  setConfig: async (c) => {
    await saveConfig(c)
    set({ config: c })
  }
}))
