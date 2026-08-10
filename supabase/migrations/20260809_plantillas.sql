-- Plantillas visuales: las piezas de referencia que se le pasan al generador de
-- imagenes para que copie el lenguaje visual.
--
-- Por que una tabla y no solo archivos en Storage: lo que hace util a una
-- referencia no es el archivo, es saber CUANDO usarla. "Placa de dato duro
-- sobre navy" y "foto de obra con banda inferior" son dos plantillas que se
-- eligen para piezas distintas, y ese criterio hay que poder escribirlo,
-- editarlo y ordenarlo. En el nombre del archivo no entra.
--
-- El archivo vive en el bucket `plantillas` de Storage; aca queda su ruta.

create table if not exists plantillas (
  id uuid primary key default gen_random_uuid(),

  nombre      text not null,
  -- Cuando conviene esta y no otra. Es lo que lee el modelo para recomendar.
  cuando_usar text,

  -- Ruta dentro del bucket. El archivo se sirve con URL firmada, no publica:
  -- son piezas de marca sin publicar todavia.
  storage_path text not null unique,
  mime_type    text not null default 'image/jpeg',

  -- Una plantilla desactivada no se ofrece ni se recomienda, pero no se borra:
  -- las piezas que ya se generaron con ella siguen teniendo sentido.
  activa boolean not null default true,
  orden  integer not null default 0,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists plantillas_activa_idx on plantillas (activa, orden);

alter table plantillas enable row level security;

-- Igual que el resto del modulo: se accede por las rutas de /api, que usan la
-- service role key y chequean permisos con exigirModulo(). Sin politicas, el
-- cliente con anon key no lee nada, que es lo que queremos.
