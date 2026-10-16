/*
 * Qué factura de venta corresponde a cada presupuesto — ADITIVO, en prueba.
 *
 * Los Puntos (8% de la renta de lo facturado) son la base de la comisión, y el
 * contador pidió verlos con el detalle por factura. Hoy "Facturado" es sólo un
 * estado del presupuesto. Un presupuesto puede facturarse en partes, así que
 * admite varias facturas.
 *
 * Revertir: supabase/revertir/20261016_03_presupuesto_facturas.sql
 */

create table if not exists presupuesto_facturas (
  presupuesto_id uuid not null references presupuestos (id) on delete cascade,
  comprobante_id uuid not null references comprobantes (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  primary key (presupuesto_id, comprobante_id)
);

create index if not exists presupuesto_facturas_comprobante on presupuesto_facturas (comprobante_id);

alter table presupuesto_facturas enable row level security;
