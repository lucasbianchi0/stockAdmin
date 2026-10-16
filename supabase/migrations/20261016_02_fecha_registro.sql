/*
 * Fecha de registro de una factura — ADITIVO, en prueba.
 *
 * El contador pidió dos fechas: la del comprobante y la de registro, y que el
 * subdiario tome el mes de la de registro. Va en una tabla aparte y no como
 * columna de `comprobantes` a propósito: cualquier cambio en una fila de
 * `comprobantes` regenera su asiento (y le da un número nuevo), y mientras esto
 * esté en prueba no tiene que tocar ninguna factura.
 *
 * Sin fila acá, la fecha de registro es la del comprobante.
 * Revertir: supabase/revertir/20261016_02_fecha_registro.sql
 */

create table if not exists comprobante_registro (
  comprobante_id uuid primary key references comprobantes (id) on delete cascade,
  fecha_registro date not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table comprobante_registro enable row level security;

create or replace view comprobantes_fecha_registro as
select c.id as comprobante_id,
       coalesce(r.fecha_registro, c.fecha) as fecha_registro,
       r.fecha_registro is not null as distinta
  from comprobantes c
  left join comprobante_registro r on r.comprobante_id = c.id;
