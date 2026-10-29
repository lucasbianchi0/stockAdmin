-- Calendario del equipo: personas, agentes y procesos en una sola grilla.
--
-- Lo que hace una persona (una reunión, mandar el informe del mes) y lo que
-- hace una máquina (traer el inventario de Distecna, revisar las campañas de
-- Ads) se planifican y se miran en el mismo lugar. Separarlos en dos pantallas
-- es justamente lo que hace que nadie note que el lunes a la mañana el agente
-- de Ads y la persona que tiene que leer su informe no coinciden.
--
-- DOS TABLAS
--
--   calendario_entradas  lo que está planificado: qué, cuándo, cada cuánto y
--                        quién se hace cargo. Una fila por cosa, no por día:
--                        "todos los lunes a las 9" es una fila con repetición,
--                        y la pantalla la despliega en ocurrencias.
--   calendario_corridas  lo que de verdad pasó. Cada proceso o agente avisa
--                        cuando corre (bien o mal) con su `clave`. Es lo que
--                        permite que el calendario diga "el lunes no corrió"
--                        en vez de mostrar una tarjeta que solo promete.
--
-- POR QUE UNA TABLA PARA LOS TRES TIPOS
--
-- Una reunión semanal y un cron semanal tienen la misma forma: fecha, hora,
-- repetición, responsables. Lo que cambia es el color y que el proceso tiene
-- corridas. Con tres tablas, la grilla haría tres consultas y tres despliegues
-- de repetición que algún día se separan.
--
-- La hora es la de Argentina, sin zona: el equipo y los crons se piensan en
-- horario de Buenos Aires, que no tiene horario de verano.

create table if not exists calendario_entradas (
  id uuid primary key default gen_random_uuid(),

  -- persona: lo hace alguien del equipo · agente: un modelo que analiza y
  -- propone · proceso: un script que mueve datos y no decide nada.
  tipo text not null check (tipo in ('persona', 'agente', 'proceso')),

  titulo text not null check (length(btrim(titulo)) between 1 and 120),
  descripcion text,

  -- La primera ocurrencia (o la única, si no se repite).
  fecha date not null,
  -- Sin hora = todo el día.
  hora time,
  duracion_min integer not null default 60 check (duracion_min between 5 and 1440),

  -- `continua` es para lo que corre cada pocos minutos (la publicación
  -- programada): no se dibuja en la grilla —serían 96 tarjetas por día— y va
  -- en el panel de procesos con su última corrida.
  repeticion text not null default 'nunca'
    check (repeticion in ('nunca', 'diaria', 'semanal', 'mensual', 'continua')),
  -- Para `semanal`: 0 = domingo … 6 = sábado. Vacío = el día de `fecha`.
  dias_semana smallint[] not null default '{}',
  -- Para `continua`: cada cuántos minutos.
  intervalo_min integer check (intervalo_min is null or intervalo_min between 1 and 1440),
  -- Último día en que se repite. Sin tope = para siempre.
  hasta date,

  -- Quiénes: los que lo hacen, si es de una persona; los que lo miran y
  -- responden si falla, si es de una máquina. Id y nombre copiados por la
  -- misma razón que en la ticketera: auth.users no se joinea desde PostgREST.
  personas jsonb not null default '[]'::jsonb,

  -- Con qué corre un agente o un proceso. Informativo: el calendario no
  -- dispara nada, lo que manda es el workflow o la rutina de verdad.
  ejecutor text check (ejecutor is null or ejecutor in ('github', 'claude', 'vercel', 'local', 'otro')),
  -- El nombre con el que el proceso avisa sus corridas. Única: dos entradas
  -- con la misma clave se repartirían las corridas al azar.
  clave text unique check (clave is null or clave ~ '^[a-z0-9][a-z0-9-]{1,60}$'),

  -- planificado: todavía no existe (el agente del blog) · pausado: existe y no
  -- corre. Ninguno de los dos marca "no corrió" en los días pasados.
  estado text not null default 'activo' check (estado in ('activo', 'planificado', 'pausado')),

  autor_id uuid references auth.users (id) on delete set null,
  autor_nombre text not null default 'Sistema',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendario_entradas_fecha_idx on calendario_entradas (fecha);

create table if not exists calendario_corridas (
  id uuid primary key default gen_random_uuid(),
  -- Texto y no FK: el proceso avisa aunque la entrada todavía no esté cargada,
  -- y la corrida aparece apenas alguien la crea con esa clave.
  clave text not null,
  inicio timestamptz not null default now(),
  fin timestamptz,
  ok boolean not null,
  -- Qué hizo o por qué falló, en una línea: "312 productos", "token vencido".
  detalle text,
  origen text not null default 'cron' check (origen in ('cron', 'manual', 'agente')),
  created_at timestamptz not null default now()
);

create index if not exists calendario_corridas_clave_idx on calendario_corridas (clave, inicio desc);

alter table calendario_entradas enable row level security;
alter table calendario_corridas enable row level security;

/* ── Lo que ya corre, y lo que viene ───────────────────────────────────────── */

-- Los horarios son los de los workflows (en UTC allá, en Argentina acá). Los
-- agentes semanales nacen planificados: la fila deja el lugar reservado en la
-- semana y se pasa a activo el día que la rutina exista.
insert into calendario_entradas
  (tipo, titulo, descripcion, fecha, hora, duracion_min, repeticion, dias_semana, intervalo_min, ejecutor, clave, estado)
values
  ('proceso', 'Inventario de Distecna',
   'Trae productos, precios y stock del mayorista. Workflow sync-products.yml (03:00 UTC).',
   '2026-10-01', '00:00', 15, 'diaria', '{}', null, 'github', 'sync-productos', 'activo'),
  ('proceso', 'Métricas de Instagram y Facebook',
   'Trae de Meta alcance, vistas y publicaciones de los últimos cuatro días. Workflow redes.yml (10:00 UTC). Pasa a activo cuando las cuentas estén conectadas.',
   '2026-10-01', '07:00', 15, 'diaria', '{}', null, 'github', 'redes-meta', 'planificado'),
  ('proceso', 'Publicación programada',
   'Publica en LinkedIn y Meta lo que está agendado en el Calendario de contenido. Workflow publicar.yml.',
   '2026-10-01', null, 5, 'continua', '{}', 15, 'github', 'publicar-contenido', 'activo'),
  ('agente', 'Revisión semanal de Google Ads',
   'Lee la semana de las campañas (gasto, conversiones, términos de búsqueda), la compara con la anterior y propone cambios. Lo que se aplique se carga en Versiones de Ads.',
   '2026-10-05', '09:00', 60, 'semanal', '{1}', null, 'claude', 'agente-ads', 'planificado'),
  ('agente', 'Revisión semanal de LinkedIn',
   'Analiza seguidores, alcance y publicaciones de la página. Hasta que llegue la API, sobre el .xls importado en Resultados.',
   '2026-10-06', '09:00', 60, 'semanal', '{2}', null, 'claude', 'agente-linkedin', 'planificado'),
  ('agente', 'Revisión semanal de Instagram y Facebook',
   'Analiza la semana de las dos redes sobre lo que trae el proceso diario de Meta y propone qué publicar.',
   '2026-10-07', '09:00', 60, 'semanal', '{3}', null, 'claude', 'agente-redes', 'planificado'),
  ('agente', 'Notas del blog',
   'Redacta las notas de /recursos y las deja en Marketing → Notas para revisar. Arranca en dos por semana.',
   '2026-10-06', '10:00', 60, 'semanal', '{2,4}', null, 'claude', 'agente-blog', 'planificado')
on conflict (clave) do nothing;
