/*
 * Versiones de Google Ads — el changelog de la cuenta.
 *
 * Cada tanda de cambios en las campañas es una versión: qué se tocó, por qué,
 * con qué dato se decidió y qué se espera ver. Existe porque la cuenta la tocan
 * varias manos (Lucas desde la interfaz, Claude por API) y sin un registro
 * propio el único historial es el de Google, que dice QUÉ cambió pero nunca POR
 * QUÉ — y tres semanas después nadie se acuerda.
 *
 * Es una tabla y no un archivo del repo para que una versión nueva se cargue
 * en el momento del cambio, sin esperar un deploy.
 *
 * Aditiva: no toca ninguna tabla existente. Revertir: drop table ads_versiones;
 */

create table if not exists ads_versiones (
  id uuid primary key default gen_random_uuid(),
  -- "2.3". Texto y no número: se ordena por fecha, esto es la etiqueta.
  numero text not null unique,
  fecha date not null,
  titulo text not null,
  resumen text not null,
  autor text not null default 'Claude',
  /*
   * [{ tipo, campana, que, antes, despues, porque, dato }]
   *   tipo:    presupuesto | puja | keywords | negativas | anuncio |
   *            segmentacion | medicion | estado
   *   antes/despues: opcionales, para los cambios que son un valor.
   */
  cambios jsonb not null default '[]'::jsonb,
  -- Lo que se espera ver y cuándo mirarlo. Sin esto una versión no se puede
  -- juzgar: no hay contra qué comparar.
  esperado text,
  revisar_el date,
  estado text not null default 'en_curso' check (estado in ('en_curso', 'verificada', 'revertida')),
  -- Lo que pasó de verdad, cuando se revisa.
  resultado text,
  created_at timestamptz not null default now()
);

create index if not exists ads_versiones_fecha_idx on ads_versiones (fecha desc, numero desc);

alter table ads_versiones enable row level security;
