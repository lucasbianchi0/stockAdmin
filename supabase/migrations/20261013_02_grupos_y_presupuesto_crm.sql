/*
 * Grupos de contactos, y el presupuesto de una oportunidad.
 *
 * 1. GRUPOS
 *
 * Un grupo es una lista con nombre de personas de Contactos: "Bancos — firma
 * biométrica", "Asistentes al evento de octubre". Se arma seleccionando en la
 * tabla, o con todas las que coinciden con un filtro.
 *
 * Es la base de las campañas: cuando existan, una campaña va a tener un grupo
 * como destinatarios (un `grupo_id`), y lo que se mande, abra o responda va a
 * colgar de la campaña y de cada miembro. Por eso los miembros son una tabla
 * aparte con su propia fecha y no un array en el grupo: es la fila a la que
 * después se le van a pegar los envíos.
 *
 * Una persona puede estar en muchos grupos. Borrar un contacto lo saca de
 * todos; borrar un grupo no toca a las personas.
 *
 * 2. PRESUPUESTO DE UNA OPORTUNIDAD
 *
 * Desde el CRM se crea un presupuesto para la empresa de la oportunidad, y
 * queda enlazado: la oportunidad muestra su presupuesto y se llega en un click.
 */

/* -- 1 - Grupos ------------------------------------------------------------ */

create table if not exists contacto_grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_by_nombre text
);

-- Dos grupos con el mismo nombre son una confusión segura al elegir destinatarios.
create unique index if not exists contacto_grupos_nombre_uidx on contacto_grupos (lower(nombre));

drop trigger if exists contacto_grupos_updated_at on contacto_grupos;
create trigger contacto_grupos_updated_at before update on contacto_grupos
  for each row execute function set_updated_at();

alter table contacto_grupos enable row level security;

create table if not exists contacto_grupo_miembros (
  grupo_id uuid not null references contacto_grupos (id) on delete cascade,
  contacto_id uuid not null references contactos (id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by uuid references auth.users (id) on delete set null,
  primary key (grupo_id, contacto_id)
);

create index if not exists contacto_grupo_miembros_contacto_idx on contacto_grupo_miembros (contacto_id);

alter table contacto_grupo_miembros enable row level security;

/* -- 2 - El presupuesto de una oportunidad --------------------------------- */

alter table crm_oportunidades
  add column if not exists presupuesto_id uuid references presupuestos (id) on delete set null;
