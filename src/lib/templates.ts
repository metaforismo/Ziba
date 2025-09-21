export const templates: Record<string,string> = {
  film: `---
 type: film
 id: film-titolo-anno
 titolo: 
 titolo_originale: 
 anno: 
 regista: [[ ]]
 attori_principali:
  - [[ ]]
 genere: 
 voto: 
 data_visto: 
 piattaforma: 
 sinossi: ""
 copertina: 
 status: da_vedere
 tags: []
---
\n`,
  libro: `---
 type: libro
 id: libro-titolo-autore-anno
 titolo: 
 autore: [[ ]]
 anno: 
 editore: 
 isbn: 
 pagine: 
 genere: 
 voto: 
 data_letto: 
 formato: cartaceo
 status: da_leggere
 serie:
  titolo_serie: 
  numero_volume: 
 tags: []
---
\n`,
  serie_tv: `---
 type: serie_tv
 id: serie_tv-titolo-anno
 titolo: 
 anno: 
 regista: [[ ]]
 stagioni_totali: 
 episodi_visti: 
 stagione_attuale: 
 genere: 
 voto: 
 status: in_visione
 tags: []
---
\n`,
  video_youtube: `---
 type: video_youtube
 id: youtube-videoId
 titolo: 
 autore_canale: [[ ]]
 link: 
 data_pubblicazione: 
 data_visto: 
 durata: 
 argomenti: []
 status: da_vedere
---
\n`,
  live_event: `---
 type: live_event
 id: live-data-titolo
 titolo: 
 data_evento: 
 luogo: 
 artisti: []
 tipo_evento: 
 note_brevi: 
 tags: []
---
\n`,
  persona: `---
 type: persona
 id: persona-nome
 nome: 
 ruolo: 
 data_nascita: 
 bio_breve: 
 tags: []
---
\n`,
  idea: `---
 type: idea
 id: idea-titolo
 titolo: 
 tags: []
---
\n`
}
