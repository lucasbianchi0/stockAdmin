-- Retenciones por jurisdicción — el punto 4 del pedido.
--
-- Lo pedido, textual: "EN RETENCIONES IIBB hacer una apertura más que sea IIBB
-- CABA Y otra IIBB BS AS".
--
-- La solución obvia sería agregar dos columnas, `ret_iibb_caba` y
-- `ret_iibb_bsas`. Resuelve el pedido de hoy y repite el problema mañana: el
-- plan de cuentas del contador ya tiene retenciones de Ingresos Brutos de SIETE
-- jurisdicciones —Capital, Buenos Aires, Santa Fe, Córdoba, Mendoza, Neuquén y
-- Entre Ríos— más percepciones de otras tres. Cada provincia nueva sería otra
-- migración, otra columna en el formulario y otra rama en cada reporte.
--
-- Van a filas. Una retención pasa a ser un renglón con su tipo, su jurisdicción,
-- su cuenta contable, su base, su alícuota y su número de certificado. Dos cosas
-- que las columnas no podían dar y que salen gratis con esto:
--
--   · **La cuenta contable de cada retención.** Es lo que el motor de asientos
--     necesita para imputar contra 57 o contra 58 y no contra una bolsa.
--   · **El certificado.** Cualquier proveedor al que se le retiene lo pide, y
--     sin un lugar donde guardar el número no se puede emitir.

/* ── La tabla ─────────────────────────────────────────────────────────────── */

create table if not exists pago_retenciones (
  id      uuid primary key default gen_random_uuid(),
  -- Anular el recibo se lleva sus retenciones, igual que sus imputaciones.
  pago_id uuid not null references pagos (id) on delete cascade,

  tipo    text not null check (tipo in ('ganancias', 'iva', 'iibb', 'suss')),

  -- Solo Ingresos Brutos es provincial. Ganancias, IVA y SUSS son nacionales y
  -- una jurisdicción ahí no querría decir nada.
  jurisdiccion text,
  constraint pago_retenciones_jurisdiccion_solo_iibb
    check (tipo = 'iibb' or jurisdiccion is null),

  -- Contra qué cuenta del plan imputa. Se propone desde `config_contable` según
  -- el tipo y la jurisdicción, y se puede corregir.
  cuenta_contable_id uuid references plan_cuentas (id) on delete set null,

  -- Sobre cuánto y a qué alícuota se calculó. Son opcionales porque muchas veces
  -- el importe viene del certificado ya calculado, pero cuando están permiten
  -- recalcular y detectar el error de tipeo.
  base     numeric(16, 2) check (base >= 0),
  alicuota numeric(7, 4)  check (alicuota >= 0),

  -- En la moneda del recibo, igual que los medios de pago.
  importe  numeric(16, 2) not null check (importe > 0),

  numero_certificado text,
  fecha              date,

  created_at timestamptz not null default now()
);

-- Un recibo no puede tener dos renglones del mismo tipo y jurisdicción: serían
-- dos importes que hay que sumar a mano y que se editan por separado. El
-- `coalesce` hace que los nacionales —sin jurisdicción— también choquen entre sí.
create unique index if not exists pago_retenciones_unica
  on pago_retenciones (pago_id, tipo, coalesce(jurisdiccion, ''));

create index if not exists pago_retenciones_pago_idx on pago_retenciones (pago_id);

alter table pago_retenciones enable row level security;

/* ── Migración de las cuatro columnas ─────────────────────────────────────── */

-- Cada columna con importe distinto de cero se convierte en un renglón. Las
-- de IIBB quedan sin jurisdicción a propósito: son de antes de que existiera la
-- apertura y no hay forma de adivinar de qué provincia eran. `null` acá
-- significa "sin discriminar", que es la verdad.
insert into pago_retenciones (pago_id, tipo, importe, cuenta_contable_id)
select p.id, v.tipo, v.importe, cc.cuenta_id
  from pagos p
 cross join lateral (values
    ('ganancias', p.ret_ganancias),
    ('iva',       p.ret_iva),
    ('iibb',      p.ret_iibb),
    ('suss',      p.ret_suss)
  ) as v (tipo, importe)
  left join config_contable cc
    on cc.clave = case
         when p.tipo = 'cobro' then
           case v.tipo
             when 'ganancias' then 'ret_ganancias_sufrida'
             when 'iva'       then 'ret_iva_sufrida'
             when 'suss'      then 'ret_suss_sufrida'
             else null
           end
         else
           case v.tipo when 'ganancias' then 'ret_ganancias_practicada' else null end
       end
 where v.importe is not null and v.importe > 0
on conflict do nothing;

alter table pagos
  drop column if exists ret_ganancias,
  drop column if exists ret_iva,
  drop column if exists ret_iibb,
  drop column if exists ret_suss;

/* ── El total de cada recibo ──────────────────────────────────────────────── */

-- Lo que antes era sumar cuatro columnas ahora es agregar filas. La vista lo
-- deja en un solo lugar para que ninguna pantalla se olvide de un tipo el día
-- que se agregue uno.
drop view if exists pagos_con_retenciones;
create view pagos_con_retenciones as
select
  p.*,
  coalesce(r.total, 0)    as total_retenciones,
  coalesce(r.cantidad, 0) as cantidad_retenciones
from pagos p
left join (
  select pago_id, sum(importe) as total, count(*) as cantidad
    from pago_retenciones
   group by pago_id
) r on r.pago_id = p.id;
