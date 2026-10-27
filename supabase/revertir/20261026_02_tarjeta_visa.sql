-- Deshace 20261026_02. Solo si la tarjeta no tiene movimientos: si los tiene,
-- borrar la cuenta rompe sus recibos y el delete falla por la FK, que es lo
-- que tiene que pasar.
delete from cuentas_financieras where tipo = 'tarjeta';
alter table cuentas_financieras drop constraint if exists cuentas_financieras_tipo_check;
alter table cuentas_financieras add constraint cuentas_financieras_tipo_check
  check (tipo in ('caja', 'banco', 'billetera'));
drop index if exists comprobantes_tarjeta_visa_idx;
alter table comprobantes drop column if exists tarjeta_visa;
