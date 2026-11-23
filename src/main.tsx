import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

const App = lazy(() => import('./App'))
const ClientEdition = lazy(() => import('./ClientEdition').then(module => ({ default: module.ClientEdition })))

const edition = import.meta.env.VITE_APP_EDITION === 'client' ? 'client' : 'demo'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Suspense fallback={<main className="client-page"><p>Abriendo Torquex…</p></main>}>{edition === 'client' ? <ClientEdition /> : <App />}</Suspense></React.StrictMode>,
)
