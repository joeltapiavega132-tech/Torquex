-- Shared state is written only through the verified Edge operation handler.
-- A revision check prevents two operators from overwriting each other.
create table public.app_state (
  id integer primary key check (id = 1),
  revision bigint not null default 0 check (revision >= 0),
  data jsonb not null,
  changed_by uuid references public.profiles(user_id) on delete restrict,
  changed_at timestamptz not null default now()
);
alter table public.app_state enable row level security;
insert into public.app_state(id, data) values (1, '{"products":[],"sales":[],"payments":[],"refunds":[],"returns":[],"expenses":[],"purchases":[],"expenseRevisions":[],"purchaseRevisions":[],"stockCounts":[],"stockMovements":[],"audit":[]}'::jsonb);

create or replace function public.commit_app_state(p_revision bigint, p_data jsonb,
  p_actor_id uuid, p_action text, p_detail text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_revision bigint;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' or p_action is null or p_actor_id is null then
    raise exception 'Operación inválida.';
  end if;
  update public.app_state set data = p_data, revision = revision + 1,
    changed_by = p_actor_id, changed_at = now()
    where id = 1 and revision = p_revision returning revision into v_revision;
  if v_revision is null then raise exception 'Los datos cambiaron. Actualiza la pantalla y vuelve a intentarlo.'; end if;
  insert into public.audit_events(actor_id, entity_kind, action, reason, after_data)
    values(p_actor_id, 'app_state', p_action, p_detail, jsonb_build_object('revision', v_revision));
  return v_revision;
end;
$$;
revoke all on function public.commit_app_state(bigint, jsonb, uuid, text, text) from public, anon, authenticated;
grant execute on function public.commit_app_state(bigint, jsonb, uuid, text, text) to service_role;
