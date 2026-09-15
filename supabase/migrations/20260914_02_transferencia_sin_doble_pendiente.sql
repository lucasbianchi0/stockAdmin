-- La otra pata de una transferencia ya asentada deja de figurar en "Sin asentar".
--
-- Una transferencia son dos movimientos y un solo asiento: el de la pata que
-- tiene cuenta contable (egreso del Galicia contra la cuenta 17 de Mercado
-- Pago, por ejemplo). La otra pata no lleva cuenta a propósito; si figurara
-- como pendiente, alguien le imputaría una y el mayor contaría la plata dos
-- veces. Las dos patas se reconocen por fecha, importe, sentido opuesto y
-- referencia, que es como las escribe el alta de transferencias.

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
          WHERE a.origen = 'movimiento'::text AND a.origen_id = m.id AND a.estado = 'vigente'::text))
    -- La otra pata de una transferencia ya asentada no está pendiente: el
    -- asiento de la transferencia es uno solo y vive en la pata que tiene la
    -- cuenta contable. Imputarle una cuenta a ésta lo duplicaría.
    AND NOT (m.origen = 'transferencia'::text AND m.cuenta_contable_id IS NULL AND EXISTS ( SELECT 1
           FROM movimientos s
             JOIN asientos a2 ON a2.origen = 'movimiento'::text AND a2.origen_id = s.id AND a2.estado = 'vigente'::text
          WHERE s.id <> m.id AND s.cuenta_id <> m.cuenta_id AND s.fecha = m.fecha AND s.importe = m.importe
            AND s.tipo <> m.tipo AND s.referencia IS NOT DISTINCT FROM m.referencia))
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
          WHERE a.origen = 'pago'::text AND a.origen_id = p.id AND a.estado = 'vigente'::text));
