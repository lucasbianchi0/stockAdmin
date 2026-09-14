-- Eventos del sitio y sus certificados de asistencia.
--
-- Un workshop de Copilot, un webinar de firma biométrica, una capacitación en
-- un cliente: se cargan en Marketing → Eventos, la sección de eventos de
-- accedra.com.ar los lee de esta misma base, y cuando el evento pasó, desde la
-- misma ficha se emiten los certificados de quienes asistieron.
--
-- TRES TABLAS
--
--   marcas             → la biblioteca de logos (Copilot, Cisco, Wacom…). Se sube
--                        una vez y se reutiliza en cada evento y cada certificado.
--                        Subir el mismo PNG en cada workshop es la forma de terminar
--                        con cinco versiones del logo de Microsoft.
--   eventos            → la ficha pública y, en `certificado`, el diseño del
--                        certificado de ese evento.
--   evento_asistentes  → una fila por persona certificada, con su código de
--                        verificación.
--
-- POR QUE EL CERTIFICADO ES UN JSONB Y NO COLUMNAS
--
-- Es un documento de diseño: textos, contenidos, firmantes, variantes. Cambia
-- de forma cada vez que alguien pide "¿y si agregamos…?", y cada pedido así
-- sería una migración. Lo que se consulta (fechas, estado, tipo) sí va en
-- columnas; lo que sólo se dibuja, en el JSON. La forma válida la garantiza
-- `certificadoDe()` en src/lib/marketing/eventos-server.ts, que normaliza al leer.
--
-- POR QUE `marca_ids` ES UN ARRAY Y NO UNA TABLA INTERMEDIA
--
-- El orden importa (el primer logo es el protagonista) y nunca se consulta al
-- revés ("¿en qué eventos está Cisco?"). Si se borra una marca, el id queda
-- colgado y se ignora al leer: un logo menos en un evento viejo, no un error.

/* ── Marcas ────────────────────────────────────────────────────────────────── */

create table if not exists marcas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) between 1 and 40),
  -- Objeto en el bucket público `eventos`, bajo `marcas/`. PNG recortado al
  -- borde de la tinta: ver `subirLogo()`.
  logo_ruta text not null,
  logo_ancho int,
  logo_alto int,
  created_at timestamptz not null default now()
);

create unique index if not exists marcas_nombre_idx on marcas (lower(nombre));

/* ── Eventos ───────────────────────────────────────────────────────────────── */

create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),

  -- La dirección pública: accedra.com.ar/eventos/<slug>. Se genera del título
  -- al crear y NO cambia sola al editar el título: un link compartido en
  -- LinkedIn no puede romperse por corregir una coma.
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),

  publicado boolean not null default false,
  -- Uno destacado ocupa la card grande de la sección. Si hay varios, gana el
  -- más próximo.
  destacado boolean not null default false,

  tipo text not null default 'workshop'
    check (tipo in ('workshop', 'webinar', 'capacitacion', 'charla', 'meetup', 'lanzamiento')),
  modalidad text not null default 'presencial'
    check (modalidad in ('presencial', 'online', 'hibrido')),

  titulo text not null check (length(titulo) between 1 and 90),
  -- La línea de la card. La descripción larga es para la página del evento.
  resumen text check (resumen is null or length(resumen) <= 220),
  descripcion text check (descripcion is null or length(descripcion) <= 4000),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),

  inicio timestamptz not null,
  fin timestamptz,
  check (fin is null or fin > inicio),

  lugar text check (lugar is null or length(lugar) <= 120),
  inscripcion_url text check (
    inscripcion_url is null or inscripcion_url ~ '^(https?://|/|mailto:)'
  ),
  cupo int check (cupo is null or cupo > 0),
  -- Texto libre a propósito: "Sin costo", "USD 150 + IVA", "Sólo clientes".
  precio text check (precio is null or length(precio) <= 40),

  -- [{ nombre, cargo, empresa }]
  oradores jsonb not null default '[]'::jsonb,

  -- Las tecnologías del evento, en orden. Son también las del certificado
  -- salvo que el certificado elija otras.
  marca_ids uuid[] not null default '{}',

  portada_ruta text,
  portada_ancho int,
  portada_alto int,

  certificado jsonb not null default '{}'::jsonb,

  autor_id uuid references auth.users (id) on delete set null,
  autor_nombre text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La consulta del sitio: publicados, ordenados por fecha.
create index if not exists eventos_publicados_idx on eventos (inicio desc) where publicado;

create or replace function eventos_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists eventos_updated_at on eventos;
create trigger eventos_updated_at before update on eventos
  for each row execute function eventos_touch();

/* ── Asistentes ────────────────────────────────────────────────────────────── */

create table if not exists evento_asistentes (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos (id) on delete cascade,

  nombre text not null check (length(nombre) between 1 and 80),
  email text check (email is null or length(email) <= 160),
  empresa text check (empresa is null or length(empresa) <= 80),

  -- Si una persona se fue a la mitad, se le certifican sus horas y no las del
  -- evento. Null = las del certificado.
  horas numeric(5, 1) check (horas is null or horas > 0),

  -- Lo que va impreso y lo que valida accedra.com.ar/certificados/<codigo>.
  -- Único en toda la tabla, no por evento: el código solo tiene que alcanzar
  -- para encontrar el certificado.
  codigo text not null unique check (codigo ~ '^[A-Z0-9-]{8,20}$'),

  created_at timestamptz not null default now()
);

create index if not exists evento_asistentes_evento_idx
  on evento_asistentes (evento_id, nombre);

/* ── Bucket ────────────────────────────────────────────────────────────────── */

-- Público, igual que el de popups: las portadas y los logos los carga cualquier
-- visitante del sitio, y una URL firmada vencería en la card de un evento que
-- alguien abrió una hora después.
insert into storage.buckets (id, name, public)
select 'eventos', 'eventos', true
where not exists (select 1 from storage.buckets where id = 'eventos');

alter table marcas enable row level security;
alter table eventos enable row level security;
alter table evento_asistentes enable row level security;
