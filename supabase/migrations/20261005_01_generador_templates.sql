-- Generador de contenido con IA — templates.
--
-- Un template es un pedido guardado con nombre: el prompt (que puede llevar
-- variables {{asi}}) y los parametros del generador. Compartidos por todo el
-- equipo, igual que los formatos.

create table if not exists generador_templates (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('imagen', 'texto')),
  nombre       text not null,
  descripcion  text,
  prompt       text not null,
  parametros   jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists generador_templates_tipo_idx on generador_templates (tipo, nombre);

alter table generador_templates enable row level security;
