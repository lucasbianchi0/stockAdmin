-- Datos maestros del modulo Administracion.
--
-- Es la base de la que cuelga todo lo demas: los comprobantes apuntan a un
-- cliente o a un proveedor y a una cuenta contable, y los movimientos apuntan a
-- una cuenta financiera. Por eso va primero y sola, sin comprobantes ni pagos.
--
-- Dos decisiones que se repiten en todas las tablas de acá:
--
--  1. Casi todo es opcional. Lo unico obligatorio es lo que hace que la fila
--     tenga sentido (una razon social, un codigo de cuenta). Un maestro que
--     exige quince campos para dar de alta un proveedor termina lleno de
--     "N/A" — y despues no se puede distinguir el dato que falta del que no
--     aplica.
--  2. Nada se borra. `activo` saca la fila de los selectores sin romper los
--     comprobantes viejos que la referencian.

/* ── Vendedores ───────────────────────────────────────────────────────────── */

create table if not exists vendedores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  email      text,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

/* ── Clientes ─────────────────────────────────────────────────────────────── */

-- Clientes y proveedores son tablas separadas y no una tabla `entidades` con un
-- flag: el CUIT tiene que ser unico DENTRO de cada modulo (lo pide el pliego) y
-- la misma empresa puede ser cliente y proveedor a la vez. Con una sola tabla,
-- garantizar eso obliga a un indice condicional por rol que no aporta nada.
create table if not exists clientes (
  id             uuid primary key default gen_random_uuid(),
  razon_social   text not null,
  -- Del exterior no se espera CUIT ni IVA. Es lo primero que se elige en el
  -- formulario porque cambia que campos tienen sentido despues.
  origen         text not null default 'nacional' check (origen in ('nacional', 'exterior')),
  -- Solo digitos, sin guiones: lo normaliza lib/admin/cuit.ts antes de entrar.
  -- Guardarlo con formato haria que 30-50054729-0 y 30500547290 entren como dos
  -- empresas distintas, que es justo el duplicado que hay que evitar.
  cuit           text check (cuit ~ '^[0-9]{11}$'),
  forma_juridica text check (
    forma_juridica in ('responsable_inscripto', 'monotributo', 'consumidor_final', 'exento')
  ),
  contacto       text,
  direccion      text,
  provincia      text,
  telefono       text,
  email          text,
  vendedor_id    uuid references vendedores (id) on delete set null,
  -- Dias de plazo pactados. Alimenta la fecha estimada de cobro de cada factura
  -- sin obligar a escribirla una por una.
  condicion_pago_dias integer check (condicion_pago_dias >= 0),
  notas          text,
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Parcial: los clientes del exterior no tienen CUIT y en Postgres varios NULL no
-- colisionan, pero el indice parcial deja explicito que la unicidad aplica solo
-- donde hay dato.
create unique index if not exists clientes_cuit_idx
  on clientes (cuit) where cuit is not null;

-- Para el buscador y para el aviso de razon social parecida al dar de alta.
create index if not exists clientes_razon_social_idx on clientes (lower(razon_social));
create index if not exists clientes_activo_idx on clientes (activo, razon_social);

/* ── Proveedores ──────────────────────────────────────────────────────────── */

create table if not exists proveedores (
  id             uuid primary key default gen_random_uuid(),
  razon_social   text not null,
  origen         text not null default 'nacional' check (origen in ('nacional', 'exterior')),
  cuit           text check (cuit ~ '^[0-9]{11}$'),
  forma_juridica text check (
    forma_juridica in ('responsable_inscripto', 'monotributo', 'consumidor_final', 'exento')
  ),
  contacto       text,
  direccion      text,
  provincia      text,
  telefono       text,
  email          text,
  condicion_pago_dias integer check (condicion_pago_dias >= 0),
  notas          text,
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists proveedores_cuit_idx
  on proveedores (cuit) where cuit is not null;
create index if not exists proveedores_razon_social_idx on proveedores (lower(razon_social));
create index if not exists proveedores_activo_idx on proveedores (activo, razon_social);

/* ── Plan de cuentas ──────────────────────────────────────────────────────── */

create table if not exists plan_cuentas (
  id        uuid primary key default gen_random_uuid(),
  -- Jerarquico por puntos: 1.2.01 cuelga de 1.2, que cuelga de 1. El arbol se
  -- deduce del codigo y `padre_id` lo materializa para no parsear texto en cada
  -- consulta.
  codigo    text not null unique,
  nombre    text not null,
  tipo      text not null check (tipo in ('activo', 'pasivo', 'patrimonio', 'ingreso', 'egreso')),
  padre_id  uuid references plan_cuentas (id) on delete restrict,
  -- Solo las imputables aparecen en los selectores de los comprobantes. Las de
  -- agrupacion existen para que el arbol y los totales tengan niveles.
  imputable boolean not null default true,
  activo    boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists plan_cuentas_padre_idx on plan_cuentas (padre_id, codigo);

/* ── Cuentas financieras (caja, bancos, MercadoLibre) ─────────────────────── */

create table if not exists cuentas_financieras (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  tipo          text not null check (tipo in ('caja', 'banco', 'billetera')),
  -- La moneda de la cuenta, no la del movimiento: una caja en pesos no recibe
  -- dolares. Una cuenta en USD se da de alta aparte, que es como funciona en el
  -- banco de verdad.
  moneda        text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  banco         text,
  numero_cuenta text,
  cbu           text,
  alias         text,
  cuenta_contable_id uuid references plan_cuentas (id) on delete set null,
  -- El saldo al arrancar con el sistema. Sin esto habria que cargar el historico
  -- entero de movimientos para que el saldo de hoy de bien.
  saldo_inicial numeric(16, 2) not null default 0,
  fecha_saldo_inicial date,
  activo        boolean not null default true,
  -- Orden de aparicion en selectores y tableros; el alfabetico deja Caja en el
  -- medio de los bancos.
  orden         integer not null default 0,
  created_at    timestamptz not null default now()
);

create unique index if not exists cuentas_financieras_nombre_idx
  on cuentas_financieras (lower(nombre), moneda);

/* ── updated_at ───────────────────────────────────────────────────────────── */

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clientes_updated_at on clientes;
create trigger clientes_updated_at before update on clientes
  for each row execute function set_updated_at();

drop trigger if exists proveedores_updated_at on proveedores;
create trigger proveedores_updated_at before update on proveedores
  for each row execute function set_updated_at();

/* ── Semillas ─────────────────────────────────────────────────────────────── */

-- Plan de cuentas minimo, argentino. No pretende ser el definitivo: es el piso
-- para poder imputar desde el primer dia, y se edita desde la pantalla.
insert into plan_cuentas (codigo, nombre, tipo, imputable) values
  ('1',      'Activo',                      'activo',     false),
  ('1.1',    'Caja y bancos',               'activo',     false),
  ('1.1.01', 'Caja',                        'activo',     true),
  ('1.1.02', 'Banco Galicia',               'activo',     true),
  ('1.1.03', 'Banco Macro',                 'activo',     true),
  ('1.1.04', 'MercadoLibre',                'activo',     true),
  ('1.2',    'Creditos',                    'activo',     false),
  ('1.2.01', 'Deudores por ventas',         'activo',     true),
  ('1.2.02', 'IVA credito fiscal',          'activo',     true),
  ('1.2.03', 'Retenciones sufridas',        'activo',     true),
  ('1.2.04', 'Anticipos a proveedores',     'activo',     true),

  ('2',      'Pasivo',                      'pasivo',     false),
  ('2.1',    'Deudas comerciales',          'pasivo',     false),
  ('2.1.01', 'Proveedores',                 'pasivo',     true),
  ('2.2',    'Deudas fiscales',             'pasivo',     false),
  ('2.2.01', 'IVA debito fiscal',           'pasivo',     true),
  ('2.2.02', 'Impuestos a pagar',           'pasivo',     true),
  ('2.2.03', 'Retenciones practicadas',     'pasivo',     true),
  ('2.3',    'Deudas sociales',             'pasivo',     false),
  ('2.3.01', 'Sueldos a pagar',             'pasivo',     true),
  ('2.3.02', 'Cargas sociales a pagar',     'pasivo',     true),

  ('3',      'Patrimonio neto',             'patrimonio', false),
  ('3.1',    'Capital',                     'patrimonio', true),
  ('3.2',    'Resultados acumulados',       'patrimonio', true),

  ('4',      'Ingresos',                    'ingreso',    false),
  ('4.1',    'Ventas',                      'ingreso',    false),
  ('4.1.01', 'Venta de productos',          'ingreso',    true),
  ('4.1.02', 'Venta de servicios',          'ingreso',    true),
  ('4.2',    'Otros ingresos',              'ingreso',    false),
  ('4.2.01', 'Diferencia de cambio ganada', 'ingreso',    true),
  ('4.2.02', 'Intereses ganados',           'ingreso',    true),

  ('5',      'Egresos',                     'egreso',     false),
  ('5.1',    'Costo de ventas',             'egreso',     false),
  ('5.1.01', 'Compras de mercaderia',       'egreso',     true),
  ('5.2',    'Gastos de administracion',    'egreso',     false),
  ('5.2.01', 'Honorarios',                  'egreso',     true),
  ('5.2.02', 'Servicios',                   'egreso',     true),
  ('5.2.03', 'Gastos bancarios',            'egreso',     true),
  ('5.2.04', 'Alquileres',                  'egreso',     true),
  ('5.3',    'Gastos de comercializacion',  'egreso',     false),
  ('5.3.01', 'Publicidad y marketing',      'egreso',     true),
  ('5.3.02', 'Fletes y logistica',          'egreso',     true),
  ('5.4',    'Gastos de personal',          'egreso',     false),
  ('5.4.01', 'Sueldos y jornales',          'egreso',     true),
  ('5.4.02', 'Cargas sociales',             'egreso',     true),
  ('5.5',    'Impuestos',                   'egreso',     false),
  ('5.5.01', 'Impuestos y tasas',           'egreso',     true),
  ('5.6',    'Resultados financieros',      'egreso',     false),
  ('5.6.01', 'Diferencia de cambio perdida','egreso',     true),
  ('5.6.02', 'Intereses perdidos',          'egreso',     true)
on conflict (codigo) do nothing;

-- El padre es el codigo sin el ultimo tramo: '1.2.01' -> '1.2'. Se resuelve
-- despues de insertar todo para no depender del orden de las filas.
update plan_cuentas h
   set padre_id = p.id
  from plan_cuentas p
 where h.padre_id is null
   and h.codigo like '%.%'
   and p.codigo = regexp_replace(h.codigo, '\.[^.]+$', '');

insert into cuentas_financieras (nombre, tipo, moneda, orden, cuenta_contable_id)
select v.nombre, v.tipo, 'ARS', v.orden, pc.id
  from (values
    ('Caja',           'caja',      1, '1.1.01'),
    ('Banco Galicia',  'banco',     2, '1.1.02'),
    ('Banco Macro',    'banco',     3, '1.1.03'),
    ('MercadoLibre',   'billetera', 4, '1.1.04')
  ) as v (nombre, tipo, orden, codigo)
  left join plan_cuentas pc on pc.codigo = v.codigo
on conflict do nothing;

/* ── RLS ──────────────────────────────────────────────────────────────────── */

-- Igual que en el resto del proyecto: el acceso entra por el servidor (los
-- handlers usan la service role key y chequean el modulo antes de tocar la base)
-- o no entra. RLS sin politicas deja a la anon key sin nada que leer.
alter table vendedores          enable row level security;
alter table clientes            enable row level security;
alter table proveedores         enable row level security;
alter table plan_cuentas        enable row level security;
alter table cuentas_financieras enable row level security;
