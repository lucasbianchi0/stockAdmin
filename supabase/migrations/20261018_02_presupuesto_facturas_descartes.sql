/*
 * Los vínculos presupuesto → factura que alguien quitó a mano — ADITIVO.
 *
 * Las facturas se vinculan solas desde el PDF del legajo (el nombre de ARCA
 * dice qué factura es). Si una persona quita uno de esos vínculos, tiene que
 * quedar quitado: sin esta tabla, la próxima vez que se abre el reporte el
 * PDF lo volvería a vincular.
 *
 * Revertir: supabase/revertir/20261018_02_presupuesto_facturas_descartes.sql
 */

create table if not exists presupuesto_facturas_descartes (
  presupuesto_id uuid not null references presupuestos (id) on delete cascade,
  comprobante_id uuid not null references comprobantes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (presupuesto_id, comprobante_id)
);

alter table presupuesto_facturas_descartes enable row level security;
