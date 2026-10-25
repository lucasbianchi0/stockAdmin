-- Deshace supabase/migrations/20261025_02_cierre_periodos.sql. Borra también el
-- historial de cierres.

-- El motor vuelve a ser el de 20260814_03 (rehace el asiento con cualquier cambio).
create or replace function tg_asiento_comprobante() returns trigger
language plpgsql as $$
declare
  v_error text;
begin
  if tg_op = 'DELETE' then
    perform asiento_borrar('comprobante', old.id);
    perform asiento_falla('comprobante', old.id, null);
    return old;
  end if;

  if new.estado is distinct from 'confirmado' then
    perform asiento_borrar('comprobante', new.id);
    perform asiento_falla('comprobante', new.id, null);
    return new;
  end if;

  begin
    perform asiento_de_comprobante(new.id);
    v_error := null;
  exception when others then
    v_error := sqlerrm;
    raise warning 'Comprobante % guardado sin asiento: %', new.id, sqlerrm;
  end;

  perform asiento_falla('comprobante', new.id, v_error);
  return new;
end $$;

drop trigger if exists a_cierre_periodo on comprobantes;
drop trigger if exists a_cierre_periodo on comprobante_ivas;
drop trigger if exists a_cierre_periodo on comprobante_registro;
drop trigger if exists a_cierre_periodo on pagos;
drop trigger if exists a_cierre_periodo on imputaciones;
drop trigger if exists a_cierre_periodo on pago_retenciones;
drop trigger if exists a_cierre_periodo on pago_aplicaciones;
drop trigger if exists a_cierre_periodo on movimientos;
drop trigger if exists a_cierre_periodo on asientos;
drop trigger if exists a_cierre_periodo on asiento_lineas;

drop function if exists tg_cierre_comprobante();
drop function if exists tg_cierre_comprobante_hijo();
drop function if exists tg_cierre_comprobante_registro();
drop function if exists tg_cierre_pago();
drop function if exists tg_cierre_hijo_de_pago();
drop function if exists tg_cierre_pago_aplicacion();
drop function if exists tg_cierre_movimiento();
drop function if exists tg_cierre_asiento();
drop function if exists tg_cierre_asiento_linea();
drop function if exists cierre_verificar_comprobante(uuid);
drop function if exists cierre_verificar_asiento(uuid);
drop function if exists asiento_fecha_periodo(text, uuid, date);
drop function if exists comprobante_solo_gestion(comprobantes, comprobantes);
drop function if exists pago_fecha_periodo(uuid);
drop function if exists comprobante_fecha_periodo(uuid, date);
drop function if exists cierre_verificar(date);
drop function if exists fecha_cierre_contable();

drop table if exists cierres_periodo;
drop function if exists tg_cierres_periodo_inmutable();
