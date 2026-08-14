-- El tipo de cambio de valuación — arregla los puntos 2, 5 y 6 del pedido.
--
-- Los tres son el mismo error de fondo, repetido en tres tablas: `tc` se forzaba
-- a 1 cuando el documento era en pesos. El comentario que lo justificaba decía
-- "un comprobante en pesos con TC 1.500 haría que total_usd diera cualquier
-- cosa". Es al revés — es lo único que hace que dé bien:
--
--     total_usd = total / tc      con tc = 1  →  total_usd = total
--
-- De ahí sale la pantalla que muestra "$ 8.058.622,77" y abajo
-- "USD 8.058.622,77", que es el punto 2.
--
-- QUE SIGNIFICA `tc` A PARTIR DE ACA
--
--   Pesos por dólar aplicables a ESTE documento. Uno solo, con un solo
--   significado:
--
--     · Documento en USD  → el TC al que se cerró la operación. Obligatorio.
--     · Documento en ARS  → el dólar de referencia de ese día. Opcional.
--     · NULL              → no se sabe. Y entonces el importe en dólares
--                           tampoco se sabe, así que `total_usd` da NULL y la
--                           pantalla muestra "—".
--
--   Un guion es la respuesta correcta cuando no hay dato. El número de antes no
--   era "aproximado": era el importe en pesos con otro cartel adelante.

/* ── Cotizaciones ─────────────────────────────────────────────────────────── */

-- El dólar de cada día, para poder valuar un documento en pesos sin que nadie
-- tipee la cotización. La alimenta `/api/dolar` —la misma fuente que usa el
-- módulo de productos, a propósito: si una factura se valuara con un dólar
-- distinto del que se usó para cotizarle al cliente, los números de las dos
-- pantallas no cerrarían y no habría forma de explicar la diferencia.
create table if not exists cotizaciones (
  fecha      date primary key,
  compra     numeric(14, 4) check (compra > 0),
  venta      numeric(14, 4) not null check (venta > 0),
  fuente     text not null default 'bna',
  created_at timestamptz not null default now()
);

alter table cotizaciones enable row level security;

/* ── Bajar las vistas ─────────────────────────────────────────────────────── */

-- `comprobantes_saldo` y `cuentas_saldo` hacen `select c.*`, así que dependen de
-- las columnas generadas y hay que bajarlas antes de poder tocarlas. Se vuelven
-- a crear al final del archivo, idénticas: son vistas, no guardan nada.
drop view if exists comprobantes_saldo;
drop view if exists cuentas_saldo;

/* ── Comprobantes ─────────────────────────────────────────────────────────── */

-- Las columnas generadas dependen de `tc`, así que hay que bajarlas para poder
-- tocarlo y volver a levantarlas después. Son `stored`: se recalculan solas
-- sobre las filas que ya existen.
alter table comprobantes drop column if exists total_ars;
alter table comprobantes drop column if exists total_usd;

alter table comprobantes alter column tc drop not null;
alter table comprobantes alter column tc drop default;

-- Un comprobante en dólares sin TC no se puede valuar en pesos, y el saldo del
-- cliente se arma en pesos históricos. Es el único caso en que el dato es
-- obligatorio.
alter table comprobantes drop constraint if exists comprobantes_tc_si_usd;
alter table comprobantes add constraint comprobantes_tc_si_usd
  check (moneda = 'ARS' or tc is not null);

alter table comprobantes add column total_ars numeric(18, 2) generated always as (
  case when moneda = 'ARS' then total else round(total * tc, 2) end
) stored;

-- NULL cuando no hay TC. Es la diferencia entre "no lo sé" y "es igual al
-- importe en pesos", que era lo que se mostraba antes.
alter table comprobantes add column total_usd numeric(18, 2) generated always as (
  case when moneda = 'USD' then total else round(total / nullif(tc, 0), 2) end
) stored;

-- El 1 de los comprobantes en pesos ya cargados no es una cotización: es el
-- default de la columna. Se limpia para que el dólar deje de mentir. Cuando
-- haya cotizaciones históricas cargadas, el backfill de abajo los completa.
update comprobantes set tc = null where moneda = 'ARS' and tc = 1;

update comprobantes c
   set tc = co.venta
  from cotizaciones co
 where c.moneda = 'ARS' and c.tc is null and co.fecha = c.fecha;

/* ── Pagos ────────────────────────────────────────────────────────────────── */

-- En un recibo el TC no es decorativo: es lo que convierte lo que cancela una
-- factura en dólares a los pesos que entraron al banco. El handler lo forzaba a
-- 1 cuando el recibo era en pesos, y por eso un cobro en pesos de una factura en
-- dólares nunca cuadraba (punto 5).
alter table pagos alter column tc drop not null;
alter table pagos alter column tc drop default;

-- Mismo criterio que en comprobantes: el 1 era el default, no una cotización.
update pagos set tc = null where moneda = 'ARS' and tc = 1;

/* ── Movimientos ──────────────────────────────────────────────────────────── */

alter table movimientos drop column if exists importe_ars;
alter table movimientos drop column if exists importe_usd;

alter table movimientos alter column tc drop not null;
alter table movimientos alter column tc drop default;

-- De dónde salió el importe cuando el documento estaba en otra moneda. Sin
-- esto, un cobro de USD 2.855,31 acreditado en el Galicia en pesos pierde para
-- siempre el dato de que eran dólares, y el recibo y el extracto dejan de poder
-- explicarse el uno al otro.
alter table movimientos
  add column if not exists importe_origen numeric(16, 2) check (importe_origen > 0),
  add column if not exists moneda_origen  text check (moneda_origen in ('ARS', 'USD'));

alter table movimientos add column importe_ars numeric(18, 2) generated always as (
  case when moneda = 'ARS' then importe else round(importe * tc, 2) end
) stored;

alter table movimientos add column importe_usd numeric(18, 2) generated always as (
  case when moneda = 'USD' then importe else round(importe / nullif(tc, 0), 2) end
) stored;

/* ── La moneda del movimiento es la de su cuenta ──────────────────────────── */

-- El punto 6: "cuando vas al saldo del Galicia no refleja el saldo real de
-- cobranzas – pagos porque muestra una parte en USD y una en Pesos".
--
-- La causa es que el movimiento heredaba la moneda del recibo. Un Banco Galicia
-- en pesos no puede recibir un movimiento en dólares — en el banco de verdad no
-- pasa—, así que se convierte al cargar y la regla la garantiza la base.
--
-- Primero se arregla lo que ya está cargado, y recién después entra el trigger:
-- al revés, el trigger rechazaría las filas que él mismo tiene que corregir.
update movimientos m
   set importe_origen = m.importe,
       moneda_origen  = m.moneda,
       importe        = case
                          when m.moneda = 'USD' then round(m.importe * coalesce(m.tc, 1), 2)
                          else round(m.importe / nullif(coalesce(m.tc, 1), 0), 2)
                        end,
       moneda         = cf.moneda
  from cuentas_financieras cf
 where cf.id = m.cuenta_id
   and m.moneda <> cf.moneda;

-- Los que ya estaban en la moneda de su cuenta y quedaron con el tc = 1 del
-- default. La condición sobre `moneda_origen` deja afuera los que acaba de
-- convertir el UPDATE de arriba: en esos el TC es el que se aplicó de verdad.
update movimientos
   set tc = null
 where moneda = 'ARS' and tc = 1 and moneda_origen is null;

update movimientos m
   set tc = co.venta
  from cotizaciones co
 where m.moneda = 'ARS' and m.tc is null and co.fecha = m.fecha;

create or replace function movimiento_moneda_de_su_cuenta() returns trigger
language plpgsql as $$
declare
  moneda_cuenta text;
begin
  select moneda into moneda_cuenta
    from cuentas_financieras where id = new.cuenta_id;

  if moneda_cuenta is null then
    raise exception 'La cuenta financiera % no existe', new.cuenta_id;
  end if;

  if new.moneda <> moneda_cuenta then
    raise exception
      'Un movimiento de una cuenta en % no puede estar en %. Convertilo al cargarlo y guardá el importe original en importe_origen.',
      moneda_cuenta, new.moneda;
  end if;

  return new;
end;
$$;

drop trigger if exists movimientos_moneda_de_su_cuenta on movimientos;
create trigger movimientos_moneda_de_su_cuenta
  before insert or update of moneda, cuenta_id on movimientos
  for each row execute function movimiento_moneda_de_su_cuenta();

/* ── Las vistas, de vuelta ────────────────────────────────────────────────── */

-- Idénticas a las de la fase 6. `cuentas_saldo` no cambia una línea y sin
-- embargo ahora da bien: sumaba `importe * signo` sobre movimientos que podían
-- estar en dos monedas distintas. Con la regla de arriba ya no pueden.
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
