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

  try {
    const body = await request.json()
    const token = typeof body.token === 'string' ? body.token : ''
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return json({ error: 'El enlace no es válido o ya fue usado.' }, 400)
    if (displayName.length < 2 || displayName.length > 100) return json({ error: 'Escribe tu nombre completo.' }, 400)
    if (password.length < 12 || password.length > 128) return json({ error: 'La contraseña debe tener entre 12 y 128 caracteres.' }, 400)

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    const tokenHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    // The atomic SQL update consumes a valid invitation exactly once before
    // Auth creates the user. A failed attempt requires an admin to re-issue it.
    const { data: claims, error: claimError } = await admin.rpc('consume_invitation', { p_token_hash: tokenHash })
    const claim = Array.isArray(claims) ? claims[0] : null
    if (claimError || !claim) return json({ error: 'El enlace venció o ya fue utilizado. Solicita una nueva invitación.' }, 400)

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: claim.invite_email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    })
    if (createError || !created.user) return json({ error: 'No se pudo crear la cuenta. Solicita al administrador que genere un nuevo enlace.' }, 400)

    const { error: profileError } = await admin.from('profiles').insert({
      user_id: created.user.id,
      display_name: displayName,
      role: claim.invite_role,
      active: true,
    })
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: 'No se pudo completar el perfil. Solicita al administrador un nuevo enlace.' }, 500)
    }
    await admin.from('invitations').update({ consumed_by: created.user.id }).eq('id', claim.invitation_id)
    return json({ message: 'Cuenta creada. Ya puedes iniciar sesión.' }, 201)
  } catch {
    return json({ error: 'No se pudo completar el registro.' }, 400)
  }
})
