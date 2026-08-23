-- El historial de todo lo que se escribio, por canal.
--
-- Es la linea de publicaciones: cada titular que alguna vez se genero queda
-- anotado aca, para siempre, aunque la pieza se descarte, se publique o se
-- borre.
--
-- POR QUE UNA TABLA Y NO MIRAR content_slots. Hasta ahora "lo que ya se
-- escribio" se leia de las piezas vivas del banco, y eso tiene dos agujeros por
-- los que se colaba la repeticion:
--
--   1. Descartar una pieza LIBERABA su titular. La idea desaparecia de la
--      consulta y el proximo lote podia escribirla de nuevo — justo la que ya
--      se habia decidido que no servia.
--   2. La consulta traia las ultimas 40 y nada mas. Al lote 6 el banco ya no se
--      acordaba de lo que habia escrito en el lote 1.
--
-- Aca no se borra nunca. Una fila del historial no es contenido: es la memoria
-- de que ese titular ya existio.

create table if not exists content_historial (
  id         uuid primary key default gen_random_uuid(),
  canal      text not null check (canal in ('linkedin', 'meta')),

  -- La huella del titular: sin tildes, sin puntuacion, en minuscula.
  --
  -- Es la columna que hace el trabajo. "Cinco proveedores. Cero responsables." y
  -- "Cinco proveedores, cero responsables" son la misma pieza con una coma de
  -- diferencia y convivieron en el banco: comparando el texto tal cual, nada las
  -- veia. La normalizacion la calcula la aplicacion (`claveTitular`) para que
  -- sea exactamente la misma que usa el dedupe en memoria.
  clave      text not null,

  headline   text not null,
  titulo     text not null,
  tesis      text,

  -- De que hablo la pieza: la linea de servicio y el angulo con el que se
  -- conto. Se guardan para poder decirle al modelo que temas ya estan gastados,
  -- que es lo que evita las variantes de la misma idea con otras palabras.
  linea      text,
  eje        text,

  patron     text,
  objetivo   text,
  created_at timestamptz not null default now()
);

-- La garantia dura: dos titulares con la misma huella no pueden convivir en un
-- canal. El filtro de la aplicacion evita el viaje al modelo; esto evita que un
-- bug futuro lo saltee.
create unique index if not exists content_historial_canal_clave_idx
  on content_historial (canal, clave);

create index if not exists content_historial_canal_fecha_idx
  on content_historial (canal, created_at desc);

-- Backfill de lo que ya existe.
--
-- La normalizacion de aca tiene que dar lo mismo que `claveTitular`: NFD para
-- descomponer las tildes, se tiran los diacriticos, todo lo que no sea letra o
-- numero pasa a espacio, y se colapsan los espacios. `distinct on` se queda con
-- la primera de cada huella —la mas vieja— que es la que gana el lugar.
insert into content_historial (canal, clave, headline, titulo, tesis, patron, objetivo, created_at)
select distinct on (s.canal, clave)
  s.canal,
  clave,
  s.opciones -> 0 ->> 'headline',
  coalesce(s.opciones -> 0 ->> 'titulo', ''),
  s.opciones -> 0 ->> 'tesis',
  s.opciones -> 0 ->> 'patron',
  s.opciones -> 0 ->> 'objetivo',
  s.created_at
from (
  select
    cs.*,
    trim(regexp_replace(
      lower(regexp_replace(normalize(cs.opciones -> 0 ->> 'headline', NFD), '[̀-ͯ]', '', 'g')),
      '[^a-z0-9]+', ' ', 'g'
    )) as clave
  from content_slots cs
  where cs.origen = 'banco'
    and cs.opciones -> 0 ->> 'headline' is not null
    and cs.opciones -> 0 ->> 'headline' <> ''
) s
where s.clave <> ''
order by s.canal, clave, s.created_at
on conflict (canal, clave) do nothing;

alter table content_historial enable row level security;
