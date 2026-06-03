# SiYuan Reference Notes

SiYuan is a useful product reference for Ziba's graph and database direction.
These notes document the user-facing patterns we studied and how they map to
Ziba. They are design notes, not copied implementation: SiYuan is AGPL, while
Ziba is MIT, so Ziba should keep its own independently written code and data
model.

## Sources Reviewed

- `siyuan-note/siyuan` `kernel/conf/graph.go`: persisted graph settings such
  as `minRefs`, `dailyNote`, type filters, arrows, line opacity, node size,
  collision, center strength, and link distance.
- `siyuan-note/siyuan` `app/src/layout/dock/Graph.ts`: global/local graph
  panel controls, refresh/search/fullscreen affordances, and incremental
  vis-network rendering.
- `siyuan-note/siyuan` `kernel/av/av.go`: Attribute View structure: multiple
  views, filters, sorts, page size, table/gallery/kanban layouts, relation
  fields, rollups, and grouping.

## Mapping to Ziba

| SiYuan pattern | Ziba implementation |
|---|---|
| `minRefs` hides weakly connected global-graph blocks | `GraphQueryFilters.minDegree` hides notes below a minimum connection threshold |
| D3 graph knobs are exposed directly | Ziba keeps sliders for forces/display and adds presets that apply query, display, and forces together |
| Local/global graph views are navigational, not decorative | Ziba's node detail panel now lists nearby nodes so selection becomes a navigation path |
| Attribute View `pageSize` is explicit | DatabaseView now exposes a row limit selector tied to `DatabaseQuery.limit` |
| Attribute Views support multiple layouts | Ziba already supports table, board, and calendar; saved named views remain future work |

## Follow-Ups

- Saved database views with name, icon, layout, filters, sorts, group, and row
  limit.
- Local graph mode scoped to the current note with configurable traversal
  depth.
- Relation and rollup fields in DatabaseView, using Ziba's typed relations
  table rather than importing SiYuan's Attribute View storage.
- Progressive graph rendering for very large vaults, inspired by SiYuan's
  batched network population but implemented in Ziba's SVG/React model.
