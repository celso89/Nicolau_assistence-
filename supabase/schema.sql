-- NICOLAU ASSISTANCE | Esquema inicial Supabase
-- Execute no SQL Editor do projeto Supabase.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text not null default '',
  role text not null default 'employee' check (role in ('admin','employee')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'); $$;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(), name text not null, phone text,
  address text, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.service_catalog (
  id uuid primary key default gen_random_uuid(), name text not null,
  service_type text not null check(service_type in ('Serviço Normal','Troca de Visor')),
  description text, price numeric(14,2) not null default 0 check(price>=0),
  active boolean not null default true, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
-- Inventários intencionalmente separados: não juntar estas duas tabelas.
create table if not exists public.visor_stock (
  id uuid primary key default gen_random_uuid(), name text not null,
  quantity integer not null default 0 check(quantity>=0), unit_cost numeric(14,2) not null default 0,
  supplier text, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.visor_orders (
  id uuid primary key default gen_random_uuid(), name text not null,
  quantity integer not null default 0 check(quantity>=0), unit_cost numeric(14,2) not null default 0,
  supplier text, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.tool_stock (
  id uuid primary key default gen_random_uuid(), name text not null,
  quantity integer not null default 0 check(quantity>=0), unit_cost numeric(14,2) not null default 0,
  created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.service_orders (
  id uuid primary key default gen_random_uuid(), order_no text not null unique,
  client_id uuid references public.clients(id) on delete set null, client_name text not null,
  service_id uuid references public.service_catalog(id) on delete set null, service_name text not null,
  service_type text not null check(service_type in ('Serviço Normal','Troca de Visor')),
  visor_origin text check(visor_origin in ('Por Encomenda','No Estoque') or visor_origin is null),
  amount numeric(14,2) not null default 0 check(amount>=0), device text, problem text,
  status text not null default 'Em andamento', created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint visor_origin_required check ((service_type='Serviço Normal' and visor_origin is null) or (service_type='Troca de Visor' and visor_origin is not null))
);
create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(), order_id uuid references public.service_orders(id) on delete set null,
  category text not null check(category in ('service_normal','visor_stock','visor_order')),
  description text not null, direction text not null check(direction in ('entrada','saida')),
  amount numeric(14,2) not null check(amount>=0), created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), actor text,
  action text not null, details text, created_at timestamptz not null default now()
);
create index if not exists idx_orders_created_at on public.service_orders(created_at desc);
create index if not exists idx_cash_category on public.cash_movements(category,created_at desc);
create index if not exists idx_logs_created_at on public.activity_logs(created_at desc);

-- Criar automaticamente o perfil básico quando uma conta Auth é criada.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
  insert into public.profiles(id,email,full_name,role)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''), 'employee')
  on conflict(id) do update set email=excluded.email;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.service_catalog enable row level security;
alter table public.visor_stock enable row level security;
alter table public.visor_orders enable row level security;
alter table public.tool_stock enable row level security;
alter table public.service_orders enable row level security;
alter table public.cash_movements enable row level security;
alter table public.activity_logs enable row level security;

-- Perfis: utilizadores autenticados podem consultar nomes/roles; apenas admin gere perfis.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Dados operacionais: funcionários autenticados trabalham nos registos; exclusões e catálogo são controlados pelo admin.
do $$ declare t text; begin
 foreach t in array array['clients','visor_stock','visor_orders','tool_stock','service_orders','cash_movements'] loop
  execute format('drop policy if exists %I_read on public.%I',t,t);
  execute format('create policy %I_read on public.%I for select to authenticated using (true)',t,t);
  execute format('drop policy if exists %I_insert on public.%I',t,t);
  execute format('create policy %I_insert on public.%I for insert to authenticated with check (true)',t,t);
  execute format('drop policy if exists %I_update on public.%I',t,t);
  execute format('create policy %I_update on public.%I for update to authenticated using (true) with check (true)',t,t);
  execute format('drop policy if exists %I_delete on public.%I',t,t);
  execute format('create policy %I_delete on public.%I for delete to authenticated using (public.is_admin())',t,t);
 end loop;
end $$;
drop policy if exists service_catalog_read on public.service_catalog;
create policy service_catalog_read on public.service_catalog for select to authenticated using (true);
drop policy if exists service_catalog_insert on public.service_catalog;
create policy service_catalog_insert on public.service_catalog for insert to authenticated with check (public.is_admin());
drop policy if exists service_catalog_update on public.service_catalog;
create policy service_catalog_update on public.service_catalog for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists service_catalog_delete on public.service_catalog;
create policy service_catalog_delete on public.service_catalog for delete to authenticated using (public.is_admin());
drop policy if exists activity_logs_read on public.activity_logs;
create policy activity_logs_read on public.activity_logs for select to authenticated using (public.is_admin());
drop policy if exists activity_logs_insert on public.activity_logs;
create policy activity_logs_insert on public.activity_logs for insert to authenticated with check (auth.uid()=user_id);
