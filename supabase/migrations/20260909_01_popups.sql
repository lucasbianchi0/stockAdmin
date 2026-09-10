-- Popups del sitio: lo que se anuncia en accedra.com.ar sin tocar el código.
--
-- El caso que lo motiva es siempre el mismo y siempre urgente: hay un evento el
-- jueves, una capacitación que abre inscripción, un aviso de que la oficina no
-- atiende. Hoy eso significa pedirle a alguien que edite el sitio, hacer un
-- deploy, y otro deploy para sacarlo cuando pasó — con lo cual nunca se saca.
-- Con esta tabla se prende y se apaga desde el backoffice, y el sitio lo lee.
--
-- POR QUE UNA TABLA Y NO UNA FILA EN `settings`
--
-- El popup del evento de octubre no se tira cuando termina: se apaga. En
-- noviembre se prende el siguiente, y el de octubre queda para clonarlo el año
-- que viene. Una sola fila de configuración obliga a pisar el anterior cada vez,
-- que es la forma más rápida de que nadie se anime a tocar la pantalla.
--
-- POR QUE LOS TEXTOS TIENEN TOPE EN LA BASE
--
-- Un popup es una pieza de diseño con medidas fijas, no un campo de texto. Con
-- 300 caracteres de título el modal se rompe en un celular y la persona que lo
-- cargó no se entera nunca —lo escribió en una pantalla de 27 pulgadas—. Los
-- `check` de largo son la última red: el formulario ya corta, el endpoint
-- también, y esto garantiza que ni un script ni una carga a mano metan algo que
-- el sitio no pueda dibujar bien. Los números coinciden con LIMITES en
-- src/lib/marketing/popups.ts; si cambian, cambian en los dos lados.
--
-- POR QUE NO HAY CONTADOR DE VISTAS ACA
--
-- El sitio ya tiene su propia analítica (`sessions` y `events`, en la misma
-- base). Las vistas y los clics del popup entran ahí como un evento más, con el
-- id del popup en `target`. Un contador propio en esta tabla sería un segundo
-- número que tarde o temprano no coincide con el primero.

create table if not exists popups (
  id uuid primary key default gen_random_uuid(),

  -- Nombre interno: nunca se muestra en el sitio. Es cómo se lo reconoce en la
  -- lista del backoffice cuando hay ocho y seis están apagados.
  nombre text not null check (length(nombre) between 1 and 60),

  activo boolean not null default false,

  -- ── Forma ────────────────────────────────────────────────────────────────
  -- 'modal' interrumpe (evento, lanzamiento); 'barra' avisa sin tapar nada
  -- (cambio de horario, aviso de feriado). La diferencia es cuánta atención se
  -- está pidiendo, y por eso se elige al cargar y no se deduce del contenido.
  formato text not null default 'modal' check (formato in ('modal', 'barra')),

  -- Dónde va la imagen dentro del modal. 'lateral' es el layout premium de
  -- escritorio (imagen a la izquierda, texto a la derecha); en celular siempre
  -- termina arriba, porque al lado no entra.
  imagen_pos text not null default 'lateral'
    check (imagen_pos in ('lateral', 'arriba', 'fondo')),

  -- ── Contenido ────────────────────────────────────────────────────────────
  -- La volanta de arriba de todo: "Evento", "Nuevo", "22 de octubre". Corta a
  -- propósito: es una etiqueta, no una frase.
  etiqueta text check (etiqueta is null or length(etiqueta) <= 24),

  titulo text not null check (length(titulo) between 1 and 60),

  descripcion text check (descripcion is null or length(descripcion) <= 180),

  -- Objeto dentro del bucket público `popup`. La URL pública se arma con el
  -- dominio de Supabase; no se guarda armada porque el proyecto puede cambiar
  -- de host y quedarían URLs muertas en la base.
  imagen_ruta text,
  imagen_ancho int,
  imagen_alto int,
  -- Para lectores de pantalla. Si está vacío la imagen va como decorativa
  -- (alt=""), que es lo correcto: peor que no describirla es leer "imagen.webp".
  imagen_alt text check (imagen_alt is null or length(imagen_alt) <= 120),

  -- ── Acción ───────────────────────────────────────────────────────────────
  cta_texto text check (cta_texto is null or length(cta_texto) <= 22),
  -- http/https o una ruta interna del sitio. El check ataja el "www.algo.com"
  -- sin protocolo, que el navegador interpreta como ruta relativa y lleva a un
  -- 404 del propio sitio.
  cta_url text check (
    cta_url is null or cta_url ~ '^(https?://|/|mailto:|tel:)'
  ),
  cta_nueva_pestana boolean not null default true,

  -- El texto del botón de descarte cuando se quiere algo más específico que
  -- "Cerrar" ("Ahora no", "No me interesa").
  cerrar_texto text check (cerrar_texto is null or length(cerrar_texto) <= 22),

  -- ── Cuándo ───────────────────────────────────────────────────────────────
  -- La ventana de vigencia. Es lo que evita el popup del evento que siguió
  -- online tres semanas después del evento: se carga con fecha de fin y se
  -- apaga solo.
  desde timestamptz,
  hasta timestamptz,
  check (desde is null or hasta is null or hasta > desde),

  -- Segundos hasta que aparece. Cero es agresivo y sube el rebote; el valor por
  -- defecto deja ver la página antes de interrumpir.
  demora_s int not null default 5 check (demora_s between 0 and 60),

  -- Cada cuánto se le vuelve a mostrar a la misma persona.
  --   siempre → en cada carga de página (sólo para probar)
  --   sesion  → una vez por visita
  --   dia     → una vez cada 24 horas
  --   unica   → una sola vez, para siempre
  frecuencia text not null default 'sesion'
    check (frecuencia in ('siempre', 'sesion', 'dia', 'unica')),

  -- ── Dónde ────────────────────────────────────────────────────────────────
  --   todas → cualquier página del sitio
  --   home  → sólo la portada
  --   rutas → sólo las que empiecen con alguno de los prefijos de `rutas`
  alcance text not null default 'todas'
    check (alcance in ('todas', 'home', 'rutas')),
  rutas text[] not null default '{}',

  -- ── Quién ────────────────────────────────────────────────────────────────
  -- Mismo criterio que en brochures y plantillas: el nombre va congelado para
  -- que el crédito sobreviva a la baja del usuario y para no consultar
  -- auth.users al listar.
  autor_id uuid references auth.users (id) on delete set null,
  autor_nombre text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La consulta del sitio es siempre la misma: los activos, el de mayor
-- prioridad. Con este índice parcial esa consulta no mira las filas apagadas,
-- que con el tiempo van a ser casi todas.
create index if not exists popups_activos_idx
  on popups (updated_at desc) where activo;

create or replace function popups_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists popups_updated_at on popups;
create trigger popups_updated_at before update on popups
  for each row execute function popups_touch();

/* ── El bucket ─────────────────────────────────────────────────────────────── */

-- Público, al revés que el de brochures.
--
-- La imagen la tiene que poder cargar cualquier visitante anónimo de
-- accedra.com.ar, y una URL firmada vence: el popup quedaría con la imagen rota
-- justo cuando alguien lo mira una hora después de que se generó la firma. Es
-- material de marketing hecho para publicarse, así que no hay nada que
-- proteger. Escribir sigue requiriendo la service role.
insert into storage.buckets (id, name, public)
select 'popup', 'popup', true
where not exists (select 1 from storage.buckets where id = 'popup');

alter table popups enable row level security;
