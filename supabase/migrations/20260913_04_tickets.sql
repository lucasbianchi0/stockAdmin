-- Ticketera: el tablero de actividades del equipo.
--
-- Un lugar donde cualquiera anota lo que hay que hacer, se lo asigna a alguien
-- y lo arrastra de columna cuando avanza. Nada más. No es un Jira: no hay
-- sprints, ni estimaciones, ni prioridades, ni subtareas, y la tentación de
-- agregarlas es exactamente lo que hay que resistir — el día que cargar un
-- ticket cueste más de veinte segundos, el equipo vuelve al WhatsApp.
--
-- POR QUE TODOS VEN TODO
--
-- No hay permiso por ticket ni tableros privados. El valor de la pantalla es
-- que alguien pueda mirarla y saber en qué anda el resto sin preguntar; con
-- tableros por persona, eso se pierde y quedan seis listas de tareas sueltas.
-- El filtro por avatar da la vista individual sin partir los datos.
--
-- POR QUE EL NOMBRE VA COPIADO Y NO SOLO EL ID
--
-- Misma razón que en `mensajes_plantilla`: `auth.users` vive en otro esquema y
-- no se puede joinear desde PostgREST, y listar cien tickets no puede costar
-- cien consultas. El id sirve para filtrar y para saber si el ticket es tuyo;
-- el nombre es lo que se dibuja. Si la persona deja el equipo, el ticket sigue
-- diciendo quién lo pidió.

/* ── Proyectos ─────────────────────────────────────────────────────────────── */

-- Firma biométrica, Ecommerce, Infraestructura. Una tabla y no un texto libre
-- en el ticket porque el agrupador de arriba tiene que dar una fila de chips
-- estable: con texto libre, "Firma biométrica" y "firma biometrica" serían dos
-- columnas distintas en el filtro y nadie volvería a usarlo.
create table if not exists ticket_proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 40),

  -- Índice dentro de la paleta de la pantalla (ver COLORES en src/lib/tickets.ts).
  -- Se guarda el número y no el hex: el día que la paleta cambie, cambia en un
  -- archivo y no en veinte filas.
  color smallint not null default 0 check (color between 0 and 7),

  created_at timestamptz not null default now()
);

-- Sin esto, dos personas crean "Ecommerce" el mismo día y el tablero queda con
-- dos chips iguales que filtran distinto.
create unique index if not exists ticket_proyectos_nombre_idx
  on ticket_proyectos (lower(btrim(nombre)));

/* ── Tickets ───────────────────────────────────────────────────────────────── */

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),

  titulo text not null check (length(btrim(titulo)) between 1 and 120),
  descripcion text,

  -- Las tres columnas del tablero, en su orden. Lista cerrada: una columna
  -- nueva es una decisión de equipo, no algo que se escriba en un campo.
  estado text not null default 'backlog'
    check (estado in ('backlog', 'progreso', 'hecho')),

  -- Opcional a propósito. Un ticket sin proyecto es un ticket suelto y está
  -- bien que exista: obligar a clasificar antes de anotar es la forma más
  -- rápida de que la gente no anote.
  proyecto_id uuid references ticket_proyectos (id) on delete set null,

  autor_id     uuid references auth.users (id) on delete set null,
  autor_nombre text not null,

  -- Sin asignar también es un estado válido: se anota primero y se reparte
  -- después.
  asignado_id     uuid references auth.users (id) on delete set null,
  asignado_nombre text,

  -- La posición dentro de su columna. Entero y no fraccionario: al soltar una
  -- tarjeta, la app manda la columna entera reordenada y el servidor reescribe
  -- los índices de 0 en adelante. Con decenas de tickets es una sola sentencia;
  -- a cambio, no hay que pensar nunca en el caso de los decimales agotándose.
  orden integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- El tablero pide siempre lo mismo: todo, ordenado por columna y posición.
create index if not exists tickets_tablero_idx on tickets (estado, orden);
create index if not exists tickets_asignado_idx on tickets (asignado_id);
create index if not exists tickets_proyecto_idx on tickets (proyecto_id);

alter table ticket_proyectos enable row level security;
alter table tickets enable row level security;

drop trigger if exists tickets_updated_at on tickets;
create trigger tickets_updated_at before update on tickets
  for each row execute function set_updated_at();

/* ── Reordenar ─────────────────────────────────────────────────────────────── */

-- Mover una tarjeta toca dos cosas a la vez: el estado de la que se arrastró y
-- la posición de todas las de la columna de destino. Como función y no como
-- veinte updates desde la app para que sea una transacción: si se corta a la
-- mitad, el tablero queda con dos tarjetas en la misma posición y el orden pasa
-- a depender del desempate, que no es ninguno.
create or replace function tickets_reordenar(p_estado text, p_ids uuid[])
returns void
language sql as $$
  update tickets t
     set estado = p_estado,
         orden  = pos.i
    from unnest(p_ids) with ordinality as pos(id, i)
   where t.id = pos.id
     and (t.estado is distinct from p_estado or t.orden is distinct from pos.i);
$$;

/* ── Semillas ──────────────────────────────────────────────────────────────── */

-- Dos proyectos para que la fila de chips nazca con algo y se entienda de qué
-- va el agrupador. No hay tickets de ejemplo: un tablero con tarjetas falsas
-- adentro es un tablero que nadie limpia.
insert into ticket_proyectos (nombre, color)
values ('Firma biométrica', 0), ('Ecommerce', 3)
on conflict do nothing;
