-- Calendario de contenido a 15 dias.
--
-- Dos tablas y no una: el plan es la unidad que se genera de una sola vez (un
-- arco narrativo completo) y el slot es la unidad que se edita despues, de a
-- una. Meterlo todo en un jsonb obligaria a reescribir el plan entero cada vez
-- que alguien elige una opcion, con la carrera de escritura que eso implica si
-- dos personas trabajan el mismo calendario.
--
-- Un slot es una publicacion en una fecha y un canal. "meta" es un solo canal a
-- proposito: Instagram y Facebook publican exactamente lo mismo, asi que
-- separarlos duplicaria cada pieza de contenido para nada.

create table if not exists content_plans (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null,
  -- El arco narrativo de los 15 dias, en una frase. Es lo que despues se le
  -- pasa a Claude para regenerar un slot sin perder la coherencia del conjunto.
  arco          text,
  fecha_inicio  date not null,
  dias          integer not null default 15 check (dias between 1 and 31),
  -- Subconjunto de ('linkedin','meta'). Se guarda para poder regenerar slots
  -- con el mismo criterio con el que se genero el plan.
  canales       text[] not null,
  -- El texto libre que escribio el usuario al planear: fechas importantes,
  -- lanzamientos, lo que quiera que el plan tenga en cuenta.
  contexto      text,
  audiencia     text not null default 'ambos',
  archivado     boolean not null default false,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id) on delete set null
);

create table if not exists content_slots (
  id        uuid primary key default gen_random_uuid(),
  plan_id   uuid not null references content_plans (id) on delete cascade,
  fecha     date not null,
  canal     text not null check (canal in ('linkedin', 'meta')),
  -- Que rol cumple esta pieza dentro del arco (teaser, prueba social, CTA...).
  beat      text,
  -- Las 3 opciones que propuso Claude: [{id,titulo,hook,angulo,formato}].
  opciones  jsonb not null default '[]'::jsonb,
  -- El `id` de la opcion elegida dentro de `opciones`. Null = sin decidir.
  elegida   text,
  -- El contenido final: {caption, captionCorto, hashtags, cta, promptImagen}.
  contenido jsonb,
  orden     integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una sola publicacion por fecha y canal: el calendario es una grilla, no una
-- lista. Sin esto, dos generaciones seguidas apilan slots invisibles.
create unique index if not exists content_slots_fecha_canal_idx
  on content_slots (plan_id, fecha, canal);

create index if not exists content_slots_plan_idx on content_slots (plan_id, fecha);
create index if not exists content_plans_activo_idx
  on content_plans (archivado, created_at desc);

-- Los handlers de /api/contenido ya chequean el modulo "marketing" antes de
-- tocar la base (ver lib/guard-api.ts). RLS queda activo igual para que la
-- anon key no alcance por si sola: el acceso entra por el servidor o no entra.
alter table content_plans enable row level security;
alter table content_slots enable row level security;
