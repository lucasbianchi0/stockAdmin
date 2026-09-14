-- Ticketera, segunda vuelta: archivar y adjuntar imágenes.
--
-- DOS COSAS QUE FALTABAN Y SE NOTARON EN CUANTO SE USÓ
--
-- 1. "Hecho" crece para siempre. Un tablero donde la tercera columna tiene
--    ochenta tarjetas de los últimos cuatro meses deja de servir como tablero:
--    lo que importa —lo que se terminó esta semana— queda enterrado. Archivar
--    es lo que le devuelve el sentido a "Hecho": ahí está lo reciente, y lo
--    viejo sigue existiendo pero no ocupa pantalla.
--
-- 2. Un ticket sin foto se explica dos veces. "El botón se ve mal en el móvil"
--    con la captura al lado es un ticket; sin la captura es el principio de una
--    conversación por WhatsApp.

/* ── Archivado ─────────────────────────────────────────────────────────────── */

-- Un cuarto estado y no una columna `archivado boolean`: el ticket está en un
-- solo lugar a la vez y el estado ya es ese lugar. Con un booleano aparte
-- existiría "archivado y en progreso", que no quiere decir nada, y toda consulta
-- tendría que acordarse de filtrarlo.
--
-- No es una cuarta columna del tablero: es la salida. Los archivados se ven en
-- la lista de abajo, de donde se los puede devolver a Hecho.
alter table tickets drop constraint if exists tickets_estado_check;
alter table tickets add constraint tickets_estado_check
  check (estado in ('backlog', 'progreso', 'hecho', 'archivado'));

/* ── Imágenes ──────────────────────────────────────────────────────────────── */

-- Misma forma que `comprobante_adjuntos`, que ya resolvió esto: la fila guarda
-- la ruta dentro del bucket y nunca una URL. El bucket es privado y las URL se
-- firman al momento de listar, así que una dirección copiada de la pestaña deja
-- de servir sola en una hora.
create table if not exists ticket_imagenes (
  id uuid primary key default gen_random_uuid(),

  -- Si se borra el ticket se van sus imágenes. Los archivos en Storage los
  -- borra el handler; esta cascada es para que no quede la fila apuntando a un
  -- ticket que no existe.
  ticket_id uuid not null references tickets (id) on delete cascade,

  nombre text not null,
  ruta text not null unique,
  tipo_mime text,
  tamano integer,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ticket_imagenes_ticket_idx
  on ticket_imagenes (ticket_id, created_at);

alter table ticket_imagenes enable row level security;

-- Privado: todo pasa por los handlers, que ya chequean el módulo. Una captura
-- de un ticket puede tener adentro datos de un cliente.
insert into storage.buckets (id, name, public)
select 'tickets', 'tickets', false
where not exists (select 1 from storage.buckets where id = 'tickets');
