/*
 * Stock — ADITIVO, en prueba.
 *
 * Es sólo control de cantidades: no toca la contabilidad (lo que la toca es la
 * factura). Se valoriza en dólares a precio de compra, con el tipo de cambio de
 * la compra. Así lo definió el contador el 15/10/2026.
 *
 *  · `stock_items`: lo que se controla. Se carga libre (Tabletas Wacom, Cables
 *    UTP). Algunos llevan número de serie y otros no.
 *  · `stock_movimientos`: cada entrada y salida, con signo. Las entradas son
 *    positivas (stock inicial, compra, ajuste a favor) y las salidas negativas.
 *  · `stock_series`: las unidades con número de serie, con el movimiento que
 *    las trajo y, si ya salieron, el que se las llevó.
 *
 * Vender algo sin stock se permite: el sistema avisa, no frena.
 * Revertir: supabase/revertir/20261016_04_stock.sql
 */

create table if not exists stock_items (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  codigo text,
  lleva_serie boolean not null default false,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create unique index if not exists stock_items_nombre_unico on stock_items (lower(trim(nombre)));
create unique index if not exists stock_items_codigo_unico on stock_items (lower(trim(codigo))) where codigo is not null;

create table if not exists stock_movimientos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references stock_items (id) on delete cascade,
  fecha date not null,
  tipo text not null check (tipo in ('inicial', 'compra', 'venta', 'ajuste')),
  -- Con signo: + entra, − sale.
  cantidad numeric(12, 2) not null check (cantidad <> 0),
  -- Costo unitario en dólares. Obligatorio en lo que entra, que es lo que
  -- valoriza el stock; en una venta es opcional (el precio de venta).
  precio_usd numeric(14, 2) check (precio_usd is null or precio_usd >= 0),
  tc numeric(12, 4) check (tc is null or tc > 0),
  comprobante_id uuid references comprobantes (id) on delete cascade,
  detalle text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  check (
    (tipo in ('inicial', 'compra') and cantidad > 0) or
    (tipo = 'venta' and cantidad < 0) or
    tipo = 'ajuste'
  ),
  check (tipo not in ('compra', 'venta') or comprobante_id is not null)
);

create index if not exists stock_movimientos_item on stock_movimientos (item_id, fecha);
create index if not exists stock_movimientos_comprobante on stock_movimientos (comprobante_id);

create table if not exists stock_series (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references stock_items (id) on delete cascade,
  serie text not null check (length(trim(serie)) > 0),
  movimiento_entrada_id uuid not null references stock_movimientos (id) on delete cascade,
  movimiento_salida_id uuid references stock_movimientos (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists stock_series_unica on stock_series (item_id, lower(trim(serie)));

alter table stock_items enable row level security;
alter table stock_movimientos enable row level security;
alter table stock_series enable row level security;

/**
 * Los movimientos que cuentan: los manuales siempre, los de factura sólo si la
 * factura está confirmada. Un borrador o un anulado no movió mercadería.
 */
create or replace view stock_movimientos_vigentes as
select m.*,
       c.clase as comprobante_clase,
       c.punto_venta as comprobante_punto_venta,
       c.numero as comprobante_numero,
       coalesce(cl.razon_social, pr.razon_social) as entidad
  from stock_movimientos m
  left join comprobantes c on c.id = m.comprobante_id
  left join clientes cl on cl.id = c.cliente_id
  left join proveedores pr on pr.id = c.proveedor_id
 where m.comprobante_id is null or c.estado = 'confirmado';

create or replace view stock_saldos as
select i.id as item_id, i.nombre, i.codigo, i.lleva_serie, i.activo,
       coalesce(sum(m.cantidad), 0) as saldo,
       coalesce(sum(m.cantidad) filter (where m.cantidad > 0), 0) as entradas,
       coalesce(-sum(m.cantidad) filter (where m.cantidad < 0), 0) as salidas,
       -- Costo promedio de lo que entró, en dólares.
       case when sum(m.cantidad) filter (where m.cantidad > 0 and m.precio_usd is not null) > 0
         then round(
           sum(m.cantidad * m.precio_usd) filter (where m.cantidad > 0 and m.precio_usd is not null) /
           sum(m.cantidad) filter (where m.cantidad > 0 and m.precio_usd is not null), 2)
       end as costo_promedio_usd,
       max(m.fecha) as ultimo_movimiento
  from stock_items i
  left join stock_movimientos_vigentes m on m.item_id = i.id
 group by i.id;
