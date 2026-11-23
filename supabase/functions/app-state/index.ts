import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Store } from '../../../src/data.ts'
import { apply, can } from './operations.ts'

const origin = Deno.env.get('APP_ORIGIN') ?? ''
const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'Método no permitido.' }, 405)
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return reply({ error: 'Inicia sesión.' }, 401)
  try {
    const endpoint = Deno.env.get('SUPABASE_URL')!
    const caller = createClient(endpoint, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
    const { data: { user }, error: authError } = await caller.auth.getUser(authorization.slice(7))
    if (authError || !user) return reply({ error: 'Sesión inválida.' }, 401)
    const admin = createClient(endpoint, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data: profile } = await admin.from('profiles').select('display_name,role,active').eq('user_id', user.id).maybeSingle()
    if (!profile?.active) return reply({ error: 'Cuenta sin acceso activo.' }, 403)
    const { data: row, error: loadError } = await admin.from('app_state').select('revision,data').eq('id', 1).single()
    if (loadError || !row) return reply({ error: 'La base de datos aún no está preparada.' }, 503)
    const current = row.data as Store
    if (request.method === 'GET') return reply({ store: current, revision: row.revision })
    const body = await request.json()
    if (!Number.isSafeInteger(body.revision) || !body.proposed || typeof body.proposed !== 'object') return reply({ error: 'Solicitud inválida.' }, 400)
    if (body.revision !== row.revision) return reply({ error: 'Otra persona actualizó los datos. Recarga antes de continuar.' }, 409)
    const action = body.proposed.audit?.[0]?.action
    if (typeof action !== 'string' || !can(profile.role, action)) return reply({ error: 'Tu rol no permite esta operación.' }, 403)
    const next = apply(current, body.proposed as Store)
    if (!next.audit?.[0]) return reply({ error: 'Falta el evento de auditoría.' }, 400)
    next.audit[0] = { ...next.audit[0], actorId: user.id, actorName: profile.display_name }
    for (const collection of ['products', 'sales', 'payments', 'refunds', 'returns', 'expenses', 'purchases', 'expenseRevisions', 'purchaseRevisions', 'stockCounts', 'stockMovements'] as const) {
      const oldIds = new Set(current[collection].map(item => item.id))
      ;(next[collection] as Array<{ id: string; createdBy?: string; createdByName?: string }>).forEach(item => {
        if (!oldIds.has(item.id)) { item.createdBy = user.id; item.createdByName = profile.display_name }
      })
    }
    const { data: revision, error: saveError } = await admin.rpc('commit_app_state', {
      p_revision: row.revision, p_data: next, p_actor_id: user.id,
      p_action: next.audit[0].action, p_detail: next.audit[0].detail,
    })
    if (saveError) return reply({ error: saveError.message }, 409)
    return reply({ store: next, revision })
  } catch (error) { return reply({ error: error instanceof Error ? error.message : 'No se pudo completar la operación.' }, 400) }
})
