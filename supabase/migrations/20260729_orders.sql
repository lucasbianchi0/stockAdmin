-- Pedidos a Distecna via API V2.
--
-- Contexto importante: la API V2 no tiene endpoint para consultar pedidos. El
-- catalogo completo son 5 endpoints y POST /v2/Order es el unico de pedidos, sin
-- GET de estado ni cancelacion. Por eso estas tablas son la unica fuente de
-- verdad de lo que pedimos: guardamos el request y la respuesta crudos.

-- productType es obligatorio en POST /v2/Order y no se puede deducir del codigo
-- ni de la categoria (NWOTRO, PCACCS, MMDM, NWROUT, NWSWIT...). Solo lo devuelve
-- la V2, asi que hay que sincronizarlo desde ahi.
alter table products add column if not exists type text;

create table if not exists orders (
  id                  uuid primary key default gen_random_uuid(),
  sales_order_id      text unique,
  status              text not null default 'enviado',
  payment_term_id     text,
  delivery_address_id text,
  -- qa | prod. Mientras no este habilitado el host de produccion los pedidos son
  -- de homologacion y no deben confundirse con compras reales.
  environment         text not null default 'qa',
  total_usd           numeric(12, 2),
  request             jsonb not null,
  response            jsonb,
  error               text,
  created_at          timestamptz not null default now()
);

create table if not exists order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders (id) on delete cascade,
  code         text not null,
  product_type text not null,
  quantity     integer not null check (quantity > 0),
  unit_price   numeric(12, 2),
  currency     text,
  iva          numeric(5, 4),
  name         text
);

create index if not exists orders_created_at_idx on orders (created_at desc);
create index if not exists order_items_order_id_idx on order_items (order_id);
