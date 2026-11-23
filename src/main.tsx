import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ClientEdition } from './ClientEdition'
import './styles.css'

const edition = import.meta.env.VITE_APP_EDITION === 'client' ? 'client' : 'demo'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{edition === 'client' ? <ClientEdition /> : <App />}</React.StrictMode>,
)
