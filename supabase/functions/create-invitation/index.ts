import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Inicia sesión como administrador.' }, 401)

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
    const { data: { user }, error: userError } = await caller.auth.getUser()
    if (userError || !user) return json({ error: 'La sesión no es válida.' }, 401)
    const { data: profile, error: profileError } = await caller.from('profiles').select('role,active').eq('user_id', user.id).maybeSingle()
    if (profileError || !profile?.active || profile.role !== 'admin') return json({ error: 'Solo un administrador activo puede crear invitaciones.' }, 403)

    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const role = body.role
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Ingresa un correo válido.' }, 400)
    if (!['admin', 'inventario', 'ventas', 'consulta'].includes(role)) return json({ error: 'El rol seleccionado no es válido.' }, 400)
    const origin = Deno.env.get('APP_ORIGIN')
    if (!origin) return json({ error: 'Falta configurar el dominio autorizado de Torquex.' }, 500)

    const bytes = crypto.getRandomValues(new Uint8Array(32))
    const token = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    const tokenHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const { error } = await caller.rpc('create_invitation', {
      p_email: email,
      p_role: role,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
    })
    if (error) return json({ error: error.message }, 400)

    const inviteUrl = new URL('/', origin)
    // The fragment is not sent to Netlify or included in HTTP referrer headers.
    inviteUrl.hash = `invite=${token}`
    return json({ email, role, expiresAt, inviteUrl: inviteUrl.toString() }, 201)
  } catch {
    return json({ error: 'No se pudo crear la invitación.' }, 400)
  }
})
