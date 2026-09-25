/*
 * Pagos y cobros a cuenta: el anticipo como primera clase
 * -----------------------------------------------------------------------------
 *
 * Dos pedidos de Administracion que resultaron ser el mismo:
 *
 *   «Hay casos en los que se le paga al proveedor y despues que se retira el
 *    producto te emiten la factura. Se puede cargar el pago sin imputar una
 *    factura, y despues ir aplicando las facturas contra ese pago? Porque hasta
 *    no tener la factura no puedo cargar el movimiento y me queda desfasado con
 *    el saldo del banco.»
 *
 *   «Si no cierra justo el importe de las facturas y el pago, no te deja cargar
 *    el pago. En Solution Box quiero aplicar las facturas y dejar un saldo a
 *    favor y no puedo.»
 *
 * Los dos son plata que salio del banco y que todavia no tiene factura contra
 * la cual imputarse. Uno es todo el pago; el otro, la punta que sobra.
 *
 * POR QUE NO ALCANZABA CON SACAR LA VALIDACION
 *
 * Lo que el formulario exige hoy —lo que cancela = lo que salio + retenciones—
 * no es un capricho: es lo que evita que alguien impute por el total de una
 * factura olvidando la retencion y deje la caja descuadrada. Y sacarla sin mas
 * tampoco los dejaba cargar bien el movimiento: el asiento cierra la diferencia
 * contra «diferencia de cambio», asi que esos 15,59 de Solution Box se habrian
 * ido a un resultado financiero inventado. Un asiento que cuadra y miente.
 *
 * La ecuacion no se rompe: se le agrega el termino que le faltaba.
 *
 *     lo que cancela  +  lo que queda a cuenta  =  lo que salio  +  retenciones
 *
 * `pagos.a_cuenta` es ese termino. Positivo, es plata entregada que todavia no
 * tiene factura —el anticipo—. Negativo, es un anticipo anterior que se esta
 * consumiendo para cancelar facturas. El saldo a favor de una ficha es la suma
 * de los dos, y por eso no hace falta ninguna tabla nueva: aplicar un anticipo
 * es cargar un recibo comun donde la plata sale del saldo y no del banco.
 *
 * Contablemente cae en las cuentas que el plan del contador ya tenia esperando:
 * 115 Anticipos a proveedores y 210 Anticipos de clientes.
 */

/* -- 1 - La columna ------------------------------------------------------- */

alter table pagos
  add column if not exists a_cuenta numeric(18, 2) not null default 0;

comment on column pagos.a_cuenta is
  'Parte del recibo que no imputa contra ningun comprobante. Positivo: anticipo entregado. Negativo: anticipo anterior que se consume. En la moneda del recibo.';

/* -- 2 - Las dos cuentas del plan ----------------------------------------- */

insert into config_contable (clave, cuenta_id, descripcion)
select v.clave, p.id, v.descripcion
  from (values
  ('anticipos_a_proveedores', '115',
   'Pagos a cuenta a un proveedor, todavia sin factura que los respalde'),
  ('anticipos_de_clientes', '210',
   'Cobros a cuenta de un cliente, todavia sin factura que los respalde')
  ) as v (clave, codigo, descripcion)
  join plan_cuentas p on p.codigo = v.codigo
on conflict (clave) do nothing;

/* -- 3 - El saldo a favor de cada ficha ------------------------------------ */

/*
 * Por moneda y no convertido: un anticipo en dolares se aplica a facturas en
 * dolares. Mezclarlos obligaria a elegir un tipo de cambio para un saldo que
 * todavia no se movio, y ese numero cambiaria solo todos los dias.
 *
 * Solo las que tienen algo: una ficha sin anticipos no es una fila con cero.
 */
create or replace view saldos_a_cuenta as
  select
    case when p.tipo = 'cobro' then 'cliente' else 'proveedor' end as entidad_tipo,
    coalesce(p.cliente_id, p.proveedor_id)                        as entidad_id,
    p.moneda,
    round(sum(p.a_cuenta), 2)                                     as saldo
    from pagos p
   where p.a_cuenta <> 0
     and coalesce(p.cliente_id, p.proveedor_id) is not null
   group by 1, 2, 3
  having round(sum(p.a_cuenta), 2) <> 0;

/* -- 4 - El asiento, con el renglon del anticipo --------------------------- */

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
  v_cuenta     numeric(18, 2);
  v_cuenta_ars numeric(18, 2);
  v_cuenta_ant uuid;
begin
  select * into p from pagos where id = p_id;
  if not found then return null; end if;

  perform asiento_borrar('pago', p_id);

  v_es_cobro   := p.tipo = 'cobro';

  -- Lo que este recibo NO imputa a ningun comprobante: un anticipo cuando es
  -- positivo, el consumo de uno anterior cuando es negativo.
  v_cuenta     := coalesce(p.a_cuenta, 0);
  v_cuenta_ars := case when p.moneda = 'ARS' then v_cuenta
                       else round(v_cuenta * coalesce(p.tc, 0), 2) end;
  v_cuenta_ctp := case when v_es_cobro
    then cuenta_config('deudores_por_ventas') else cuenta_config('proveedores') end;
  if v_cuenta_ctp is null then return null; end if;

  -- 115 Anticipos a proveedores / 210 Anticipos de clientes. Se exige solo
  -- cuando hace falta: un recibo sin anticipo no tiene por que depender de una
  -- cuenta que quiza nadie configuro.
  if v_cuenta <> 0 then
    v_cuenta_ant := cuenta_config(case when v_es_cobro
      then 'anticipos_de_clientes' else 'anticipos_a_proveedores' end);
    if v_cuenta_ant is null then return null; end if;
  end if;

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
  if v_deuda_ars = 0 and v_cuenta_ars = 0 then return null; end if;

  -- Ni tampoco uno sin contrapartida de plata. Este caso es transitorio y real:
  -- el alta de un recibo inserta la cabecera, después las imputaciones y recién
  -- al final los movimientos, así que entre medio hay un instante con deuda y
  -- sin dinero. Sin este corte, ese instante generaría un asiento donde la
  -- diferencia de cambio absorbe el total del recibo — cuadra, pero es basura.
  if v_cuenta = 0
     and not exists (select 1 from movimientos where pago_id = p_id)
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

  -- El anticipo. Del mismo lado que la cuenta corriente —lo que se paga de mas
  -- a un proveedor es un credito contra el, lo que un cliente paga de mas es
  -- una deuda con el— y con el signo al reves cuando se esta consumiendo uno
  -- anterior, que `asiento_linea` traduce dando vuelta debe y haber.
  if v_cuenta <> 0 then
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden, v_cuenta_ant,
      abs(v_cuenta), abs(v_cuenta_ars), p.moneda, p.tc,
      (case when v_cuenta < 0 then -1 else 1 end)::smallint,
      case when v_es_cobro then 'cliente' else 'proveedor' end,
      coalesce(p.cliente_id, p.proveedor_id),
      case when v_es_cobro then 'Anticipos de clientes' else 'Anticipos a proveedores' end,
      not v_es_cobro);
  end if;

  -- Y lo que sobra es diferencia de cambio.
  v_dif_ars := v_debe_ars - v_deuda_ars - v_cuenta_ars;
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
