-- Deshace 20261018_01_stock_destino_unidad_moneda.sql. Los consumos se borran:
-- el tipo deja de existir.
drop view if exists stock_saldos;
drop view if exists stock_movimientos_vigentes;

delete from stock_movimientos where tipo = 'consumo';
alter table stock_movimientos drop constraint if exists stock_movimientos_tipo_check;
alter table stock_movimientos add constraint stock_movimientos_tipo_check
  check (tipo in ('inicial', 'compra', 'venta', 'ajuste'));
alter table stock_movimientos drop constraint if exists stock_movimientos_check;
alter table stock_movimientos add constraint stock_movimientos_check check (
  (tipo in ('inicial', 'compra') and cantidad > 0) or
  (tipo = 'venta' and cantidad < 0) or
  tipo = 'ajuste'
);
alter table stock_movimientos drop column if exists moneda, drop column if exists precio;
alter table stock_movimientos alter column precio_usd type numeric(14, 2);

alter table stock_items drop constraint if exists stock_items_serie_por_unidad;
alter table stock_items drop column if exists destino, drop column if exists unidad;

create view stock_movimientos_vigentes as
select m.*,
       c.clase as comprobante_clase,
       c.punto_venta as comprobante_punto_venta,
       c.numero as comprobante_numero,
       coalesce(cl.razon_social, pr.razon_social) as entidad
  from stock_movimientos m
  left join comprobantes c on c.id = m.comprobante_id
  left join clientes cl on cl.id = c.cliente_id
  left join proveedores pr on pr.id = c.proveedor_id
 where m.comprobante_id is null or c.estado = 'confirmado';

create view stock_saldos as
select i.id as item_id, i.nombre, i.codigo, i.lleva_serie, i.activo,
       coalesce(sum(m.cantidad), 0) as saldo,
       coalesce(sum(m.cantidad) filter (where m.cantidad > 0), 0) as entradas,
       coalesce(-sum(m.cantidad) filter (where m.cantidad < 0), 0) as salidas,
       case when sum(m.cantidad) filter (where m.cantidad > 0 and m.precio_usd is not null) > 0
         then round(
           sum(m.cantidad * m.precio_usd) filter (where m.cantidad > 0 and m.precio_usd is not null) /
           sum(m.cantidad) filter (where m.cantidad > 0 and m.precio_usd is not null), 2)
       end as costo_promedio_usd,
       max(m.fecha) as ultimo_movimiento
  from stock_items i
  left join stock_movimientos_vigentes m on m.item_id = i.id
 group by i.id;
