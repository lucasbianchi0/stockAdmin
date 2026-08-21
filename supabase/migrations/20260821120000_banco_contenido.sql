-- Banco de contenido — piezas sueltas que se generan de a lotes y despues se
-- programan en el calendario.
--
-- Es un flujo distinto al de los planes de 15 dias, no un reemplazo. Alla se
-- genera un arco cerrado con una fecha por pieza desde el principio; aca se
-- genera un lote de ocho piezas SIN fecha, se revisan, se editan y recien
-- cuando convencen se les asigna un dia. Los dos conviven: esta migracion no
-- borra ni cambia nada de lo que ya funciona.
--
-- LA DECISION DE FONDO: las piezas del banco son filas de content_slots, no una
-- tabla nueva. Toda la generacion de imagenes —prompt-feed, la placa, la subida
-- al bucket— trabaja sobre un slot id, y ese pipeline anda bien. Una tabla
-- aparte obligaria a bifurcar las tres rutas, que es exactamente la forma de
-- romper lo que hoy funciona.

/* ── De que tipo es cada plan ─────────────────────────────────────────────── */

-- Un plan del banco es un contenedor, no un arco: existe solo porque
-- content_slots.plan_id es not null y hay que colgar las piezas de algun lado.
-- Hay uno por canal y se crea solo la primera vez que se genera un lote.
alter table content_plans add column if not exists tipo text not null default 'calendario'
  check (tipo in ('calendario', 'banco'));

create index if not exists content_plans_tipo_idx on content_plans (tipo, created_at desc);

/* ── De donde salio cada pieza ────────────────────────────────────────────── */

-- Default 'calendario': todas las filas que ya existen son del flujo viejo y
-- siguen comportandose igual, incluido el indice unico de abajo.
alter table content_slots add column if not exists origen text not null default 'calendario'
  check (origen in ('calendario', 'banco'));

-- La fecha en la que se va a publicar. Null mientras la pieza esta en el banco;
-- con valor, la pieza esta en el calendario.
--
-- Va en una columna nueva y no en "fecha" porque "fecha" es not null y se usa
-- desde el minuto cero para el orden dentro del lote. Que "todavia no tiene
-- fecha" sea representable es justamente lo que distingue este flujo del otro.
alter table content_slots add column if not exists programada date;

alter table content_slots add column if not exists programada_at timestamptz;

/* ── El indice unico, acotado al calendario ───────────────────────────────── */

-- "una publicacion por fecha y canal" es una regla del plan de 15 dias: la
-- grilla tiene un casillero por dia. En el banco las ocho piezas del lote nacen
-- sin fecha y comparten el placeholder, asi que la regla no aplica.
--
-- El indice se reemplaza por el mismo indice con un WHERE. Para toda fila que
-- ya existe —origen = 'calendario' por el default— la restriccion es
-- exactamente la de antes: no se afloja nada de lo que hoy esta protegido.
drop index if exists content_slots_fecha_canal_idx;

create unique index if not exists content_slots_fecha_canal_idx
  on content_slots (plan_id, fecha, canal)
  where origen = 'calendario';

/* ── Los indices del banco ────────────────────────────────────────────────── */

-- El banco de un canal: lo que todavia no se programo, en orden de generacion.
create index if not exists content_slots_banco_idx
  on content_slots (plan_id, origen, orden)
  where origen = 'banco';

-- La agenda: lo programado dentro de un rango de fechas. Es la consulta que
-- hace la vista de mes, y sin esto recorre la tabla entera cada vez que alguien
-- pasa de agosto a septiembre.
create index if not exists content_slots_programada_idx
  on content_slots (programada)
  where programada is not null;
