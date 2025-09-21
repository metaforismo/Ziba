import { useEffect, useRef } from 'react'
import cytoscape, { Core } from 'cytoscape'
import dagre from 'cytoscape-dagre'
import { buildGraph } from '@/lib/graph'
import { useApp } from '@/store'

cytoscape.use(dagre)

export default function GraphView(){
  const ref = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core|null>(null)
  const notes = useApp(s=>s.notes)

  useEffect(()=>{
    if (!ref.current) return
    if (cyRef.current) { cyRef.current.destroy() }
    const g = buildGraph(notes)
    const cy = cytoscape({
      container: ref.current,
      style: [
        { selector:'node', style:{ 'label':'data(label)', 'background-color':'#7c5cff', 'color':'#dfe5ff', 'text-outline-color':'#0e142a', 'text-outline-width':2, 'font-size':12 } },
        { selector:'edge', style:{ 'width':1.5, 'line-color':'#3750a0', 'target-arrow-shape':'triangle', 'target-arrow-color':'#3750a0', 'curve-style':'bezier' } }
      ],
      elements: {
        nodes: g.nodes.map(n=>({ data:{ id:n.id, label:n.label, type:n.type } })),
        edges: g.edges.map(e=>({ data:{ id:e.id, source:e.source, target:e.target, label:e.label } }))
      }
    })
    cy.layout({ name:'dagre', nodeSep: 30, rankSep: 70 }).run()
    cyRef.current = cy
  },[notes])

  return <div className="card" style={{height:'70vh', padding:8}}><div ref={ref} style={{height:'100%', borderRadius:12, overflow:'hidden'}}/></div>
}
