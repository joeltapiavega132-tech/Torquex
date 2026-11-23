-- Only an active administrator may manage staff. Clients have no direct write policy.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles
    where user_id = auth.uid() and active and role = 'admin')
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.set_member_status(p_user_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'Solo un administrador puede cambiar accesos.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(2202);
  if p_user_id = auth.uid() and not p_active then raise exception 'No puedes desactivar tu propia cuenta.'; end if;
  select * into v_old from public.profiles where user_id = p_user_id for update;
  if not found then raise exception 'Usuario no encontrado.'; end if;
  if v_old.role = 'admin' and v_old.active and not p_active and
    (select count(*) from public.profiles where role = 'admin' and active) <= 1 then
    raise exception 'Debe quedar un administrador activo.';
  end if;
  update public.profiles set active = p_active where user_id = p_user_id;
  insert into public.audit_events(actor_id, entity_kind, entity_id, action, before_data, after_data)
  values(auth.uid(), 'profile', p_user_id, 'member_status_changed',
    jsonb_build_object('active', v_old.active), jsonb_build_object('active', p_active));
end;
$$;
revoke all on function public.set_member_status(uuid, boolean) from public, anon;
grant execute on function public.set_member_status(uuid, boolean) to authenticated;

create or replace function public.set_member_role(p_user_id uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'Solo un administrador puede cambiar roles.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(2202);
  select * into v_old from public.profiles where user_id = p_user_id for update;
  if not found then raise exception 'Usuario no encontrado.'; end if;
  if v_old.user_id = auth.uid() and p_role <> 'admin' then raise exception 'No puedes quitarte el rol administrador.'; end if;
  if v_old.role = 'admin' and v_old.active and p_role <> 'admin' and
    (select count(*) from public.profiles where role = 'admin' and active) <= 1 then
    raise exception 'Debe quedar un administrador activo.';
  end if;
  update public.profiles set role = p_role where user_id = p_user_id;
  insert into public.audit_events(actor_id, entity_kind, entity_id, action, before_data, after_data)
  values(auth.uid(), 'profile', p_user_id, 'member_role_changed',
    jsonb_build_object('role', v_old.role), jsonb_build_object('role', p_role));
end;
$$;
revoke all on function public.set_member_role(uuid, public.app_role) from public, anon;
grant execute on function public.set_member_role(uuid, public.app_role) to authenticated;

create or replace function public.list_invitations()
returns table(id uuid, email text, role public.app_role, expires_at timestamptz,
  consumed_at timestamptz, revoked_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.email, i.role, i.expires_at, i.consumed_at, i.revoked_at, i.created_at
  from public.invitations i where public.is_admin() order by i.created_at desc limit 100
$$;
revoke all on function public.list_invitations() from public, anon;
grant execute on function public.list_invitations() to authenticated;
