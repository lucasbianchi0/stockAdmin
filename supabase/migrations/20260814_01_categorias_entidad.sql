-- Categorías de clientes y proveedores.
--
-- Hoy un proveedor solo se puede buscar por nombre. Con veinte está bien; con
-- doscientos, la pregunta que aparece es "¿quiénes son mis proveedores de
-- networking?" y no hay forma de contestarla — hay que acordarse de los nombres.
--
-- POR QUE UNA TABLA Y NO UN CAMPO DE TEXTO
--
-- Un `categoria text` libre termina con "Networking", "networking", "NETWORKING"
-- y "Redes" como cuatro categorías distintas, y el filtro deja de servir
-- justo cuando empieza a hacer falta. Con una tabla, la lista es finita, se
-- elige de un selector y se puede renombrar en un solo lugar.
--
-- POR QUE UNA SOLA CATEGORIA Y NO ETIQUETAS
--
-- Con etiquetas múltiples, agrupar deja de ser posible: un proveedor que está en
-- tres etiquetas aparece tres veces en el total y la suma da más que el universo.
-- Una categoría por ficha es lo que permite decir "el 40% de lo que compramos es
-- networking" sin que el número mienta. Si más adelante hacen falta etiquetas
-- libres, se agregan aparte — son otra cosa y sirven para otra cosa.

create table if not exists categorias_entidad (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null,

  -- Una categoría de proveedor no tiene por qué aparecer en el selector de un
  -- cliente. `ambos` existe para las que sirven de los dos lados.
  tipo   text not null default 'proveedor'
         check (tipo in ('cliente', 'proveedor', 'ambos')),

  descripcion text,
  activo      boolean not null default true,
  -- Para que el selector no salga alfabético: las que más se usan, arriba.
  orden       integer not null default 0,
  created_at  timestamptz not null default now()
);

-- El mismo nombre puede existir para clientes y para proveedores; repetido
-- dentro del mismo tipo, no.
create unique index if not exists categorias_entidad_nombre_idx
  on categorias_entidad (lower(nombre), tipo);

alter table categorias_entidad enable row level security;

/* ── El vínculo ───────────────────────────────────────────────────────────── */

-- `on delete set null`: borrar una categoría no puede borrar los proveedores que
-- la usaban. Quedan sin categoría, que es visible y corregible.
alter table clientes
  add column if not exists categoria_id uuid references categorias_entidad (id) on delete set null;

alter table proveedores
  add column if not exists categoria_id uuid references categorias_entidad (id) on delete set null;

create index if not exists clientes_categoria_idx on clientes (categoria_id) where activo;
create index if not exists proveedores_categoria_idx on proveedores (categoria_id) where activo;

/* ── Semillas ─────────────────────────────────────────────────────────────── */

-- Un piso para poder empezar a clasificar hoy, no la lista definitiva: se edita
-- desde la pantalla. Las de proveedores siguen la forma en que se piensa el
-- rubro —por línea de producto— y las de clientes, por tipo de relación.
insert into categorias_entidad (nombre, tipo, orden, descripcion) values
  ('Networking',              'proveedor', 1,  'Switches, routers, access points, cableado'),
  ('Audio y accesorios',      'proveedor', 2,  'Auriculares, parlantes, periféricos de audio'),
  ('Informática',             'proveedor', 3,  'Notebooks, servidores, componentes'),
  ('Periféricos y accesorios','proveedor', 4,  'Monitores, teclados, cables, insumos'),
  ('Software y licencias',    'proveedor', 5,  'Licencias, suscripciones, servicios cloud'),
  ('Servicios profesionales', 'proveedor', 6,  'Honorarios, consultoría, desarrollo'),
  ('Logística y fletes',      'proveedor', 7,  'Transporte, mensajería, despachantes'),
  ('Servicios e impuestos',   'proveedor', 8,  'Luz, internet, telefonía, AFIP, IIBB'),
  ('Alquileres y expensas',   'proveedor', 9,  'Oficina, depósito, expensas'),
  ('Gastos generales',        'proveedor', 10, 'Librería, comida, viáticos, varios'),

  ('Mayorista',        'cliente', 1, 'Compra para revender'),
  ('Corporativo',      'cliente', 2, 'Empresas, consumo propio'),
  ('Organismo público','cliente', 3, 'Licitaciones y compras del Estado'),
  ('Minorista',        'cliente', 4, 'Consumidor final y pymes chicas'),
  ('Del exterior',     'cliente', 5, 'Exportación de bienes o servicios')
on conflict do nothing;
