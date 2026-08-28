-- Publicación automática — el estado que le falta a una pieza para poder salir sola.
--
-- Hasta acá una pieza programada tenía una fecha y nada más: `programada` dice
-- qué día sale, pero no a qué hora, ni si ya salió, ni con qué id quedó del otro
-- lado. Sin eso no hay forma de que un cron la publique sin publicarla dos veces.
--
-- Las columnas van sobre content_slots y no en una tabla aparte por la misma
-- razón que el banco es content_slots: el pipeline entero —contenido, template,
-- imagen— trabaja sobre un slot id. Una tabla de publicaciones obligaría a
-- mantener las dos en sincronía y el primer día que se desincronicen, publicamos
-- una imagen vieja con un caption nuevo.

/* ── Cuándo sale, y si ya salió ───────────────────────────────────────────── */

-- La hora exacta. `programada` es date y no alcanza: publicar a medianoche UTC
-- es publicar a las 21 del día anterior en Argentina, que es justo cuando nadie
-- mira. Es timestamptz para que el cron compare contra now() sin hacer
-- aritmética de zonas horarias en el código, que es donde esto siempre se rompe.
--
-- Nullable: una pieza en el banco no tiene fecha, y una pieza programada de
-- antes de esta migración tampoco tiene hora. El backfill de abajo se ocupa.
alter table content_slots add column if not exists publicar_at timestamptz;

-- 'inactiva' y no 'pendiente' como default, a propósito. Todas las filas que ya
-- existen son piezas que se venían publicando a mano; si nacieran en 'pendiente'
-- el primer tick del cron saldría a publicar meses de calendario de una sentada.
-- Una pieza entra en la cola cuando alguien la pone ahí, nunca por default.
alter table content_slots add column if not exists estado_publicacion text not null default 'inactiva'
  check (estado_publicacion in ('inactiva', 'pendiente', 'publicando', 'publicado', 'error'));

-- El id que devolvió la plataforma. Es la prueba de que la pieza salió: mientras
-- sea null, republicar es seguro; con valor, republicar duplica el post.
-- Por eso la recuperación de trabajos colgados de más abajo lo mira a él y no al
-- estado.
alter table content_slots add column if not exists post_externo_id text;

alter table content_slots add column if not exists publicado_at timestamptz;

-- El último error, en texto plano y visible. Un fallo de publicación es un fallo
-- silencioso por naturaleza —nadie se entera de que un post no salió— así que
-- tiene que quedar escrito en la fila que lo sufrió, no sólo en un log.
alter table content_slots add column if not exists error_publicacion text;

alter table content_slots add column if not exists intentos integer not null default 0;

-- Cuándo lo tomó el worker. Sirve para detectar los que quedaron colgados: un
-- proceso que muere entre el claim y la publicación deja la fila en 'publicando'
-- para siempre, y sin este timestamp no hay forma de distinguir "se está
-- publicando ahora" de "esto está trabado desde el martes".
alter table content_slots add column if not exists publicando_desde timestamptz;

/* ── Backfill: nada entra a la cola por accidente ─────────────────────────── */

-- Las piezas que ya tienen fecha reciben su hora, para que el día que alguien
-- las pase a 'pendiente' no haya que calcularla. Pero siguen en 'inactiva': se
-- les completa el cuándo, no el si.
update content_slots
   set publicar_at = (programada + time '13:00') at time zone 'America/Argentina/Buenos_Aires'
 where programada is not null and publicar_at is null;

/* ── El índice de la cola ─────────────────────────────────────────────────── */

-- La consulta del cron es una sola y corre cada 15 minutos: "lo pendiente que ya
-- venció". El WHERE parcial la deja en un índice de unas pocas filas aunque la
-- tabla tenga miles de piezas publicadas.
create index if not exists content_slots_cola_idx
  on content_slots (publicar_at)
  where estado_publicacion in ('pendiente', 'publicando');

/* ── Las cuentas conectadas ───────────────────────────────────────────────── */

-- Un token por destino. Tabla aparte y no variables de entorno porque los tokens
-- vencen y se renuevan solos: una variable de entorno hay que ir a cambiarla a
-- mano en Vercel y en GitHub, y el día que el refresh corra a las 3am no va a
-- poder escribir el resultado en ningún lado.
create table if not exists social_cuentas (
  -- 'instagram' | 'linkedin'. No es el `canal` del slot: 'meta' es un canal que
  -- puede tener dos destinos (Instagram y Facebook) y el día que se sume
  -- Facebook va a ser otra fila, no otra columna.
  destino        text primary key check (destino in ('instagram', 'linkedin', 'facebook')),

  -- A dónde se publica. Para Instagram es el IG User ID; para LinkedIn es el URN
  -- completo del autor —urn:li:person:xxx o urn:li:organization:123—, que es
  -- justamente lo único que cambia entre publicar en el perfil y publicar en la
  -- página de la empresa.
  cuenta_id      text not null,
  cuenta_nombre  text,

  access_token   text not null,
  refresh_token  text,
  -- Null significa "no vence" (token de usuario de sistema de Meta). Cualquier
  -- otro valor es una fecha que hay que mirar antes de que llegue, no después.
  expira_at      timestamptz,

  actualizado_at timestamptz not null default now()
);

-- Los tokens son credenciales de publicación: con la anon key no se tocan ni
-- para leer. El acceso entra por el servidor con service role, o no entra.
alter table social_cuentas enable row level security;

/* ── El claim atómico ─────────────────────────────────────────────────────── */

-- Esta función es la que evita el único error irreversible de todo el sistema:
-- publicar el mismo post dos veces. No hay "deshacer" del otro lado.
--
-- Dos ticks del cron pueden solaparse —uno que tardó, GitHub Actions que
-- reintenta, alguien que aprieta el botón manual mientras corre el automático— y
-- si los dos leen la cola con un select y después publican, los dos ven la misma
-- fila en 'pendiente'. Un select seguido de un update no alcanza: entre los dos
-- hay una ventana.
--
-- FOR UPDATE SKIP LOCKED es lo que la cierra. El segundo tick no espera a que el
-- primero termine ni ve las filas que el primero ya tomó: simplemente las saltea
-- y se lleva las que queden. Es el patrón de cola de trabajos de Postgres.
create or replace function reclamar_publicaciones(limite integer default 5)
returns setof content_slots
language plpgsql
-- Vacío no se puede: el cuerpo nombra content_slots. Se fija a public para que
-- no dependa del search_path de quien la llame.
set search_path = 'public'
as $$
begin
  return query
  update content_slots
     set estado_publicacion = 'publicando',
         publicando_desde   = now(),
         intentos           = intentos + 1
   where id in (
     select s.id
       from content_slots s
      where s.publicar_at <= now()
        and (
          s.estado_publicacion = 'pendiente'
          or (
            -- Los colgados: alguien los tomó y nunca los cerró. Se reintentan
            -- SOLO si no tienen post_externo_id, porque sin id no llegaron a
            -- publicarse. Con id, la pieza ya salió y volver a mandarla
            -- duplicaría el post.
            s.estado_publicacion = 'publicando'
            and s.post_externo_id is null
            and s.publicando_desde < now() - interval '15 minutes'
          )
        )
        -- Tres intentos y para. Un caption que la plataforma rechaza por
        -- longitud va a fallar las mil veces, y reintentar para siempre gasta
        -- cuota de API que después falta para los posts que sí pueden salir.
        and s.intentos < 3
      order by s.publicar_at
      limit limite
      for update skip locked
   )
  returning *;
end;
$$;
