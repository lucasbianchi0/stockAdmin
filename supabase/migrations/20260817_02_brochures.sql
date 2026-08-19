-- Brochures: el material que se le manda al cliente.
--
-- La propuesta de firma biométrica para bancos, el one-pager de networking, el
-- dossier institucional. Hoy cada uno vive en el Drive de quien lo armó o en un
-- mail de hace ocho meses, así que pasan dos cosas: se manda una versión vieja
-- —con precios que ya no son, con un partner que ya no está— o se rehace desde
-- cero un PDF que ya existía.
--
-- Esta tabla es el mismo trato que `mensajes_plantilla` hace con los textos,
-- aplicado a los archivos: uno solo, el vigente, con nombre y con criterio de
-- uso. Cualquiera lo sube y cualquiera lo reemplaza.
--
-- POR QUE UN SOLO ARCHIVO POR FILA Y NO UN HISTORIAL
--
-- Un brochure no tiene versiones que convivan: tiene una vigente y otras que ya
-- no se mandan. Guardar las viejas suena prudente hasta que alguien abre la
-- lista, ve tres PDF y manda el que no era —que es exactamente el problema que
-- este módulo viene a resolver—. Lo que sí se guarda es `version`, un número que
-- sube cada vez que se reemplaza el archivo: sirve para saber que el material se
-- actualizó sin tener que conservar lo que quedó obsoleto.
--
-- POR QUE SOLUCION E INDUSTRIA SON DOS COLUMNAS Y NO ETIQUETAS
--
-- Es el mismo eje 1:1:1 con el que ya están armadas las campañas y las landings
-- (campaña = solución, grupo = industria). Si acá fuera texto libre, el material
-- del sitio y el material que se manda por mail se clasificarían distinto, y el
-- día que alguien pregunte "qué tenemos para bancos" habría que mirar los dos
-- lados con criterios diferentes.
--
-- La industria admite `null` a propósito: el institucional y buena parte de los
-- one-pagers son transversales, y forzar una industria inventada haría que
-- aparecieran filtrados fuera justo cuando sirven.

create table if not exists brochures (
  id uuid primary key default gen_random_uuid(),

  titulo text not null,

  -- A qué servicio corresponde. Los slugs son los mismos que `SERVICIOS` en
  -- lib/brand-kit.ts; agregar uno es una migración, que es la fricción buscada.
  solucion text not null default 'institucional'
    check (solucion in (
      'networking',
      'firma-biometrica',
      'consultoria',
      'seguridad',
      'software-ai',
      'institucional',  -- La empresa entera, sin un servicio puntual
      'otra'
    )),

  -- `null` = sirve para cualquier industria. No es un dato faltante: es la
  -- respuesta correcta para el institucional y para los one-pagers genéricos.
  industria text
    check (industria is null or industria in (
      'bancos',
      'aseguradoras',
      'juridicos',
      'salud',
      'logistica',
      'retail'
    )),

  -- Qué dice el material adentro. Es lo que evita tener que abrir cuatro PDF
  -- para encontrar el que tiene el caso de Banco Provincia.
  descripcion text,

  -- Cuándo mandar este y no otro. Mismo rol que en las plantillas de mensajes:
  -- es lo que permite elegir sin leer todo.
  cuando_usar text,

  etiquetas text[] not null default '{}',

  /* ── El archivo ─────────────────────────────────────────────────────────── */

  -- La ruta dentro del bucket `brochures`. No la URL: el bucket es privado y las
  -- URL firmadas vencen, así que guardarlas sería guardar algo que deja de
  -- servir.
  archivo_ruta text not null unique,

  -- El nombre con el que se subió, que es el nombre con el que se descarga. La
  -- ruta lleva un uuid para no pisar nada; si el cliente recibiera ese uuid como
  -- nombre de archivo, el adjunto llegaría ilegible.
  archivo_nombre text not null,
  archivo_tamano integer check (archivo_tamano >= 0),

  -- Sube de a uno cada vez que se reemplaza el PDF. Ver el encabezado.
  version integer not null default 1,

  /* ── Autoría y uso ──────────────────────────────────────────────────────── */

  autor_id     uuid references auth.users (id) on delete set null,
  -- Copiado y no joineado, por el mismo motivo que en `mensajes_plantilla`: el
  -- crédito tiene que sobrevivir a que la persona deje el equipo.
  autor_nombre text not null,
  editor_nombre text,

  -- Cuántas veces se abrió o descargó. La única señal de cuáles se usan de
  -- verdad: un brochure con cero descargas en un trimestre es material que hay
  -- que rehacer o dar de baja.
  descargas integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brochures_solucion_idx on brochures (solucion);
create index if not exists brochures_industria_idx on brochures (industria);
create index if not exists brochures_autor_idx on brochures (autor_id);
create index if not exists brochures_fecha_idx on brochures (updated_at desc);

alter table brochures enable row level security;

/* ── Fecha de edición ──────────────────────────────────────────────────────── */

-- Igual que en las plantillas de mensajes: descargar no es editar. Con el
-- trigger genérico, abrir un PDF reordenaría la lista y el material se vería
-- "actualizado hace 2 minutos" sin que nadie lo haya tocado.
create or replace function brochures_touch() returns trigger
language plpgsql as $$
begin
  if (to_jsonb(new) - 'descargas' - 'updated_at')
     is not distinct from
     (to_jsonb(old) - 'descargas' - 'updated_at') then
    return new;
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists brochures_updated_at on brochures;
create trigger brochures_updated_at before update on brochures
  for each row execute function brochures_touch();

/* ── Contador de descargas ─────────────────────────────────────────────────── */

-- Como función y no como update desde la app: el patrón leer-sumar-guardar
-- pierde cuentas cuando dos personas abren el mismo brochure a la vez.
create or replace function brochure_descargado(p_id uuid) returns integer
language sql as $$
  update brochures
     set descargas = descargas + 1
   where id = p_id
  returning descargas;
$$;

/* ── El bucket ─────────────────────────────────────────────────────────────── */

-- Privado, aunque el material sea para mandar afuera.
--
-- Un brochure se manda a quien uno elige, no a quien adivine la dirección: acá
-- adentro conviven borradores, propuestas con precios y material que todavía no
-- se publicó. Cada descarga pide una URL firmada de vida corta.
insert into storage.buckets (id, name, public)
select 'brochures', 'brochures', false
where not exists (select 1 from storage.buckets where id = 'brochures');
