-- Generador de contenido con IA — imagen y texto a pedido libre.
--
-- Es un flujo distinto al banco de piezas: alla se producen lotes con el
-- sistema visual del feed; aca alguien de marketing escribe lo que necesita y
-- se lleva una imagen o un texto. No toca content_slots ni el historial de
-- titulares, que siguen siendo del banco.

/* ── Historial de generaciones ────────────────────────────────────────────── */

-- Una fila por resultado: cada variante de imagen es su propia fila, y las
-- variantes de un mismo pedido comparten grupo_id. Una iteracion ("modificar
-- este resultado") apunta a su origen, asi se puede reconstruir la cadena.
--
-- Es la base del historial, de los templates (un pedido guardado es parametros
-- + prompt) y de la edicion de imagenes que viene despues. Por eso el tipo es
-- un check abierto y no un booleano: el video entra agregando 'video'.
create table if not exists generador_historial (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in ('imagen', 'texto')),
  prompt        text not null,
  parametros    jsonb not null default '{}'::jsonb,
  -- Texto: el resultado. Imagen: null.
  texto         text,
  -- Imagen: donde vive el archivo en el bucket "generador".
  storage_path  text,
  mime_type     text,
  ancho         integer,
  alto          integer,
  modelo        text,
  grupo_id      uuid,
  origen_id     uuid references generador_historial (id) on delete set null,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists generador_historial_tipo_idx
  on generador_historial (tipo, created_at desc);

alter table generador_historial enable row level security;

/* ── Formatos de imagen guardados ─────────────────────────────────────────── */

-- Los estandar de redes viven en el codigo; aca solo los que arma el equipo.
-- Compartidos entre todos: un formato de banner de un evento lo usa cualquiera.
create table if not exists generador_formatos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  ancho       integer not null check (ancho between 64 and 4096),
  alto        integer not null check (alto between 64 and 4096),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table generador_formatos enable row level security;
