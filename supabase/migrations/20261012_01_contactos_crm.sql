/*
 * Contactos (Marketing) y CRM (Comercial).
 *
 * Dos tablas para dos momentos de la misma persona del otro lado:
 *
 *   · `contactos` es la base: quien es, donde trabaja, como se lo ubica. La
 *     carga marketing, a mano o con una planilla, y no dice nada del estado de
 *     una venta.
 *   · `crm_oportunidades` es el seguimiento: un contacto que alguien del equipo
 *     decidio trabajar. Va con dueño (`owner_id`) porque el CRM es de cada uno
 *     —el de Lucas, el de Sofia— y se mira de a uno.
 *
 * Un mismo contacto puede estar en el CRM de dos personas (dos productos, dos
 * areas), pero una sola vez en cada uno: eso es el `unique` de abajo, y es lo
 * que hace que mandarlo dos veces no lo duplique.
 *
 * Los nombres de las personas se copian al lado del id por lo mismo que en
 * `tickets`: PostgREST no puede hacer join contra `auth.users`, y sin la copia
 * cada listado tendria que pedir el equipo entero para dibujar un avatar.
 *
 * RLS habilitado y sin politicas: se llega solo por las rutas de la API, que
 * usan la service role y chequean el modulo antes de tocar nada.
 */

/* -- 1 - La base de contactos -------------------------------------------- */

create table if not exists contactos (
  id uuid primary key default gen_random_uuid(),

  empresa text not null,
  nombre text,
  apellido text,
  cargo text,
  departamento text,
  vertical text,
  email text,
  telefono text,
  observaciones text,

  -- El AM de la cuenta: quien del equipo atiende a esa empresa.
  am_id uuid references auth.users (id) on delete set null,
  am_nombre text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

-- Un mail es una persona: importar dos veces la misma planilla no tiene que
-- duplicar a nadie. Parcial porque hay contactos que se cargan sin mail.
create unique index if not exists contactos_email_uidx
  on contactos (lower(email)) where email is not null and email <> '';
create index if not exists contactos_empresa_idx on contactos (lower(empresa));
create index if not exists contactos_vertical_idx on contactos (vertical);
create index if not exists contactos_am_idx on contactos (am_id);
create index if not exists contactos_created_idx on contactos (created_at desc);

drop trigger if exists contactos_updated_at on contactos;
create trigger contactos_updated_at before update on contactos
  for each row execute function set_updated_at();

alter table contactos enable row level security;

/* -- 2 - El seguimiento --------------------------------------------------- */

create table if not exists crm_oportunidades (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid not null references contactos (id) on delete cascade,

  -- De quien es este CRM.
  owner_id uuid not null references auth.users (id) on delete cascade,
  owner_nombre text not null,

  producto text,

  estado text not null default 'nuevo'
    check (estado in ('nuevo', 'calificacion', 'propuesta', 'negociacion', 'ganada', 'perdida')),

  proxima_accion text,
  fecha_proxima date,
  ultimo_contacto date,

  probabilidad smallint not null default 10 check (probabilidad between 0 and 100),
  -- Lo que vale si se cierra. Alimenta el "cierre estimado" (monto x probabilidad).
  monto_usd numeric(14, 2),

  motivo_perdida text,
  notas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,

  unique (contacto_id, owner_id)
);

create index if not exists crm_oportunidades_owner_idx on crm_oportunidades (owner_id, estado);
create index if not exists crm_oportunidades_fecha_idx on crm_oportunidades (fecha_proxima);

drop trigger if exists crm_oportunidades_updated_at on crm_oportunidades;
create trigger crm_oportunidades_updated_at before update on crm_oportunidades
  for each row execute function set_updated_at();

alter table crm_oportunidades enable row level security;

/* -- 3 - El historial ----------------------------------------------------- */

-- Lo que paso con cada oportunidad, en orden. Los cambios de estado los anota
-- el servidor solo; las notas, llamadas y reuniones las escribe la persona.
create table if not exists crm_actividades (
  id uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references crm_oportunidades (id) on delete cascade,

  tipo text not null default 'nota'
    check (tipo in ('nota', 'cambio_estado', 'llamada', 'reunion', 'email', 'alta')),
  texto text not null,

  autor_id uuid references auth.users (id) on delete set null,
  autor_nombre text,

  created_at timestamptz not null default now()
);

create index if not exists crm_actividades_op_idx on crm_actividades (oportunidad_id, created_at desc);

alter table crm_actividades enable row level security;
