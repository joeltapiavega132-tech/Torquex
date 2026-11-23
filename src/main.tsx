import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

const ClientEdition = lazy(() => import('./ClientEdition').then(module => ({ default: module.ClientEdition })))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Suspense fallback={<main className="client-page"><p>Abriendo Torquex…</p></main>}><ClientEdition /></Suspense></React.StrictMode>,
)
