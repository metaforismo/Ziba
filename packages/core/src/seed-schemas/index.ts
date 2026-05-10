// First-party seed schemas. Copied into `<vault>/.ziba/schema/` on
// first open of a fresh vault by the desktop bootstrap step. The user
// is free to edit, delete, or extend — these only seed an empty vault.
//
// Each schema is stored as a raw YAML string so the package stays
// `fs`-free; the desktop side writes the strings to disk at the path
// it owns. The strings are ALSO the source of truth for tests and
// for any future web build that doesn't have a filesystem.

export type SeedSchemaId = 'note' | 'person' | 'book' | 'project' | 'idea' | 'daily' | 'meeting';

export const SEED_SCHEMA_IDS: ReadonlyArray<SeedSchemaId> = [
  'note',
  'person',
  'book',
  'project',
  'idea',
  'daily',
  'meeting',
];

const NOTE_SCHEMA = `id: note
label: Nota
icon: 📝
color: "#71717a"
properties: {}
relations: {}
inverse:
  cited_by:
    reverse_of: cites
    label: Citato da
`;

const PERSON_SCHEMA = `id: person
label: Persona
icon: 👤
color: "#f97316"
properties:
  full_name:
    type: text
    label: Nome completo
  email:
    type: url
relations:
  works_at:
    target: project
    label: Lavora a
  knows:
    target: person
    multiple: true
    label: Conosce
inverse:
  authored:
    reverse_of: author
    label: Ha scritto
  attended:
    reverse_of: attended_by
    label: Ha partecipato a
`;

const BOOK_SCHEMA = `id: book
label: Libro
icon: 📖
color: "#6366f1"
properties:
  title:
    type: text
    required: true
  year:
    type: number
  isbn:
    type: text
relations:
  author:
    target: person
    label: Autore
  in_series:
    target: book
    label: Serie
inverse:
  cited_by:
    reverse_of: cites
    label: Citato da
`;

const PROJECT_SCHEMA = `id: project
label: Progetto
icon: 🚀
color: "#10b981"
properties:
  status:
    type: text
    label: Stato
  due:
    type: date
relations:
  owner:
    target: person
    label: Owner
  blocks:
    target: project
    multiple: true
    label: Blocca
  blocked_by:
    target: project
    multiple: true
    label: Bloccato da
inverse:
  works_on:
    reverse_of: works_at
    label: Persone coinvolte
`;

const IDEA_SCHEMA = `id: idea
label: Idea
icon: 💡
color: "#eab308"
properties: {}
relations:
  inspired_by:
    target: idea
    multiple: true
    label: Ispirata da
  related_to:
    target: idea
    multiple: true
    label: Correlata a
inverse:
  cited_by:
    reverse_of: cites
    label: Citata in
`;

const DAILY_SCHEMA = `id: daily
label: Daily
icon: 🗓️
color: "#06b6d4"
properties:
  date:
    type: date
    required: true
relations:
  worked_on:
    target: project
    multiple: true
    label: Lavorato su
  met_with:
    target: person
    multiple: true
    label: Incontrato
  read:
    target: book
    multiple: true
    label: Letto
inverse: {}
`;

const MEETING_SCHEMA = `id: meeting
label: Meeting
icon: 🤝
color: "#a855f7"
properties:
  date:
    type: date
    required: true
relations:
  attended_by:
    target: person
    multiple: true
    label: Partecipanti
  for_project:
    target: project
    label: Per il progetto
inverse:
  notes_about:
    reverse_of: outcome_of
    label: Output
`;

export const SEED_SCHEMAS: Record<SeedSchemaId, string> = {
  note: NOTE_SCHEMA,
  person: PERSON_SCHEMA,
  book: BOOK_SCHEMA,
  project: PROJECT_SCHEMA,
  idea: IDEA_SCHEMA,
  daily: DAILY_SCHEMA,
  meeting: MEETING_SCHEMA,
};
