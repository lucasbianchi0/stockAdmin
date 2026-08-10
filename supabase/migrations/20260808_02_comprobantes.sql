-- Comprobantes: facturas y notas, de venta y de compra.
--
-- Una sola tabla con discriminador `tipo` y no dos tablas paralelas. Compras y
-- ventas comparten estructura (fecha, punto de venta, numero, neto, IVA, total,
-- moneda, TC) y comparten toda la logica cara: saldo pendiente, imputacion de
-- pagos, antiguedad, vencimientos, estado de cuenta. Dos tablas significan dos
-- copias de esa logica, y dos copias significan que en algun momento una de las
-- dos se arregla y la otra no.
--
-- Bimonetario, la regla de oro: se guarda el importe EN SU MONEDA y el tipo de
-- cambio del dia en que se cargo. Los valores en la otra moneda son columnas
-- generadas. Nunca se recalculan: una factura de agosto queda valuada al dolar
-- de agosto para siempre, que es como funciona el estado de cuenta real (el
-- mismo cliente con TC 1.330, 1.420 y 1.435 en filas distintas).

/* ── Signo del comprobante ────────────────────────────────────────────────── */

-- Las notas de credito restan. Se guardan con importes POSITIVOS igual que una
-- factura —el formulario es el mismo y cargar en negativo se presta a error— y
-- el signo sale de la clase.
--
-- IMMUTABLE no es decorativo: es lo que habilita usarla en una columna generada.
create or replace function comprobante_signo(clase text) returns smallint
language sql immutable strict as $$
  select case when upper(clase) like 'NC%' then -1 else 1 end::smallint
$$;

/* ── Comprobantes ─────────────────────────────────────────────────────────── */

create table if not exists comprobantes (
  id       uuid primary key default gen_random_uuid(),
  tipo     text not null check (tipo in ('compra', 'venta')),

  -- Excluyentes segun el tipo: una factura de venta apunta a un cliente y una de
  -- compra a un proveedor. El check lo garantiza; sin el, una fila puede quedar
  -- apuntando a los dos o a ninguno y no hay forma de saber de quien es.
  cliente_id    uuid references clientes (id) on delete restrict,
  proveedor_id  uuid references proveedores (id) on delete restrict,
  constraint comprobantes_entidad_segun_tipo check (
    (tipo = 'venta'  and cliente_id is not null and proveedor_id is null) or
    (tipo = 'compra' and proveedor_id is not null and cliente_id is null)
  ),

  -- FCA, FCB, FCEA, NCA, NDA, NCB, NDB, NCEA, NDEA (ventas) · FCA, FCC, NCA,
  -- NDA, NCC (compras). Se valida en la app: la lista cambia con la normativa y
  -- un check en la base obliga a una migracion cada vez.
  clase    text not null,

  fecha              date not null,
  fecha_vencimiento  date,
  -- Cuando se espera cobrarla/pagarla de verdad, que no siempre es el
  -- vencimiento formal. Es la columna "fecha estimada de pago" del reporte.
  fecha_estimada_pago date,

  punto_venta  integer check (punto_venta >= 0),
  numero       bigint  check (numero >= 0),

  cuenta_contable_id uuid references plan_cuentas (id) on delete set null,
  detalle            text,

  moneda   text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  -- Pesos por dolar. 1 para los comprobantes en pesos, asi las columnas
  -- generadas no necesitan un caso especial para el nulo.
  tc       numeric(14, 4) not null default 1 check (tc > 0),

  -- Todos los importes van en la moneda del comprobante.
  neto_gravado    numeric(16, 2) not null default 0,
  alicuota_iva    numeric(5, 4),
  iva             numeric(16, 2) not null default 0,
  no_gravado      numeric(16, 2) not null default 0,
  exento          numeric(16, 2) not null default 0,
  percepcion_iva  numeric(16, 2) not null default 0,
  percepcion_iibb numeric(16, 2) not null default 0,
  otros_impuestos numeric(16, 2) not null default 0,
  total           numeric(16, 2) not null default 0,

  condicion_pago text,
  vendedor_id    uuid references vendedores (id) on delete set null,
  observaciones  text,

  signo smallint generated always as (comprobante_signo(clase)) stored,

  -- El bimonetario resuelto en la base y no en la UI: asi cualquier reporte suma
  -- en cualquiera de las dos monedas sin hacer cuentas en JavaScript, y las
  -- sumas de dos pantallas distintas no pueden discrepar.
  total_ars numeric(18, 2) generated always as (
    case when moneda = 'ARS' then total else round(total * tc, 2) end
  ) stored,
  total_usd numeric(18, 2) generated always as (
    case when moneda = 'USD' then total else round(total / nullif(tc, 0), 2) end
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

-- Cargar dos veces la misma factura es el error mas caro y mas comun del rubro:
-- duplica la deuda, duplica el IVA y descuadra el estado de cuenta.
--
-- En ventas el numero es propio, asi que alcanza con clase + punto de venta +
-- numero. En compras el mismo numero lo puede emitir cualquier proveedor, asi
-- que el proveedor entra en la clave.
create unique index if not exists comprobantes_unico_venta
  on comprobantes (clase, punto_venta, numero)
  where tipo = 'venta' and punto_venta is not null and numero is not null;

create unique index if not exists comprobantes_unico_compra
  on comprobantes (proveedor_id, clase, punto_venta, numero)
  where tipo = 'compra' and punto_venta is not null and numero is not null;

create index if not exists comprobantes_cliente_idx
  on comprobantes (cliente_id, fecha desc) where tipo = 'venta';
create index if not exists comprobantes_proveedor_idx
  on comprobantes (proveedor_id, fecha desc) where tipo = 'compra';
create index if not exists comprobantes_fecha_idx on comprobantes (tipo, fecha desc);
-- Para el tablero de vencimientos, que ordena por lo que vence primero.
create index if not exists comprobantes_vencimiento_idx
  on comprobantes (tipo, fecha_vencimiento) where fecha_vencimiento is not null;

drop trigger if exists comprobantes_updated_at on comprobantes;
create trigger comprobantes_updated_at before update on comprobantes
  for each row execute function set_updated_at();

alter table comprobantes enable row level security;

-- NOTA: el saldo pendiente todavia es el total, porque no existen los pagos.
-- Cuando entren (fase 6: cobros, fase 9: pagos) aparece la tabla `imputaciones`
-- y una vista `comprobantes_saldo` que hace total - suma(imputado). El saldo no
-- se guarda como columna a proposito: un `estado` denormalizado se desincroniza
-- el dia que alguien anula un cobro.
