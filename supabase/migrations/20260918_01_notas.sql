-- Notas del sitio: el hub de contenido de accedra.com.ar/recursos.
--
-- Se cargan en Marketing → Notas, el sitio las lee de esta misma base y
-- aparecen sin un deploy, igual que los eventos y el popup.
--
-- PARA QUÉ EXISTE ESTA TABLA
--
-- El sitio compite hoy sólo por búsquedas transaccionales ("firma biométrica
-- para aseguradoras"): 43 URLs y un techo fijo. Las notas son las búsquedas
-- informativas —"¿qué validez legal tiene la firma biométrica?"— que son las
-- que un modelo generativo cita cuando alguien le pregunta. De ahí que la
-- tabla tenga columnas que un blog común no tiene: `respuesta`, `faqs` y
-- `fuentes` son las tres que deciden si una IA puede citar la nota.
--
-- POR QUÉ EL CUERPO ES MARKDOWN Y NO HTML
--
-- Lo escribe una persona en un textarea, no un editor visual. Markdown se lee
-- entero en la base, se versiona como texto y no puede traer un <script>: el
-- sitio arma el HTML con un renderizador propio que sólo conoce títulos,
-- párrafos, listas, citas y links (ver lib/notas-markdown.ts en los dos repos).
-- Guardar HTML sería guardar una decisión de diseño de hoy dentro del dato.
--
-- POR QUÉ `faqs` Y `fuentes` SON JSONB
--
-- Son listas de pares ({q, a} y {titulo, url}) que sólo se leen enteras y
-- nunca se consultan por adentro. Una tabla hija cada una serían dos joins
-- para dibujar una página que ya se lee por slug.

create table if not exists notas (
  id uuid primary key default gen_random_uuid(),

  -- La dirección pública: accedra.com.ar/recursos/<slug>. Se genera del título
  -- al crear y NO cambia sola al editar el título — misma regla que eventos: un
  -- link compartido o ya indexado no puede romperse por corregir una coma.
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 90),

  publicado boolean not null default false,
  -- La nota que ocupa la card grande del hub. Si hay varias, gana la más nueva.
  destacada boolean not null default false,

  -- Guía: la nota larga y completa de un tema (la que queremos que citen).
  -- Nota: una respuesta puntual. Caso: el antecedente concreto con cifras.
  tipo text not null default 'nota'
    check (tipo in ('guia', 'nota', 'caso')),

  -- El <h1> de la página. Lo que se lee en la card.
  titulo text not null check (length(titulo) between 1 and 110),
  -- El <title> de la pestaña y del resultado de Google. Vacío = el título.
  -- Existe separado porque el que gana la búsqueda ("Firma biométrica en
  -- Argentina: validez legal") y el que se lee en la página no siempre son el
  -- mismo, y Google corta a los ~60 caracteres.
  titulo_seo text check (titulo_seo is null or length(titulo_seo) <= 70),
  -- La meta description y la bajada de la card.
  resumen text check (resumen is null or length(resumen) <= 300),

  -- LA RESPUESTA DIRECTA. El primer bloque de la nota, en dos o tres oraciones
  -- que se puedan citar tal cual, sin leer el resto. Es lo que copia un modelo
  -- generativo cuando responde la pregunta que titula la nota.
  respuesta text check (respuesta is null or length(respuesta) <= 600),

  -- El cuerpo, en markdown.
  cuerpo text not null default '' check (length(cuerpo) <= 60000),

  -- A qué solución pertenece: los slugs de /soluciones/<slug>. Es lo que arma
  -- el link al final de la nota y lo que agrupa el hub.
  categoria text check (
    categoria is null or categoria in ('networking', 'firma-biometrica', 'consultoria', 'seguridad', 'software-ai')
  ),
  -- Industrias del sitio (bancos, seguros, jurídicos…). Enlaza la nota con la
  -- landing de solución × industria, que es el destino comercial del lector.
  industrias text[] not null default '{}' check (cardinality(industrias) <= 7),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),

  -- [{ q, a }] → FAQPage en el JSON-LD. Es el nodo que más rinde en GEO: los
  -- motores generativos citan estas respuestas casi textualmente.
  faqs jsonb not null default '[]'::jsonb,
  -- [{ titulo, url }] → las fuentes citadas, al pie. En temas legales es lo que
  -- separa una nota de una opinión, y es señal de E-E-A-T.
  fuentes jsonb not null default '[]'::jsonb,

  -- Quién firma la nota, que es distinto de quién la cargó en el backoffice.
  -- Google pide autor en el schema de Article y las IAs lo citan.
  autor text check (autor is null or length(autor) <= 80),
  autor_cargo text check (autor_cargo is null or length(autor_cargo) <= 90),

  portada_ruta text,
  portada_ancho int,
  portada_alto int,

  -- La fecha que se muestra y la que va en `datePublished`. Se elige a mano:
  -- una nota puede estar cargada hoy y publicarse el lunes. Se completa sola la
  -- primera vez que se publica (ver `filaDelCuerpo`).
  publicado_en timestamptz,
  -- `dateModified`. Sólo se toca cuando se revisa el contenido de verdad: si
  -- fuera `updated_at`, corregir una coma le diría a Google que la nota se
  -- actualizó, y a la tercera vez esa señal deja de valer.
  revisado_en timestamptz,

  -- Quién la cargó, para la lista del backoffice.
  autor_id uuid references auth.users (id) on delete set null,
  autor_nombre text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La consulta del sitio: publicadas, de la más nueva a la más vieja.
create index if not exists notas_publicadas_idx
  on notas (coalesce(publicado_en, created_at) desc) where publicado;

-- El hub filtra por solución.
create index if not exists notas_categoria_idx on notas (categoria) where publicado;

create or replace function notas_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists notas_updated_at on notas;
create trigger notas_updated_at before update on notas
  for each row execute function notas_touch();

/* ── Bucket ────────────────────────────────────────────────────────────────── */

-- Público, como el de eventos y el de popups: la portada de una nota la carga
-- cualquier visitante y una URL firmada vencería en la card.
insert into storage.buckets (id, name, public)
select 'notas', 'notas', true
where not exists (select 1 from storage.buckets where id = 'notas');

-- RLS activa y sin políticas, igual que el resto: sólo llega la service_role,
-- que es con la que consultan el backoffice y el sitio.
alter table notas enable row level security;
