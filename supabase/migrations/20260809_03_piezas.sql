-- Historial de piezas generadas.
--
-- Guarda la imagen Y el prompt exacto con el que salio. Lo segundo es lo que
-- hace util al historial: las recetas de los templates se van a editar, asi que
-- una pieza de hoy y una de dentro de un mes no salieron de la misma
-- instruccion. Sin el prompt guardado, comparar dos piezas no dice nada — no se
-- puede saber si mejoro el template, el titular o fue suerte.
create table if not exists piezas_generadas (
  id uuid primary key default gen_random_uuid(),

  -- Que template se uso. Texto y no FK: los templates viven en codigo y sus ids
  -- pueden cambiar; una pieza vieja tiene que sobrevivir a que se borre el suyo.
  template_id  text not null,
  template_nombre text,

  -- Los tres datos que varian por pieza.
  titular  text not null,
  etiqueta text,
  sujeto   text,

  -- El prompt completo, tal cual viajo al modelo.
  prompt text not null,
  modelo text,

  storage_path text not null unique,
  mime_type    text not null default 'image/jpeg',

  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists piezas_template_idx on piezas_generadas (template_id, created_at desc);
create index if not exists piezas_fecha_idx on piezas_generadas (created_at desc);

alter table piezas_generadas enable row level security;
