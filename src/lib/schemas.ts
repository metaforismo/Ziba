import { CategorySchema } from '@/types'

export const schemas: CategorySchema[] = [
  { type:'film', label:'Film', icon:'🎬', color:'#4da3ff', fields:[
    {key:'titolo',label:'Titolo',type:'string',required:true},
    {key:'titolo_originale',label:'Titolo originale',type:'string'},
    {key:'anno',label:'Anno',type:'number'},
    {key:'regista',label:'Regista',type:'link'},
    {key:'attori_principali',label:'Attori',type:'links'},
    {key:'genere',label:'Genere',type:'string'},
    {key:'voto',label:'Voto',type:'string'},
    {key:'data_visto',label:'Data visto',type:'date'},
    {key:'piattaforma',label:'Piattaforma',type:'string'},
    {key:'copertina',label:'Copertina',type:'string'},
    {key:'status',label:'Stato',type:'enum',options:['da_vedere','in_visione','visto','abbandonato']},
    {key:'tags',label:'Tag',type:'array'}
  ]},
  { type:'libro', label:'Libro', icon:'📚', color:'#39d98a', fields:[
    {key:'titolo',label:'Titolo',type:'string',required:true},
    {key:'autore',label:'Autore',type:'link'},
    {key:'anno',label:'Anno',type:'number'},
    {key:'editore',label:'Editore',type:'string'},
    {key:'isbn',label:'ISBN',type:'string'},
    {key:'pagine',label:'Pagine',type:'number'},
    {key:'genere',label:'Genere',type:'string'},
    {key:'voto',label:'Voto',type:'string'},
    {key:'data_letto',label:'Data letto',type:'date'},
    {key:'formato',label:'Formato',type:'enum',options:['cartaceo','ebook','audiolibro']},
    {key:'status',label:'Stato',type:'enum',options:['da_leggere','in_lettura','letto','abbandonato']},
    {key:'tags',label:'Tag',type:'array'}
  ]},
  { type:'serie_tv', label:'Serie TV', icon:'📺', color:'#ffd248', fields:[
    {key:'titolo',label:'Titolo',type:'string',required:true}
  ]},
  { type:'video_youtube', label:'YouTube', icon:'📹', color:'#ff5f5f', fields:[
    {key:'titolo',label:'Titolo',type:'string',required:true}
  ]},
  { type:'live_event', label:'Live', icon:'🎤', color:'#b46bff', fields:[
    {key:'titolo',label:'Titolo',type:'string',required:true}
  ]},
  { type:'persona', label:'Persona', icon:'👤', color:'#ff9a3b', fields:[
    {key:'nome',label:'Nome',type:'string',required:true}
  ]},
  { type:'idea', label:'Idea', icon:'💡', color:'#95a0b8', fields:[
    {key:'titolo',label:'Titolo',type:'string',required:true}
  ]}
]

export const schemaByType = Object.fromEntries(schemas.map(s=>[s.type,s])) as Record<string,CategorySchema>
