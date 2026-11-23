-- Torquex V2: closed membership and single-use account invitations.
-- Invite tokens are generated and delivered only by the Edge Functions. The
-- database stores their SHA-256 hash, never the bearer token itself.

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(trim(email))),
  role public.app_role not null check (role in ('admin', 'inventario', 'ventas', 'consulta')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  invited_by uuid not null references public.profiles(user_id) on delete restrict,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (consumed_by is null or consumed_at is not null)
);

create index invitations_email_open_idx on public.invitations (email, expires_at)
  where consumed_at is null and revoked_at is null;
create unique index invitations_one_open_per_email on public.invitations (lower(email))
  where consumed_at is null and revoked_at is null;
alter table public.invitations enable row level security;
-- Deliberately no client policies. Only trusted server functions can access it.

-- The product creator is also useful in the operational history. Other core
-- records already carry created_by (sales, imports, expenses, payments,
-- returns, refunds, and stock movements).
alter table public.products
  add column if not exists created_by uuid references public.profiles(user_id) on delete restrict;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (public.is_active_member());

create or replace function public.consume_invitation(p_token_hash text)
returns table (invitation_id uuid, invite_email text, invite_role public.app_role)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.invitations as i
     set consumed_at = now()
   where i.token_hash = p_token_hash
     and i.consumed_at is null
     and i.revoked_at is null
     and i.expires_at > now()
  returning i.id, i.email, i.role;
end;
$$;

revoke all on function public.consume_invitation(text) from public, anon, authenticated;
grant execute on function public.consume_invitation(text) to service_role;

create or replace function public.create_invitation(
  p_email text, p_role public.app_role, p_token_hash text, p_expires_at timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.user_id = auth.uid() and p.active and p.role = 'admin'
  ) then raise exception 'Solo un administrador activo puede invitar usuarios.'; end if;
  if p_email is null or lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Correo inválido.';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '48 hours' then
    raise exception 'La invitación debe vencer dentro de las próximas 48 horas.';
  end if;
  if exists(select 1 from auth.users u where lower(u.email) = lower(trim(p_email))) then
    raise exception 'Ya existe una cuenta con ese correo. Pide al administrador que revise su estado.';
  end if;
  update public.invitations set revoked_at = now()
    where lower(email) = lower(trim(p_email)) and consumed_at is null and revoked_at is null;
  insert into public.invitations(email, role, token_hash, invited_by, expires_at)
  values (lower(trim(p_email)), p_role, p_token_hash, auth.uid(), p_expires_at)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_invitation(text, public.app_role, text, timestamptz) from public, anon;
grant execute on function public.create_invitation(text, public.app_role, text, timestamptz) to authenticated;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.user_id = auth.uid() and p.active and p.role = 'admin'
  ) then raise exception 'Solo un administrador activo puede cancelar invitaciones.'; end if;
  update public.invitations set revoked_at = now()
   where id = p_invitation_id and consumed_at is null and revoked_at is null;
  if not found then raise exception 'La invitación ya fue usada, cancelada o no existe.'; end if;
end;
$$;
revoke all on function public.revoke_invitation(uuid) from public, anon;
grant execute on function public.revoke_invitation(uuid) to authenticated;

-- Audit history is append-only, even for trusted application roles.
create or replace function public.reject_audit_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'El historial de auditoría es inmutable.';
end;
$$;
create trigger audit_events_no_update before update or delete on public.audit_events
  for each row execute function public.reject_audit_mutation();
