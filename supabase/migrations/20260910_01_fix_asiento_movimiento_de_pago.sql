/*
 * Fix · el recibo perdía la línea del banco y la tapaba con diferencia de cambio
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `20260813_04_asientos.sql` dejó un `tg_asiento_movimiento` que servía a dos
 * amos: si el movimiento colgaba de un recibo refrescaba el asiento del recibo,
 * y si era suelto generaba el suyo. `20260814_03_fix_asiento_linea.sql` lo
 * reemplazó para sumarle el registro de fallas y, en el camino, se comió esa
 * primera mitad: desde entonces un movimiento con `pago_id` sale del trigger sin
 * tocar nada.
 *
 * El alta de un recibo escribe en cuatro pasos — cabecera, imputaciones,
 * retenciones y recién al final los movimientos — y cada paso dispara el motor.
 * Con el trigger mutilado el último asiento que queda es el del paso 3, armado
 * cuando todavía no había un peso en ninguna cuenta financiera.
 * `asiento_de_pago` cierra ese asiento como puede: pone la retención, pone la
 * cuenta corriente y manda el hueco entero —que es justo el importe del banco—
 * a "Diferencia de cambio". De ahí el 807 que aparecía en lugar del Galicia, sin
 * que el alta del banco tuviera nada mal: `cuentas_financieras.cuenta_contable_id`
 * estaba bien, el asiento nunca llegaba a leerlo.
 *
 * Un recibo sin retenciones sufría la otra cara del mismo bug: el paso 3 no
 * existe, el paso 4 no hacía nada, y el recibo se quedaba sin asiento.
 *
 * Se restituye la rama de `pago_id` y se regeneran los asientos ya guardados.
 */

create or replace function tg_asiento_movimiento() returns trigger
language plpgsql as $$
declare
  v_error text;
begin
  if tg_op = 'DELETE' then
    perform asiento_borrar('movimiento', old.id);
    perform asiento_falla('movimiento', old.id, null);
    -- El recibo del que colgaba se rehace en `tg_asiento_movimiento_del_pago`,
    -- que corre AFTER: acá la fila todavía existe y el motor la contaría.
    return old;
  end if;

  -- El movimiento de un recibo no tiene asiento propio —duplicaría el banco—
  -- pero sí es parte del asiento del recibo, que se rearma con él ya adentro.
  if new.pago_id is not null then
    perform asiento_borrar('movimiento', new.id);
    perform asiento_falla('movimiento', new.id, null);

    begin
      perform asiento_de_pago(new.pago_id);
      v_error := null;
    exception when others then
      v_error := sqlerrm;
      raise warning 'Recibo % sin asiento: %', new.pago_id, sqlerrm;
    end;

    perform asiento_falla('pago', new.pago_id, v_error);
  else
    begin
      perform asiento_de_movimiento(new.id);
      v_error := null;
    exception when others then
      v_error := sqlerrm;
      raise warning 'Movimiento % guardado sin asiento: %', new.id, sqlerrm;
    end;

    perform asiento_falla('movimiento', new.id, v_error);
  end if;

  -- Mover un movimiento de un recibo a otro (o soltarlo) deja al recibo viejo
  -- con un asiento que ya no lo describe.
  if tg_op = 'UPDATE' and old.pago_id is not null
     and old.pago_id is distinct from new.pago_id
     and exists (select 1 from pagos where id = old.pago_id) then
    begin
      perform asiento_de_pago(old.pago_id);
      v_error := null;
    exception when others then
      v_error := sqlerrm;
      raise warning 'Recibo % sin asiento: %', old.pago_id, sqlerrm;
    end;
    perform asiento_falla('pago', old.pago_id, v_error);
  end if;

  return new;
end $$;

/*
 * Sacarle plata a un recibo también cambia su asiento. Va en un trigger aparte
 * porque tiene que correr AFTER —con la fila ya fuera de la tabla— mientras que
 * el borrado del asiento propio del movimiento sigue yendo BEFORE.
 *
 * El `exists` no es defensivo de más: cuando se borra el recibo entero, el
 * cascade llega hasta acá y el asiento del recibo ya no tiene que renacer.
 */
create or replace function tg_asiento_movimiento_del_pago() returns trigger
language plpgsql as $$
declare
  v_error text;
begin
  if old.pago_id is null then return old; end if;
  if not exists (select 1 from pagos where id = old.pago_id) then return old; end if;

  begin
    perform asiento_de_pago(old.pago_id);
    v_error := null;
  exception when others then
    v_error := sqlerrm;
    raise warning 'Recibo % sin asiento: %', old.pago_id, sqlerrm;
  end;

  perform asiento_falla('pago', old.pago_id, v_error);
  return old;
end $$;

drop trigger if exists movimientos_asiento_pago_del on movimientos;
create trigger movimientos_asiento_pago_del
  after delete on movimientos
  for each row execute function tg_asiento_movimiento_del_pago();

/* ── Los recibos ya guardados quedaron con el asiento del paso 3 ──────────── */

do $$
declare
  d       record;
  n       integer := 0;
  v_error text;
begin
  for d in select id from pagos order by fecha, created_at loop
    begin
      perform asiento_de_pago(d.id);
      v_error := null;
      n := n + 1;
    exception when others then
      v_error := sqlerrm;
      raise warning 'Recibo % sin asiento: %', d.id, sqlerrm;
    end;
    perform asiento_falla('pago', d.id, v_error);
  end loop;

  raise notice 'Asientos de recibos regenerados: %', n;
end $$;
