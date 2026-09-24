/*
 * La nota de credito resta en el recibo
 * -----------------------------------------------------------------------------
 *
 * Reportado desde Administracion, textual: «en Cobro de Facturas cuando quiero
 * aplicar una Factura con una Nota de credito, la nota no resta, suman los dos.
 * Tendria que quedar en cero cuando marco la Factura y la NC».
 *
 * Aplicar una NC contra la factura que anula es el gesto mas comun del circuito
 * —el cliente no paga nada, los dos comprobantes se cancelan entre si— y era
 * justo el que no se podia registrar: el recibo pedia que entraran $ 199.996,02
 * por una operacion donde no entra un peso.
 *
 * La aritmetica de la pantalla y de la API se arregla en el codigo. Acá van las
 * dos piezas que viven en la base:
 *
 *   1. `asiento_de_pago` valuaba la deuda cancelada como la SUMA de las
 *      imputaciones, sin signo. En un recibo mixto —factura 150, NC 100, entran
 *      50— eso daba una contrapartida de 250 contra 50 de banco, y los 200 de
 *      diferencia se escapaban como «diferencia de cambio». Un asiento que
 *      cuadra y miente, que es la peor clase.
 *
 *   2. `documentos_sin_asiento` iba a listar cada aplicacion pura como un
 *      documento que el motor no pudo asentar. No es una falla: netear una NC
 *      contra su factura no mueve ninguna cuenta —las dos ya pasaron por
 *      Deudores por ventas con el mismo auxiliar—, asi que el asiento correcto
 *      es ninguno, y la vista tiene que saberlo para no ensuciar los pendientes
 *      de Contabilidad para siempre.
 */

/* -- 1 - El asiento de un recibo, con el signo de cada comprobante ------- */

create or replace function asiento_de_pago(p_id uuid) returns uuid
language plpgsql as $$
declare
  p           record;
  v_asiento   uuid;
  v_es_cobro  boolean;
  v_cuenta_ctp uuid;
  m           record;
  r           record;
  v_orden     smallint := 0;
  v_debe_ars  numeric(18, 2) := 0;
  v_deuda     numeric(18, 2) := 0;
  v_deuda_ars numeric(18, 2) := 0;
  v_dif_ars   numeric(18, 2);
begin
  select * into p from pagos where id = p_id;
  if not found then return null; end if;

  perform asiento_borrar('pago', p_id);

  v_es_cobro   := p.tipo = 'cobro';
  v_cuenta_ctp := case when v_es_cobro
    then cuenta_config('deudores_por_ventas') else cuenta_config('proveedores') end;
  if v_cuenta_ctp is null then return null; end if;

  -- Lo que se cancela de la cuenta corriente, valuado al TC de cada factura.
  -- Es deliberadamente distinto de lo que entró al banco: la brecha entre los
  -- dos es la diferencia de cambio.
  select
    coalesce(sum(i.importe * cp.signo), 0),
    coalesce(sum(cp.signo * case when cp.moneda = 'ARS' then i.importe
                      else round(i.importe * coalesce(i.tc_aplicado, cp.tc), 2) end), 0)
    into v_deuda, v_deuda_ars
    from imputaciones i join comprobantes cp on cp.id = i.comprobante_id
   where i.pago_id = p_id;

  -- Un recibo sin imputar no tiene contra qué asentar todavia. Tampoco uno que
  -- netea a cero: una nota de credito aplicada contra su factura no mueve
  -- ninguna cuenta —las dos ya pasaron por Deudores con el mismo auxiliar— y el
  -- asiento correcto es ninguno.
  if v_deuda_ars = 0 then return null; end if;

  -- Ni tampoco uno sin contrapartida de plata. Este caso es transitorio y real:
  -- el alta de un recibo inserta la cabecera, después las imputaciones y recién
  -- al final los movimientos, así que entre medio hay un instante con deuda y
  -- sin dinero. Sin este corte, ese instante generaría un asiento donde la
  -- diferencia de cambio absorbe el total del recibo — cuadra, pero es basura.
  if not exists (select 1 from movimientos where pago_id = p_id)
     and not exists (select 1 from pago_retenciones where pago_id = p_id) then
    return null;
  end if;

  v_asiento := asiento_crear(
    p.fecha, 'pago', p_id,
    case when v_es_cobro then 'Cobro a cliente' else 'Pago a proveedor' end
  );

  -- El dinero: un renglón por medio de pago, en la moneda de su cuenta.
  for m in
    select mv.*, cf.cuenta_contable_id as cuenta_cont, cf.nombre as cuenta_nombre
      from movimientos mv join cuentas_financieras cf on cf.id = mv.cuenta_id
     where mv.pago_id = p_id order by mv.created_at
  loop
    if m.cuenta_cont is null then
      raise exception 'La cuenta financiera "%" no tiene cuenta contable asociada', m.cuenta_nombre;
    end if;
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden, m.cuenta_cont,
      m.importe, m.importe_ars, m.moneda, m.tc, 1::smallint, null, null,
      m.cuenta_nombre, v_es_cobro);
    v_debe_ars := v_debe_ars + m.importe_ars;
  end loop;

  -- Las retenciones. En un cobro las sufrimos (son un crédito fiscal, van al
  -- debe); en un pago las practicamos (son una deuda con el fisco, al haber).
  for r in select * from pago_retenciones where pago_id = p_id order by tipo, jurisdiccion
  loop
    v_orden := v_orden + 1;
    declare
      v_cuenta uuid;
      v_ars numeric(18, 2) := case when p.moneda = 'ARS' then r.importe
                                   else round(r.importe * p.tc, 2) end;
    begin
      v_cuenta := coalesce(r.cuenta_contable_id, cuenta_config(
        case
          when not v_es_cobro then 'ret_ganancias_practicada'
          when r.tipo = 'ganancias' then 'ret_ganancias_sufrida'
          when r.tipo = 'iva'       then 'ret_iva_sufrida'
          when r.tipo = 'suss'      then 'ret_suss_sufrida'
          when r.tipo = 'iibb' and coalesce(r.jurisdiccion, '') ilike '%bs%as%'
                                    then 'ret_iibb_bsas_sufrida'
          else 'ret_iibb_caba_sufrida'
        end));
      perform asiento_linea(v_asiento, v_orden, v_cuenta,
        r.importe, v_ars, p.moneda, p.tc, 1::smallint, null, null,
        'Retención ' || r.tipo || coalesce(' ' || r.jurisdiccion, ''), v_es_cobro);
      v_debe_ars := v_debe_ars + v_ars;
    end;
  end loop;

  -- La cuenta corriente, al TC de las facturas.
  v_orden := v_orden + 1;
  perform asiento_linea(v_asiento, v_orden, v_cuenta_ctp,
    v_deuda, v_deuda_ars, p.moneda, p.tc, 1::smallint,
    case when v_es_cobro then 'cliente' else 'proveedor' end,
    coalesce(p.cliente_id, p.proveedor_id),
    case when v_es_cobro then 'Deudores por ventas' else 'Proveedores' end,
    not v_es_cobro);

  -- Y lo que sobra es diferencia de cambio.
  v_dif_ars := v_debe_ars - v_deuda_ars;
  if round(v_dif_ars, 2) <> 0 then
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden,
      cuenta_config(case when (v_dif_ars > 0) = v_es_cobro
                    then 'diferencia_cambio_ganada' else 'diferencia_cambio_perdida' end),
      abs(v_dif_ars), abs(v_dif_ars), 'ARS', 1, 1::smallint, null, null,
      'Diferencia de cambio', (v_dif_ars < 0) = v_es_cobro);
  end if;

  return v_asiento;
end $$;

/* -- 2 - La aplicacion de una nota de credito no es un documento sin asiento - */

/*
 * La vista se reescribe entera sobre la definicion que HOY tiene la base
 * —`pg_get_viewdef`—, no sobre la de `20260910_03`: `20260914_02` la volvio a
 * definir despues para sacar la pata muda de una transferencia ya asentada, y
 * partir de la version vieja habria borrado ese arreglo sin que se note.
 */
create or replace view public.documentos_sin_asiento as
 SELECT 'comprobante'::text AS origen,
    c.id,
    c.fecha,
    (c.clase || ' '::text) || COALESCE((c.punto_venta::text || '-'::text) || c.numero::text, 's/n'::text) AS referencia,
    c.total_ars AS importe_ars,
    COALESCE(
        CASE
            WHEN c.cuenta_contable_id IS NULL THEN 'Sin cuenta contable imputada'::text
            ELSE NULL::text
        END, ( SELECT f.motivo
           FROM asiento_fallas f
          WHERE f.origen = 'comprobante'::text AND f.origen_id = c.id), 'El motor no pudo armar el asiento'::text) AS motivo
   FROM comprobantes c
  WHERE c.estado = 'confirmado'::text AND NOT (EXISTS ( SELECT 1
           FROM asientos a
          WHERE a.origen = 'comprobante'::text AND a.origen_id = c.id AND a.estado = 'vigente'::text))
UNION ALL
 SELECT 'movimiento'::text AS origen,
    m.id,
    m.fecha,
    COALESCE(m.detalle, m.referencia, 'Movimiento'::text) AS referencia,
    m.importe_ars,
    COALESCE(
        CASE
            WHEN m.cuenta_contable_id IS NULL THEN 'Sin cuenta contable imputada'::text
            ELSE NULL::text
        END, ( SELECT f.motivo
           FROM asiento_fallas f
          WHERE f.origen = 'movimiento'::text AND f.origen_id = m.id), 'El motor no pudo armar el asiento'::text) AS motivo
   FROM movimientos m
  WHERE m.pago_id IS NULL AND NOT (EXISTS ( SELECT 1
           FROM asientos a
          WHERE a.origen = 'movimiento'::text AND a.origen_id = m.id AND a.estado = 'vigente'::text)) AND NOT (m.origen = 'transferencia'::text AND m.cuenta_contable_id IS NULL AND (EXISTS ( SELECT 1
           FROM movimientos s
             JOIN asientos a2 ON a2.origen = 'movimiento'::text AND a2.origen_id = s.id AND a2.estado = 'vigente'::text
          WHERE s.id <> m.id AND s.cuenta_id <> m.cuenta_id AND s.fecha = m.fecha AND s.importe = m.importe AND s.tipo <> m.tipo AND NOT s.referencia IS DISTINCT FROM m.referencia)))
UNION ALL
 SELECT 'pago'::text AS origen,
    p.id,
    p.fecha,
    (
        CASE
            WHEN p.tipo = 'cobro'::text THEN 'Cobro'::text
            ELSE 'Pago'::text
        END || ' a '::text) || COALESCE(cl.razon_social, pr.razon_social, 's/ nombre'::text) AS referencia,
    (( SELECT COALESCE(sum(mv.importe_ars), 0::numeric) AS "coalesce"
           FROM movimientos mv
          WHERE mv.pago_id = p.id))::numeric(18,2) AS importe_ars,
    COALESCE(
        CASE
            WHEN NOT (EXISTS ( SELECT 1
               FROM imputaciones i
              WHERE i.pago_id = p.id)) THEN 'El recibo no esta imputado a ningun comprobante'::text
            WHEN NOT (EXISTS ( SELECT 1
               FROM movimientos mv
              WHERE mv.pago_id = p.id)) AND NOT (EXISTS ( SELECT 1
               FROM pago_retenciones r
              WHERE r.pago_id = p.id)) THEN 'El recibo no tiene medio de pago ni retenciones cargadas'::text
            ELSE NULL::text
        END, ( SELECT f.motivo
           FROM asiento_fallas f
          WHERE f.origen = 'pago'::text AND f.origen_id = p.id), 'El motor no pudo armar el asiento'::text) AS motivo
   FROM pagos p
     LEFT JOIN clientes cl ON cl.id = p.cliente_id
     LEFT JOIN proveedores pr ON pr.id = p.proveedor_id
  WHERE NOT (EXISTS ( SELECT 1
           FROM asientos a
          WHERE a.origen = 'pago'::text AND a.origen_id = p.id AND a.estado = 'vigente'::text))
    -- Menos la aplicacion de una nota de credito, que no lleva asiento y no es
    -- una falla: la factura y la nota ya pasaron las dos por Deudores por ventas
    -- con el mismo auxiliar, y netearlas no mueve ninguna cuenta. Es la misma
    -- condicion con la que `asiento_de_pago` devuelve null. Sin esta excepcion,
    -- cada NC aplicada quedaba para siempre en los pendientes de Contabilidad
    -- pidiendo un medio de pago que nunca va a existir.
    AND NOT (EXISTS ( SELECT 1
           FROM imputaciones i
          WHERE i.pago_id = p.id)
      AND COALESCE(( SELECT sum(cp.signo::numeric * CASE WHEN cp.moneda = 'ARS'::text THEN i.importe
                     ELSE round(i.importe * COALESCE(i.tc_aplicado, cp.tc), 2) END)
             FROM imputaciones i
               JOIN comprobantes cp ON cp.id = i.comprobante_id
            WHERE i.pago_id = p.id), 0::numeric) = 0::numeric
      AND NOT (EXISTS ( SELECT 1
           FROM movimientos mv
          WHERE mv.pago_id = p.id))
      AND NOT (EXISTS ( SELECT 1
           FROM pago_retenciones r
          WHERE r.pago_id = p.id)));
