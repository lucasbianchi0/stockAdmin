/*
 * Asientos que se cargan a mano, como borrador — ADITIVO, en prueba.
 *
 * El ajuste por inflación y el asiento de apertura los pasa el estudio, y el
 * cierre se propone desde el sistema. Mientras esto esté en prueba se guardan
 * acá, como borradores, y NO se registran en el libro diario: se arman, se
 * revisan y se ve si cuadran. Registrarlos es el paso que se habilita cuando se
 * apruebe.
 *
 * Revertir: supabase/revertir/20261016_05_asientos_borradores.sql
 */

create table if not exists asientos_borradores (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('apertura', 'ajuste_inflacion', 'cierre')),
  fecha date not null,
  descripcion text not null,
  -- [{ cuentaId, debe, haber, detalle }]. Se valida al registrar, no acá: un
  -- borrador a medio cargar tiene que poder guardarse.
  lineas jsonb not null default '[]'::jsonb,
  estado text not null default 'borrador' check (estado in ('borrador', 'registrado', 'descartado')),
  asiento_id uuid references asientos (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table asientos_borradores enable row level security;
