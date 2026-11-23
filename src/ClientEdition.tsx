import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

type Connection = 'checking' | 'ready' | 'unavailable'

export function ClientEdition() {
  const [connection, setConnection] = useState<Connection>('checking')
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY

  useEffect(() => {
    if (!url || !key) { setConnection('unavailable'); return }
    const client = createClient(url, key)
    client.from('profiles').select('user_id', { head: true, count: 'exact' }).limit(0)
      .then(({ error }) => setConnection(error ? 'unavailable' : 'ready'))
  }, [url, key])

  return <main style={{ minHeight: '100vh', background: '#f5f7f8', display: 'grid', placeItems: 'center', padding: 24, color: '#354348', fontFamily: 'Arial, sans-serif' }}>
    <section style={{ width: 'min(100%, 520px)', background: '#fff', border: '1px solid #dce4e8', borderRadius: 16, padding: 32, boxShadow: '0 16px 36px #35434812' }}>
      <div style={{ color: '#1973BA', fontWeight: 800, letterSpacing: '.12em', fontSize: 12 }}>TORQUEX · V2.1</div>
      <h1 style={{ marginBottom: 8 }}>Preparando el acceso seguro</h1>
      <p style={{ lineHeight: 1.5, color: '#46535A' }}>Esta instalación empieza sin datos de demostración. Las operaciones se habilitarán cuando el inicio de sesión y el guardado compartido estén completos.</p>
      <p role="status" style={{ borderLeft: '4px solid #F0941D', padding: '10px 14px', background: '#fff7ec' }}>
        {connection === 'checking' ? 'Comprobando la base de datos…' : connection === 'ready' ? 'Base de datos accesible. Las operaciones siguen cerradas durante la preparación.' : 'La base de datos aún no está lista para esta instalación.'}
      </p>
      <p style={{ fontSize: 12, color: '#76868d', marginBottom: 0 }}>SRI · Próximamente</p>
    </section>
  </main>
}
