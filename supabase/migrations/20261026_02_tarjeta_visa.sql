/*
 * Pago de tarjetas VISA (pedido del estudio, 26/10/2026)
 * -----------------------------------------------------------------------------
 *
 *   «Continuar registrando las facturas de los proveedores mediante el
 *    procedimiento habitual de carga, pero con una opción que permita
 *    identificarlas como VISA. En "Pago de tarjetas VISA" ver todas las
 *    facturas VISA y, cuando se debita la tarjeta del banco, aplicarlas: que los
 *    pagos vayan a cada cuenta del proveedor pero que en el banco se vea un
 *    único débito.»
 *
 * Dos piezas, las dos aditivas:
 *
 *  1. `comprobantes.tarjeta_visa`: la marca en la factura. No cambia su asiento
 *     —la deuda sigue siendo con el proveedor— ni ninguna vista existente.
 *
 *  2. Una cuenta financiera de tipo `tarjeta`, ligada a la 220 «Tarjeta VISA
 *     Galicia» del plan. Los pagos de las facturas VISA salen de esta cuenta
 *     (un recibo por proveedor), y el débito del resumen es una transferencia
 *     del banco a la tarjeta: en el extracto del Galicia queda una sola línea y
 *     la tarjeta vuelve a cero.
 *
 * Para deshacer: supabase/revertir/20261026_02_tarjeta_visa.sql.
 */

alter table comprobantes
  add column if not exists tarjeta_visa boolean not null default false;

create index if not exists comprobantes_tarjeta_visa_idx
  on comprobantes (proveedor_id) where tarjeta_visa;

alter table cuentas_financieras drop constraint if exists cuentas_financieras_tipo_check;
alter table cuentas_financieras add constraint cuentas_financieras_tipo_check
  check (tipo in ('caja', 'banco', 'billetera', 'tarjeta'));

insert into cuentas_financieras (nombre, tipo, moneda, banco, cuenta_contable_id, activo)
select 'TARJETA VISA GALICIA', 'tarjeta', 'ARS', 'Banco Galicia', p.id, true
  from plan_cuentas p
 where p.codigo = '220'
   and not exists (select 1 from cuentas_financieras where tipo = 'tarjeta');
