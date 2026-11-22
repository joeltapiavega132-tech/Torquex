-- Torquex 1.2: esquema preparado para la siguiente fase.
-- No conectar el cliente directamente para escrituras: ventas, cobros e inventario
-- requieren funciones transaccionales con permisos y auditoría en el servidor.

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'inventario', 'ventas', 'consulta');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.app_role not null default 'consulta',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^TX-[0-9]{5,}$'),
  name text not null check (length(trim(name)) > 0),
  category text not null default '',
  brand text not null default '',
  model text not null default '',
  part_type text not null default '',
  stock integer not null default 0 check (stock >= 0),
  minimum_stock integer check (minimum_stock >= 0),
  current_cost numeric(14,2) not null default 0 check (current_cost >= 0),
  current_price numeric(14,2) not null default 0 check (current_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_compatibilities (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  vehicle_brand text not null default '',
  vehicle_model text not null default '',
  engine text not null default '',
  year_from integer check (year_from between 1900 and 2200),
  year_to integer check (year_to between 1900 and 2200),
  notes text not null default '',
  check (year_to is null or year_from is null or year_to >= year_from)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  sale_date date not null,
  customer_name text not null check (length(trim(customer_name)) > 0),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  vat_amount numeric(14,2) not null check (vat_amount >= 0),
  total numeric(14,2) not null check (total = subtotal + vat_amount),
  cancelled_at timestamptz,
  cancellation_reason text,
  created_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_code_snapshot text not null,
  product_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price_snapshot numeric(14,2) not null check (unit_price_snapshot >= 0),
  unit_cost_snapshot numeric(14,2) not null check (unit_cost_snapshot >= 0),
  vat_rate_snapshot numeric(7,4) not null check (vat_rate_snapshot between 0 and 1),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  vat_amount numeric(14,2) not null check (vat_amount >= 0)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  payment_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  method text not null,
  created_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  sale_line_id uuid not null references public.sale_lines(id) on delete restrict,
  return_date date not null,
  quantity integer not null check (quantity > 0),
  reason text not null check (length(trim(reason)) > 0),
  unit_price_snapshot numeric(14,2) not null check (unit_price_snapshot >= 0),
  unit_cost_snapshot numeric(14,2) not null check (unit_cost_snapshot >= 0),
  vat_rate_snapshot numeric(7,4) not null check (vat_rate_snapshot between 0 and 1),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  vat_amount numeric(14,2) not null check (vat_amount >= 0),
  total numeric(14,2) not null check (total = subtotal + vat_amount),
  created_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  refund_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  method text not null,
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  import_date date not null,
  supplier_name text not null,
  created_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.import_lines (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.imports(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_code_snapshot text not null,
  product_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_cost_snapshot numeric(14,2) not null check (unit_cost_snapshot >= 0)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  created_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  reason text not null,
  source_kind text not null check (source_kind in ('initial', 'import', 'sale', 'return', 'adjustment', 'cancellation')),
  source_id uuid,
  created_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(user_id) on delete restrict,
  entity_kind text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index on public.product_compatibilities (product_id);
create index on public.sales (sale_date desc);
create index on public.sale_lines (sale_id);
create index on public.payments (sale_id, payment_date);
create index on public.sale_returns (sale_id, sale_line_id, return_date);
create index on public.refunds (sale_id, refund_date);
create index on public.import_lines (import_id);
create index on public.stock_movements (product_id, created_at desc);
create index on public.audit_events (created_at desc);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_compatibilities enable row level security;
alter table public.sales enable row level security;
alter table public.sale_lines enable row level security;
alter table public.payments enable row level security;
alter table public.sale_returns enable row level security;
alter table public.refunds enable row level security;
alter table public.imports enable row level security;
alter table public.import_lines enable row level security;
alter table public.expenses enable row level security;
alter table public.stock_movements enable row level security;
alter table public.audit_events enable row level security;

create function public.is_active_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and active)
$$;

revoke all on function public.is_active_member() from public;
grant execute on function public.is_active_member() to authenticated;

create policy profiles_read on public.profiles for select to authenticated
  using (user_id = auth.uid() and active);
create policy products_read on public.products for select to authenticated
  using (public.is_active_member());
create policy compatibilities_read on public.product_compatibilities for select to authenticated
  using (public.is_active_member());
create policy sales_read on public.sales for select to authenticated
  using (public.is_active_member());
create policy sale_lines_read on public.sale_lines for select to authenticated
  using (public.is_active_member());
create policy payments_read on public.payments for select to authenticated
  using (public.is_active_member());
create policy sale_returns_read on public.sale_returns for select to authenticated
  using (public.is_active_member());
create policy refunds_read on public.refunds for select to authenticated
  using (public.is_active_member());
create policy imports_read on public.imports for select to authenticated
  using (public.is_active_member());
create policy import_lines_read on public.import_lines for select to authenticated
  using (public.is_active_member());
create policy expenses_read on public.expenses for select to authenticated
  using (public.is_active_member());
create policy stock_movements_read on public.stock_movements for select to authenticated
  using (public.is_active_member());
create policy audit_events_read on public.audit_events for select to authenticated
  using (public.is_active_member());

-- No hay políticas de escritura para clientes en esta migración. El siguiente
-- paso implementará operaciones de servidor atómicas con control de roles.
