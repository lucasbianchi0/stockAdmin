-- Arregla el motor de asientos: no estaba generando ninguno.
--
-- EL SINTOMA
--
-- El libro diario vacío, el mayor vacío, sumas y saldos en cero — con
-- comprobantes, recibos y movimientos cargados. Y sin ningún error a la vista:
-- la carga de una factura respondía "guardado" con toda normalidad.
--
-- LA CAUSA
--
-- `asiento_linea` declara su segundo parámetro como `smallint`:
--
--     create function asiento_linea(p_asiento uuid, p_orden smallint, ...)
--
-- y las doce llamadas del motor le pasan un literal:
--
--     perform asiento_linea(v_asiento, 1, c.cuenta_contable_id, ...)
--
-- En PostgreSQL un literal entero es `integer`, y la resolución de funciones
-- **no** convierte `integer` a `smallint` — es una conversión que puede perder
-- datos, así que solo se hace en asignación, nunca al elegir qué función
-- llamar. Resultado: `function asiento_linea(uuid, integer, ...) does not exist`.
--
-- POR QUE NO SE NOTO
--
-- El trigger envuelve al motor en un `exception when others` que degrada el
-- fallo a `raise warning`. La intención era buena —que un problema contable no
-- impida cargar una factura— pero un warning en el log del servidor no lo lee
-- nadie. La lista `documentos_sin_asiento` sí lo mostraba, con el motivo
-- genérico "el motor no pudo armar el asiento".
--
-- EL ARREGLO
--
-- El parámetro pasa a `integer`. La columna `asiento_lineas.orden` sigue siendo
-- `smallint` y la conversión ocurre en el INSERT, que es una asignación y ahí sí
-- es válida. `drop` antes de `create` porque cambiar el tipo de un parámetro
-- crea una sobrecarga nueva en vez de reemplazar la función.

/* ── Segundo bug: el TC de la línea ───────────────────────────────────────── */

-- `asiento_lineas.tc` es `not null default 1`, escrito antes de la migración que
-- convirtió `tc` en "pesos por dólar de este documento, o NULL si no se conoce".
-- Un comprobante en pesos sin cotización cargada le pasa NULL a la línea y el
-- asiento entero se cae.
--
-- La columna pasa a nullable, que es lo consistente: el TC de una línea es un
-- dato de valuación, y no saberlo es una respuesta válida. El default 1 se saca
-- porque ese 1 era justamente el que hacía que el importe en dólares diera igual
-- que el importe en pesos.
alter table asiento_lineas alter column tc drop not null;
alter table asiento_lineas alter column tc drop default;

drop function if exists asiento_linea(
  uuid, smallint, uuid, numeric, numeric, text, numeric, smallint, text, uuid, text, boolean
);

create or replace function asiento_linea(
  p_asiento uuid, p_orden integer, p_cuenta uuid,
  p_importe numeric, p_importe_ars numeric,
  p_moneda text, p_tc numeric, p_signo smallint,
  p_auxiliar_tipo text default null, p_auxiliar_id uuid default null,
  p_detalle text default null, p_al_debe boolean default true
) returns void language plpgsql as $$
declare
  v_debe boolean := case when p_signo < 0 then not p_al_debe else p_al_debe end;
begin
  -- Los importes en cero no se escriben: una factura sin percepciones no tiene
  -- por qué arrastrar una línea de percepciones en cero por todo el mayor.
  if p_importe is null or round(p_importe, 2) = 0 then return; end if;
  if p_cuenta is null then
    raise exception 'Falta la cuenta contable para una línea de % (%)', p_detalle, p_importe;
  end if;

  insert into asiento_lineas (
    asiento_id, orden, cuenta_contable_id,
    debe, haber, moneda, tc, debe_ars, haber_ars,
    auxiliar_tipo, auxiliar_id, detalle
  ) values (
    p_asiento, p_orden, p_cuenta,
    case when v_debe then abs(round(p_importe, 2))     else 0 end,
    case when v_debe then 0 else abs(round(p_importe, 2)) end,
    p_moneda, p_tc,
    case when v_debe then abs(round(p_importe_ars, 2)) else 0 end,
    case when v_debe then 0 else abs(round(p_importe_ars, 2)) end,
    p_auxiliar_tipo, p_auxiliar_id, p_detalle
  );
end $$;

/* ── Que la próxima vez se note ───────────────────────────────────────────── */

-- El `exception when others` que tapó esto sigue siendo la decisión correcta:
-- que la contabilidad falle no puede impedir registrar una venta. Lo que estaba
-- mal era que el motivo se perdiera en un warning que no lee nadie.
--
-- El motivo se guarda en una tabla aparte y no en una columna del documento.
-- La razón es técnica y vale la pena anotarla: los triggers del motor son
-- `after`, porque `asiento_de_comprobante` lee la fila de la tabla y en un
-- trigger `before insert` la fila todavía no está. Y en un trigger `after` no se
-- puede escribir en `new`: la asignación se descarta en silencio. Una tabla
-- lateral se puede escribir desde donde sea.
create table if not exists asiento_fallas (
  origen     text not null check (origen in ('comprobante', 'pago', 'movimiento')),
  origen_id  uuid not null,
  motivo     text not null,
  ocurrido_at timestamptz not null default now(),
  primary key (origen, origen_id)
);

alter table asiento_fallas enable row level security;

-- Registrar o limpiar la falla de un documento, según le haya ido al motor.
create or replace function asiento_falla(p_origen text, p_id uuid, p_motivo text)
returns void language plpgsql as $$
begin
  if p_motivo is null then
    delete from asiento_fallas where origen = p_origen and origen_id = p_id;
  else
    insert into asiento_fallas (origen, origen_id, motivo)
    values (p_origen, p_id, p_motivo)
    on conflict (origen, origen_id)
      do update set motivo = excluded.motivo, ocurrido_at = now();
  end if;
end $$;

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

  -- Un borrador todavía no es un hecho contable y un anulado dejó de serlo. El
  -- borrado explícito hace que pasar de confirmado a borrador se lleve el
  -- asiento en vez de dejarlo colgado en el mayor.
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

create or replace function tg_asiento_pago() returns trigger
language plpgsql as $$
declare
  v_error text;
begin
  if tg_op = 'DELETE' then
    perform asiento_borrar('pago', old.id);
    perform asiento_falla('pago', old.id, null);
    return old;
  end if;

  begin
    perform asiento_de_pago(new.id);
    v_error := null;
  exception when others then
    v_error := sqlerrm;
    raise warning 'Recibo % guardado sin asiento: %', new.id, sqlerrm;
  end;

  perform asiento_falla('pago', new.id, v_error);
  return new;
end $$;

create or replace function tg_asiento_movimiento() returns trigger
language plpgsql as $$
declare
  v_error text;
begin
  if tg_op = 'DELETE' then
    perform asiento_borrar('movimiento', old.id);
    perform asiento_falla('movimiento', old.id, null);
    return old;
  end if;

  -- Los movimientos que cuelgan de un recibo ya están en el asiento del recibo:
  -- asentarlos otra vez duplicaría el banco.
  if new.pago_id is not null then
    perform asiento_falla('movimiento', new.id, null);
    return new;
  end if;

  begin
    perform asiento_de_movimiento(new.id);
    v_error := null;
  exception when others then
    v_error := sqlerrm;
    raise warning 'Movimiento % guardado sin asiento: %', new.id, sqlerrm;
  end;

  perform asiento_falla('movimiento', new.id, v_error);
  return new;
end $$;

/* ── El motivo real en la lista de pendientes ─────────────────────────────── */

create or replace view documentos_sin_asiento as
  select 'comprobante' as origen, c.id, c.fecha,
         c.clase || ' ' || coalesce(c.punto_venta::text || '-' || c.numero::text, 's/n') as referencia,
         c.total_ars as importe_ars,
         coalesce(
           case when c.cuenta_contable_id is null then 'Sin cuenta contable imputada' end,
           (select f.motivo from asiento_fallas f
             where f.origen = 'comprobante' and f.origen_id = c.id),
           'El motor no pudo armar el asiento'
         ) as motivo
    from comprobantes c
   where c.estado = 'confirmado'
     and not exists (select 1 from asientos a
                      where a.origen = 'comprobante' and a.origen_id = c.id and a.estado = 'vigente')
  union all
  select 'movimiento', m.id, m.fecha,
         coalesce(m.detalle, m.referencia, 'Movimiento'), m.importe_ars,
         coalesce(
           case when m.cuenta_contable_id is null then 'Sin cuenta contable imputada' end,
           (select f.motivo from asiento_fallas f
             where f.origen = 'movimiento' and f.origen_id = m.id),
           'El motor no pudo armar el asiento'
         )
    from movimientos m
   where m.pago_id is null
     and not exists (select 1 from asientos a
                      where a.origen = 'movimiento' and a.origen_id = m.id and a.estado = 'vigente');

/* ── Regenerar todo lo que quedó sin asiento ──────────────────────────────── */

-- El backfill de la migración de asientos corrió con la función rota, así que
-- no escribió nada. Se vuelve a correr, ahora sí.
do $$
declare
  d record;
  n integer := 0;
begin
  for d in
    select id from comprobantes where estado = 'confirmado' order by fecha, created_at
  loop
    begin
      perform asiento_de_comprobante(d.id);
      n := n + 1;
    exception when others then
      raise warning 'Comprobante % sin asiento: %', d.id, sqlerrm;
    end;
  end loop;

  for d in select id from pagos order by fecha, created_at loop
    begin
      perform asiento_de_pago(d.id);
      n := n + 1;
    exception when others then
      raise warning 'Recibo % sin asiento: %', d.id, sqlerrm;
    end;
  end loop;

  for d in
    select id from movimientos where pago_id is null order by fecha, created_at
  loop
    begin
      perform asiento_de_movimiento(d.id);
      n := n + 1;
    exception when others then
      raise warning 'Movimiento % sin asiento: %', d.id, sqlerrm;
    end;
  end loop;

  raise notice 'Asientos regenerados: % documentos procesados', n;
end $$;
