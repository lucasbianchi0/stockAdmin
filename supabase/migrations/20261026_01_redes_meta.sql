/*
 * Métricas de Instagram y Facebook de Accedra — ADITIVO.
 *
 * Salen de la API de Meta (gratis, cuentas propias, sin revisión de app) y las
 * trae un cron diario. Son dos redes con métricas parecidas y la pantalla las
 * muestra igual, así que comparten tablas con una columna `red`; LinkedIn tiene
 * las suyas porque entra por otro lado (export de .xls) y con otra forma.
 *
 * `social_cuentas` es la tabla que ya esperaba `src/lib/publicar/cuentas.ts`
 * para publicar y que nunca se había creado: guarda la cuenta conectada de
 * cada red con su token. Sólo la lee el servidor con service role.
 *
 * En `redes_dias` un null es "esa métrica no vino" (Meta no la da para esa red
 * o la cuenta no llega al mínimo de seguidores), no un cero.
 *
 * Revertir: supabase/revertir/20261026_01_redes_meta.sql
 */

create table if not exists social_cuentas (
  destino text primary key check (destino in ('instagram', 'linkedin', 'facebook')),
  cuenta_id text not null,
  cuenta_nombre text,
  access_token text not null,
  refresh_token text,
  expira_at timestamptz,
  actualizado_at timestamptz not null default now()
);

create table if not exists redes_dias (
  red text not null check (red in ('instagram', 'facebook')),
  fecha date not null,
  alcance integer,
  vistas integer,
  interacciones integer,
  me_gusta integer,
  comentarios integer,
  compartidos integer,
  guardados integer,
  clics_enlace integer,
  visitas_perfil integer,
  seguidores_nuevos integer,
  seguidores_perdidos integer,
  -- Foto del total al correr el cron: Meta no da la serie histórica.
  seguidores_total integer,
  actualizado_en timestamptz not null default now(),
  primary key (red, fecha)
);

create table if not exists redes_publicaciones (
  red text not null check (red in ('instagram', 'facebook')),
  id text not null,
  fecha timestamptz,
  tipo text,
  texto text,
  url text,
  miniatura text,
  alcance integer,
  vistas integer,
  me_gusta integer,
  comentarios integer,
  compartidos integer,
  guardados integer,
  interacciones integer,
  actualizado_en timestamptz not null default now(),
  primary key (red, id)
);

create index if not exists redes_publicaciones_fecha on redes_publicaciones (red, fecha desc);

create table if not exists redes_sincronizaciones (
  id uuid primary key default gen_random_uuid(),
  red text not null check (red in ('instagram', 'facebook')),
  corrido_en timestamptz not null default now(),
  origen text not null default 'cron' check (origen in ('cron', 'manual')),
  ok boolean not null,
  dias integer not null default 0,
  publicaciones integer not null default 0,
  detalle text
);

create index if not exists redes_sincronizaciones_cuando on redes_sincronizaciones (red, corrido_en desc);

alter table social_cuentas enable row level security;
alter table redes_dias enable row level security;
alter table redes_publicaciones enable row level security;
alter table redes_sincronizaciones enable row level security;
