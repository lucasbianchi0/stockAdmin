-- Cobros, imputaciones y movimientos financieros.
--
-- Tres tablas que responden tres preguntas distintas, y separarlas es lo que
-- hace que el sistema cierre:
--
--   pagos         ¿quien pago, cuando, cuanto en total?
--   imputaciones  ¿que facturas cancela ese pago, y por cuanto cada una?
--   movimientos   ¿donde entro (o de donde salio) la plata?
--
-- La tentacion es guardar "factura pagada si/no" en el comprobante. No alcanza:
-- un cobro puede ser parcial, puede cancelar cinco facturas de una, y una
-- factura puede recibir tres cobros. Sin la tabla del medio, nada de eso se
-- puede representar y el saldo hay que adivinarlo.

/* ── Pagos y cobros ───────────────────────────────────────────────────────── */

-- Una sola tabla para las dos puntas, igual que en comprobantes: un recibo de
-- cobro y una orden de pago tienen la misma estructura y la misma logica de
-- imputacion. Lo que cambia es el signo y contra quien.
create table if not exists pagos (
  id     uuid primary key default gen_random_uuid(),
  tipo   text not null check (tipo in ('cobro', 'pago')),

  cliente_id   uuid references clientes (id) on delete restrict,
  proveedor_id uuid references proveedores (id) on delete restrict,
  constraint pagos_entidad_segun_tipo check (
    (tipo = 'cobro' and cliente_id is not null and proveedor_id is null) or
    (tipo = 'pago'  and proveedor_id is not null and cliente_id is null)
  ),

  fecha  date not null,

  -- La moneda del recibo. Todos los importes de adentro (medios de pago,
  -- retenciones) van en esta moneda; las imputaciones son la excepcion y se
  -- explica abajo.
  moneda text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  tc     numeric(14, 4) not null default 1 check (tc > 0),

  -- Retenciones sufridas (en un cobro) o practicadas (en un pago). No son
  -- plata que se mueve: son parte de lo que cancela la factura y que en vez de
  -- entrar a la caja se va como credito fiscal. Por eso van en columnas y no
  -- como un medio de pago mas.
  ret_ganancias numeric(16, 2) not null default 0,
  ret_iva       numeric(16, 2) not null default 0,
  ret_iibb      numeric(16, 2) not null default 0,
  ret_suss      numeric(16, 2) not null default 0,

  observaciones text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists pagos_cliente_idx on pagos (cliente_id, fecha desc) where tipo = 'cobro';
create index if not exists pagos_proveedor_idx on pagos (proveedor_id, fecha desc) where tipo = 'pago';
create index if not exists pagos_fecha_idx on pagos (tipo, fecha desc);

drop trigger if exists pagos_updated_at on pagos;
create trigger pagos_updated_at before update on pagos
  for each row execute function set_updated_at();

/* ── Imputaciones ─────────────────────────────────────────────────────────── */

create table if not exists imputaciones (
  id             uuid primary key default gen_random_uuid(),
  -- Borrar un cobro se lleva sus imputaciones: las facturas vuelven a quedar
  -- pendientes solas, que es exactamente lo que tiene que pasar al anular.
  pago_id        uuid not null references pagos (id) on delete cascade,
  -- El comprobante, en cambio, NO se puede borrar mientras tenga imputaciones.
  -- Es lo que hace que el 23503 llegue al handler con un mensaje entendible.
  comprobante_id uuid not null references comprobantes (id) on delete restrict,

  -- IMPORTANTE: este importe va en la moneda DEL COMPROBANTE, no en la del
  -- recibo. Es lo que cancela la factura, y una factura en dolares se cancela
  -- en dolares aunque se haya cobrado en pesos. La conversion la hace quien
  -- carga, con el TC del recibo, y queda registrada en `tc_aplicado`.
  importe      numeric(16, 2) not null check (importe > 0),
  tc_aplicado  numeric(14, 4),

  created_at timestamptz not null default now()
);

-- Un mismo recibo no puede imputar dos veces contra la misma factura: serian
-- dos renglones que habria que sumar a mano y que se editan por separado.
create unique index if not exists imputaciones_unica
  on imputaciones (pago_id, comprobante_id);

create index if not exists imputaciones_comprobante_idx on imputaciones (comprobante_id);

/* ── Movimientos financieros ──────────────────────────────────────────────── */

-- El libro mayor de caja, bancos y MercadoLibre. Todo lo que toca un saldo pasa
-- por aca: cobros, pagos, gastos, transferencias y ajustes. Sin una tabla unica
-- el saldo de una cuenta habria que armarlo sumando cuatro tablas distintas y
-- ninguna sumaria igual que las otras.
create table if not exists movimientos (
  id        uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references cuentas_financieras (id) on delete restrict,
  fecha     date not null,

  -- El signo sale del tipo, no de un importe negativo: cargar en negativo se
  -- presta a error y hace que las sumas de control no sirvan.
  tipo      text not null check (tipo in ('ingreso', 'egreso')),
  importe   numeric(16, 2) not null check (importe > 0),
  moneda    text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  tc        numeric(14, 4) not null default 1 check (tc > 0),

  -- De donde vino. 'manual' es el ajuste a mano; el resto cuelga de un documento.
  origen    text not null default 'manual'
            check (origen in ('cobro', 'pago', 'gasto', 'transferencia', 'manual')),
  pago_id   uuid references pagos (id) on delete cascade,

  cuenta_contable_id uuid references plan_cuentas (id) on delete set null,
  -- Numero de transferencia, cheque o comprobante.
  referencia text,
  detalle    text,
  -- Para gastos: impuestos, bancarios, sueldos, otros.
  categoria  text,

  conciliado boolean not null default false,

  -- Signo e importes convertidos, resueltos en la base por la misma razon que
  -- en comprobantes: para que cualquier reporte sume sin hacer cuentas en
  -- JavaScript y para que dos pantallas no puedan discrepar.
  signo smallint generated always as (case when tipo = 'ingreso' then 1 else -1 end) stored,
  importe_ars numeric(18, 2) generated always as (
    case when moneda = 'ARS' then importe else round(importe * tc, 2) end
  ) stored,
  importe_usd numeric(18, 2) generated always as (
    case when moneda = 'USD' then importe else round(importe / nullif(tc, 0), 2) end
  ) stored,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists movimientos_cuenta_idx on movimientos (cuenta_id, fecha desc);
create index if not exists movimientos_pago_idx on movimientos (pago_id);
create index if not exists movimientos_fecha_idx on movimientos (fecha desc);

/* ── Vistas de saldo ──────────────────────────────────────────────────────── */

-- El saldo pendiente de cada comprobante. Es una vista y no una columna a
-- proposito: un `estado` guardado se desincroniza el dia que alguien anula un
-- cobro desde la base, y nadie se entera hasta que un cliente reclama.
drop view if exists comprobantes_saldo;
create view comprobantes_saldo as
select
  c.*,
  coalesce(i.imputado, 0) as imputado,
  round(c.total - coalesce(i.imputado, 0), 2) as saldo
from comprobantes c
left join (
  select comprobante_id, sum(importe) as imputado
    from imputaciones
   group by comprobante_id
) i on i.comprobante_id = c.id;

-- El saldo de cada caja o banco: el inicial mas la suma de los movimientos con
-- su signo.
drop view if exists cuentas_saldo;
create view cuentas_saldo as
select
  cf.*,
  coalesce(m.total, 0) as movimientos,
  round(cf.saldo_inicial + coalesce(m.total, 0), 2) as saldo
from cuentas_financieras cf
left join (
  select cuenta_id, sum(importe * signo) as total
    from movimientos
   group by cuenta_id
) m on m.cuenta_id = cf.id;

/* ── RLS ──────────────────────────────────────────────────────────────────── */

alter table pagos        enable row level security;
alter table imputaciones enable row level security;
alter table movimientos  enable row level security;
