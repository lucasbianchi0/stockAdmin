/*
 * La analítica de la página de LinkedIn de Accedra — ADITIVO.
 *
 * Mientras LinkedIn no apruebe la Community Management API (pedida el
 * 21/10/2026), los datos entran desde los tres .xls que exporta la analítica de
 * la página: Contenido, Seguidores y Visitantes. Las tablas tienen la forma que
 * va a llenar la API, para que el día que llegue cambie la carga y no la
 * pantalla.
 *
 * `linkedin_dias` tiene una fila por día y cada export llena sus columnas: un
 * null es "ese archivo todavía no se cargó para ese día", no un cero. Volver a
 * importar el mismo período pisa los números, que es lo correcto: LinkedIn los
 * corrige durante unos días.
 *
 * Revertir: supabase/revertir/20261021_01_linkedin.sql
 */

create table if not exists linkedin_dias (
  fecha date primary key,
  -- Contenido (totales: orgánico + patrocinado)
  impresiones integer,
  impresiones_pagas integer,
  impresiones_unicas integer,
  clics integer,
  reacciones integer,
  comentarios integer,
  compartidos integer,
  -- Seguidores
  seguidores_nuevos integer,
  seguidores_pagos integer,
  -- Visitantes
  vistas_pagina integer,
  visitantes_unicos integer,
  actualizado_en timestamptz not null default now()
);

create table if not exists linkedin_publicaciones (
  url text primary key,
  titulo text,
  fecha date,
  tipo text,
  autor text,
  contenido text,
  impresiones integer,
  vistas integer,
  clics integer,
  reacciones integer,
  comentarios integer,
  compartidos integer,
  seguidores integer,
  tasa_interaccion numeric,
  actualizado_en timestamptz not null default now()
);

create index if not exists linkedin_publicaciones_fecha on linkedin_publicaciones (fecha desc);

-- Una foto, no una serie: LinkedIn da la demografía acumulada a hoy. Cada
-- importación reemplaza la foto de su fuente.
create table if not exists linkedin_demografia (
  fuente text not null check (fuente in ('seguidores', 'visitantes')),
  dimension text not null,
  valor text not null,
  total integer not null,
  primary key (fuente, dimension, valor)
);

create table if not exists linkedin_cargas (
  id uuid primary key default gen_random_uuid(),
  cargado_en timestamptz not null default now(),
  cargado_por text,
  archivo text not null,
  tipo text not null check (tipo in ('contenido', 'seguidores', 'visitantes')),
  desde date,
  hasta date,
  filas integer not null default 0
);

create index if not exists linkedin_cargas_cuando on linkedin_cargas (cargado_en desc);

alter table linkedin_dias enable row level security;
alter table linkedin_publicaciones enable row level security;
alter table linkedin_demografia enable row level security;
alter table linkedin_cargas enable row level security;
