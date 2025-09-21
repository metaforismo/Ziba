import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import './index.css'
import Home from './pages/Home'
import Category from './pages/Category'
import NotePage from './pages/Note'

function Shell() {
  return (
    <div>
      <header style={{position:'sticky',top:0,zIndex:40,background:'rgba(10,15,31,.7)',backdropFilter:'blur(8px)',borderBottom:'1px solid #1a2246'}}>
        <div className="container" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
          <Link to="/" className="brand" style={{textDecoration:'none',color:'inherit'}}>
            <span className="dot"/>
            <span>Synapsium</span>
          </Link>
          <nav style={{display:'flex',gap:12,alignItems:'center'}}>
            <Link to="/category/film" className="badge">🎬 Film</Link>
            <Link to="/category/libri" className="badge">📚 Libri</Link>
            <Link to="/category/serie_tv" className="badge">📺 Serie TV</Link>
            <Link to="/graph" className="badge">🕸️ Grafo</Link>
            <Link to="/settings" className="badge">⚙️ Impostazioni</Link>
          </nav>
        </div>
      </header>
      <main className="container" style={{paddingTop:24}}>
        <Routes>
          <Route path="/" element={<Home/>} />
          <Route path="/category/:type" element={<Category/>} />
          <Route path="/note/:id" element={<NotePage/>} />
          <Route path="/graph" element={<NotePage mode="graph"/>} />
          <Route path="/settings" element={<NotePage mode="settings"/>} />
          <Route path="*" element={<Navigate to="/" replace/>} />
        </Routes>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Shell/>
    </BrowserRouter>
  </React.StrictMode>
)
