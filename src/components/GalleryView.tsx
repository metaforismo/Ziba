import { Note } from '@/types'
import PreviewCard from './PreviewCard'

export default function GalleryView({ items }:{ items: Note[] }){
  return (
    <div className="grid gallery">
      {items.map(n=> <PreviewCard key={n.id} n={n}/>) }
    </div>
  )
}
