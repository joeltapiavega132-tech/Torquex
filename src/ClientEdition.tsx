import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { createClient, type Session } from '@supabase/supabase-js'
import { downloadBackup } from './backup'
import type { Store } from './data'

const App = lazy(() => import('./App'))

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
const db = url && key ? createClient(url, key) : null
type Role = 'admin' | 'inventario' | 'ventas' | 'consulta'
type Member = { user_id: string; display_name: string; role: Role; active: boolean }
type Invite = { id: string; email: string; role: Role; expires_at: string; consumed_at: string | null; revoked_at: string | null }
type Screen = 'login' | 'accept' | 'recover' | 'password'

export function ClientEdition() {
  const [screen, setScreen] = useState<Screen>(() => location.hash.startsWith('#invite=') ? 'accept' : 'login')
  const [token] = useState(() => location.hash.startsWith('#invite=') ? location.hash.slice(8) : '')
  const [emailInvite] = useState(() => location.hash.includes('type=invite'))
  const [recoveryLink] = useState(() => location.hash.includes('type=recovery'))
  const [session, setSession] = useState<Session | null>(null)
  const [member, setMember] = useState<Member | null>(null)
  const [team, setTeam] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('ventas')
  const [inviteLink, setInviteLink] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [showApp, setShowApp] = useState(false)
  const [appState, setAppState] = useState<Store | null>(null)
  const revisionRef = useRef(0)
  const pendingRef = useRef(false)

  useEffect(() => {
    if (token) history.replaceState(null, '', location.pathname + location.search)
    if (!db) return
    db.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = db.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setScreen('password')
      if (event === 'SIGNED_IN' && (emailInvite || recoveryLink)) setScreen('password')
    })
    return () => data.subscription.unsubscribe()
  }, [token, emailInvite, recoveryLink])

  useEffect(() => {
    if (!db || !session) { setMember(null); return }
    db.from('profiles').select('user_id,display_name,role,active').eq('user_id', session.user.id).maybeSingle()
      .then(({ data, error }) => { setMember(data as Member | null); if (error) setNotice(error.message) })
  }, [session])

  async function refreshTeam() {
    if (!db) return
    const [membersResult, invitesResult] = await Promise.all([
      db.from('profiles').select('user_id,display_name,role,active').order('display_name'),
      db.rpc('list_invitations'),
    ])
    if (membersResult.error || invitesResult.error) { setNotice(membersResult.error?.message ?? invitesResult.error?.message ?? 'Error de acceso.'); return }
    setTeam(membersResult.data as Member[])
    setInvites(invitesResult.data as Invite[])
  }
  useEffect(() => { if (member?.role === 'admin') void refreshTeam() }, [member])

  useEffect(() => {
    if (!db || !member?.active) { setAppState(null); return }
    db.functions.invoke('app-state', { method: 'GET' }).then(({ data, error }) => {
      if (error || data?.error) { setNotice(data?.error ?? error?.message ?? 'No se pudo cargar la base de datos.'); return }
      revisionRef.current = data.revision; setAppState(data.store as Store)
    })
  }, [member])

  async function commitRemote(next: Store): Promise<Store> {
    if (!db || pendingRef.current) throw new Error('Espera a que termine la operación anterior.')
    pendingRef.current = true
    try {
      const { data, error } = await db.functions.invoke('app-state', { body: { revision: revisionRef.current, proposed: next } })
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'No se pudo guardar.')
      revisionRef.current = data.revision; setAppState(data.store as Store)
      return data.store as Store
    } finally { pendingRef.current = false }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!db) return
    setBusy(true); setNotice('')
    try {
      if (screen === 'login') {
        const { error } = await db.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else if (screen === 'accept') {
        const { data, error } = await db.functions.invoke('accept-invitation', { body: { token, displayName: name } })
        if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'No se pudo crear la cuenta.')
        setEmail(data.email ?? ''); setScreen('login'); setNotice('Revisa tu correo y usa el enlace para establecer la contraseña.')
      } else if (screen === 'recover') {
        const { error } = await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname })
        if (error) throw error
        setNotice('Si existe una cuenta con ese correo, llegará un enlace de recuperación.')
      } else {
        if (!session) throw new Error('El enlace aún no ha iniciado sesión. Vuelve a abrirlo desde el correo.')
        if (password !== passwordConfirm) throw new Error('Las contraseñas no coinciden.')
        const { error } = await db.auth.updateUser({ password })
        if (error) throw error
        await db.auth.signOut()
        setScreen('login'); setNotice('Contraseña guardada. Inicia sesión con la nueva contraseña.')
      }
      setPassword(''); setPasswordConfirm('')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo completar la operación.') }
    finally { setBusy(false) }
  }

  async function invite(event: FormEvent) {
    event.preventDefault()
    if (!db) return
    setBusy(true); setInviteLink('')
    const { data, error } = await db.functions.invoke('create-invitation', { body: { email, role } })
    setNotice(data?.error ?? error?.message ?? 'Enlace creado. Compártelo directamente con la persona invitada.')
    if (!error && !data?.error) { setInviteLink(data.inviteUrl); setEmail(''); await refreshTeam() }
    setBusy(false)
  }

  async function setAccess(userId: string, change: 'role' | 'active', value: Role | boolean) {
    if (!db || !confirm('¿Confirmas este cambio de acceso?')) return
    const { error } = await db.rpc(change === 'role' ? 'set_member_role' : 'set_member_status',
      change === 'role' ? { p_user_id: userId, p_role: value } : { p_user_id: userId, p_active: value })
    setNotice(error?.message ?? 'Acceso actualizado.')
    if (!error) await refreshTeam()
  }

  async function cancelInvite(id: string) {
    if (!db || !confirm('¿Cancelar este enlace de invitación?')) return
    const { error } = await db.rpc('revoke_invitation', { p_invitation_id: id })
    setNotice(error?.message ?? 'Invitación cancelada.')
    if (!error) await refreshTeam()
  }

  if (db && session && member?.active && showApp && appState) return <>
    <div className="client-session-bar"><span>{member.display_name} · {member.role}</span><button onClick={() => setShowApp(false)}>Equipo y cuenta</button><button onClick={() => { setShowApp(false); setScreen('password') }}>Crear o cambiar contraseña</button><button onClick={() => void db.auth.signOut()}>Cerrar sesión</button></div>
    <Suspense fallback={<main className="client-page"><section className="client-card"><p>Abriendo Torquex…</p></section></main>}><App remote={{ initial: appState, commit: commitRemote }} /></Suspense>
  </>

  return <main className="client-page"><section className="client-card">
    <small className="client-eyebrow">TORQUEX · V2.2</small>
    {!db && <><h1>Configuración pendiente</h1><p>Faltan la URL y la clave pública de Supabase.</p></>}
    {db && (!session || screen === 'password') && <><h1>{screen === 'accept' ? 'Activa tu invitación' : screen === 'recover' ? 'Recuperar acceso' : screen === 'password' ? 'Nueva contraseña' : 'Iniciar sesión'}</h1>
      <p>{screen === 'password' ? 'Escribe una contraseña nueva para tu cuenta.' : 'Solo personas invitadas pueden crear una cuenta.'}</p>
      <form onSubmit={submit}>
        {screen === 'accept' && <label>Nombre completo<input required minLength={2} value={name} onChange={e => setName(e.target.value)} /></label>}
        {(screen === 'login' || screen === 'recover') && <label>Correo<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>}
        {screen !== 'recover' && screen !== 'accept' && <label>Contraseña<input type="password" required minLength={screen === 'login' ? 1 : 12} autoComplete={screen === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} /></label>}
        {screen === 'password' && <label>Confirmar contraseña<input type="password" required minLength={12} autoComplete="new-password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} /></label>}
        <button disabled={busy}>{busy ? 'Procesando…' : screen === 'accept' ? 'Enviar invitación a mi correo' : screen === 'recover' ? 'Enviar enlace' : screen === 'password' ? 'Guardar contraseña' : 'Entrar'}</button>
      </form>
      {screen === 'login' && <button className="client-link" onClick={() => setScreen('recover')}>Olvidé mi contraseña</button>}
      {screen === 'recover' && <button className="client-link" onClick={() => setScreen('login')}>Volver</button>}
    </>}
    {db && session && screen !== 'password' && <><h1>Hola{member ? `, ${member.display_name}` : ''}</h1>
      {!member?.active ? <p>La cuenta aún no tiene acceso activo.</p> : <>
        <p>Rol: <strong>{member.role}</strong>. Los movimientos se guardan para el equipo.</p>
        <button disabled={!appState} onClick={() => setShowApp(true)}>{appState ? 'Abrir Torquex' : 'Cargando operaciones…'}</button>
        <button onClick={() => { setNotice(''); setScreen('password') }}>Crear o cambiar contraseña</button>
        {member.role === 'admin' && appState && <button onClick={() => downloadBackup(appState)}>Descargar respaldo</button>}
        {member.role === 'admin' && <><h2>Invitar persona</h2>
          <form onSubmit={invite}><label>Correo<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
            <label>Permiso<select value={role} onChange={e => setRole(e.target.value as Role)}><option value="ventas">Ventas</option><option value="inventario">Inventario</option><option value="consulta">Consulta</option><option value="admin">Administrador</option></select></label>
            <button disabled={busy}>Crear enlace de un solo uso</button></form>
          {inviteLink && <label>Enlace generado<input readOnly value={inviteLink} onFocus={e => e.target.select()} /></label>}
          <h2>Equipo</h2>{team.map(person => <div className="client-row" key={person.user_id}><strong>{person.display_name}</strong> · {person.active ? 'Activo' : 'Inactivo'}<div><select value={person.role} onChange={e => void setAccess(person.user_id, 'role', e.target.value as Role)}><option value="admin">Administrador</option><option value="inventario">Inventario</option><option value="ventas">Ventas</option><option value="consulta">Consulta</option></select>{person.user_id !== session.user.id && <button onClick={() => void setAccess(person.user_id, 'active', !person.active)}>{person.active ? 'Desactivar' : 'Activar'}</button>}</div></div>)}
          <h2>Invitaciones</h2>{invites.map(item => <div className="client-row" key={item.id}>{item.email} · {item.role} · {item.consumed_at ? 'Usada' : item.revoked_at ? 'Cancelada' : new Date(item.expires_at) < new Date() ? 'Vencida' : 'Pendiente'}{!item.consumed_at && !item.revoked_at && <button onClick={() => void cancelInvite(item.id)}>Cancelar</button>}</div>)}
        </>}
      </>}
      <button className="client-link" onClick={() => void db.auth.signOut()}>Cerrar sesión</button>
    </>}
    {notice && <p className="client-notice" role="status">{notice}</p>}
    <p className="client-foot">SRI · Próximamente</p>
  </section></main>
}
