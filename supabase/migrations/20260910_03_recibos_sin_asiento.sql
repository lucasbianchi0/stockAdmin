/*
 * Los recibos sin asiento también se ven
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `documentos_sin_asiento` listaba comprobantes y movimientos sueltos, pero no
 * recibos. La consecuencia es que un cobro o un pago que el motor no pudo asentar
 * no aparecía en ninguna pantalla: ni en el aviso de su módulo, ni en la lista de
 * pendientes de Contabilidad, ni en ningún lado. Quedaba fuera del mayor en
 * silencio, y el descuadre se descubría en el cierre.
 *
 * No es hipotético: el bug del trigger de movimientos dejó dos recibos sin
 * asiento y estuvieron invisibles hasta que alguien miró la base a mano.
 *
 * La regla del módulo es explícita —«si no se bloquea, tiene que verse»— y esta
 * es la mitad que faltaba.
 *
 * El motivo se deduce cuando se puede, porque «el motor no pudo» no le dice a
 * nadie qué hacer. Los tres casos reales, en orden de frecuencia:
 *
 *   · el recibo no está imputado a ningún comprobante;
 *   · no tiene ni un peso de contrapartida cargado;
 *   · la cuenta financiera por la que entró la plata no tiene cuenta contable
 *     asociada — ese lo escribe el propio motor en `asiento_fallas` y dice cuál.
 */

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
                      where a.origen = 'movimiento' and a.origen_id = m.id and a.estado = 'vigente')
  union all
  select 'pago', p.id, p.fecha,
         case when p.tipo = 'cobro' then 'Cobro' else 'Pago' end
           || ' a ' || coalesce(cl.razon_social, pr.razon_social, 's/ nombre'),
         -- Lo que entró o salió por las cuentas. Es el importe que la pantalla
         -- necesita mostrar para que alguien reconozca de qué recibo se habla.
         -- El cast no es cosmético: `sum()` devuelve un numeric sin precisión y
         -- eso cambiaría el tipo de la columna de la vista, que Postgres rechaza.
         (select coalesce(sum(mv.importe_ars), 0) from movimientos mv
           where mv.pago_id = p.id)::numeric(18, 2),
         coalesce(
           case
             when not exists (select 1 from imputaciones i where i.pago_id = p.id)
               then 'El recibo no está imputado a ningún comprobante'
             when not exists (select 1 from movimientos mv where mv.pago_id = p.id)
              and not exists (select 1 from pago_retenciones r where r.pago_id = p.id)
               then 'El recibo no tiene medio de pago ni retenciones cargadas'
           end,
           (select f.motivo from asiento_fallas f
             where f.origen = 'pago' and f.origen_id = p.id),
           'El motor no pudo armar el asiento'
         )
    from pagos p
    left join clientes    cl on cl.id = p.cliente_id
    left join proveedores pr on pr.id = p.proveedor_id
   where not exists (select 1 from asientos a
                      where a.origen = 'pago' and a.origen_id = p.id and a.estado = 'vigente');
