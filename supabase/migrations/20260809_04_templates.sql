-- Templates de pieza, guardados y versionados.
--
-- Hasta ahora vivian en codigo: editar una receta era editar un archivo y
-- desplegar, sin historia. Eso alcanza mientras se escriben; no alcanza cuando
-- se empiezan a calibrar, que es justo lo que sigue.
--
-- Dos tablas y no una: la receta cambia seguido y lo demas casi nunca. Guardar
-- el nombre y el "cuando usar" en cada version duplicaria datos que no cambian,
-- y encima haria ruido al comparar dos versiones.
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),

  -- Estable y legible: es lo que guardan las piezas generadas en template_id.
  slug text not null unique,

  nombre      text not null,
  cuando_usar text,
  lleva_foto  boolean not null default true,
  foto_color  boolean not null default false,

  activo boolean not null default true,
  orden  integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cada edicion de la receta es una fila. La vigente es la ultima por numero.
create table if not exists template_versiones (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates (id) on delete cascade,

  numero      integer not null,
  composicion text not null,
  -- Por que se cambio. Sin esto, un historial de diez versiones es ilegible:
  -- se ve QUE cambio pero nunca por que, que es lo unico que se necesita para
  -- decidir si volver atras.
  nota text,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,

  unique (template_id, numero)
);

create index if not exists template_versiones_idx
  on template_versiones (template_id, numero desc);

create index if not exists templates_activo_idx on templates (activo, orden);

alter table templates          enable row level security;
alter table template_versiones enable row level security;
