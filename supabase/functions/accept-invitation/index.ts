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
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return json({ error: 'El enlace no es válido o ya fue usado.' }, 400)
    if (displayName.length < 2 || displayName.length > 100) return json({ error: 'Escribe tu nombre completo.' }, 400)
    const appOrigin = Deno.env.get('APP_ORIGIN')
    if (!appOrigin) return json({ error: 'Falta configurar el dominio de Torquex.' }, 500)

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    const tokenHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    // The atomic SQL update consumes a valid invitation exactly once before
    // Auth creates the user. A failed attempt requires an admin to re-issue it.
    const { data: claims, error: claimError } = await admin.rpc('consume_invitation', { p_token_hash: tokenHash })
    const claim = Array.isArray(claims) ? claims[0] : null
    if (claimError || !claim) return json({ error: 'El enlace venció o ya fue utilizado. Solicita una nueva invitación.' }, 400)

    const { data: created, error: createError } = await admin.auth.admin.inviteUserByEmail(claim.invite_email, {
      data: { display_name: displayName }, redirectTo: appOrigin,
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
    return json({ message: 'Revisa tu correo y usa el enlace recibido para establecer la contraseña.', email: claim.invite_email }, 201)
  } catch {
    return json({ error: 'No se pudo completar el registro.' }, 400)
  }
})
