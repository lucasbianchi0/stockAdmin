/*
 * Stock: para qué se tiene cada ítem, en qué se mide y en qué moneda se compró.
 * ADITIVO, en prueba, sobre 20261016_04_stock.sql.
 *
 *  · `stock_items.destino`: 'venta' (se revende, sale con factura) o 'material'
 *    (se usa en los trabajos, sale como consumo).
 *  · `stock_items.unidad`: unidades, metros, kilos… Con número de serie sólo
 *    unidades.
 *  · `stock_movimientos.moneda` + `precio`: el precio unitario tal como se pagó
 *    (o cobró), en dólares o en pesos. `precio_usd` sigue siendo lo que valoriza
 *    el stock —el contador lo pidió en dólares—: si se compró en pesos, es
 *    `precio / tc`. Por eso pasa a 4 decimales: $ 1.000 a 1.540 son US$ 0,6494.
 *  · Tipo de movimiento 'consumo': un material que se usó en un trabajo. Sale
 *    sin factura y con el trabajo en el detalle.
 *
 * Revertir: supabase/revertir/20261018_01_stock_destino_unidad_moneda.sql
 */

alter table stock_items
  add column if not exists destino text not null default 'venta' check (destino in ('venta', 'material')),
  add column if not exists unidad text not null default 'unidad'
    check (unidad in ('unidad', 'metro', 'kilo', 'litro', 'caja', 'rollo')),
  add constraint stock_items_serie_por_unidad check (not lleva_serie or unidad = 'unidad');

-- Las vistas expanden m.* al crearse: hay que rehacerlas para que vean las
-- columnas nuevas, y soltarlas para poder cambiar el tipo de precio_usd.
drop view if exists stock_saldos;
drop view if exists stock_movimientos_vigentes;

alter table stock_movimientos
  alter column precio_usd type numeric(16, 4),
  add column if not exists moneda text not null default 'USD' check (moneda in ('USD', 'ARS')),
  add column if not exists precio numeric(14, 2) check (precio is null or precio >= 0);

update stock_movimientos set precio = precio_usd where precio is null and precio_usd is not null;

alter table stock_movimientos drop constraint if exists stock_movimientos_tipo_check;
alter table stock_movimientos add constraint stock_movimientos_tipo_check
  check (tipo in ('inicial', 'compra', 'venta', 'consumo', 'ajuste'));
alter table stock_movimientos drop constraint if exists stock_movimientos_check;
alter table stock_movimientos add constraint stock_movimientos_check check (
  (tipo in ('inicial', 'compra') and cantidad > 0) or
  (tipo in ('venta', 'consumo') and cantidad < 0) or
  tipo = 'ajuste'
);

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
select i.id as item_id, i.nombre, i.codigo, i.lleva_serie, i.activo, i.destino, i.unidad,
       coalesce(sum(m.cantidad), 0) as saldo,
       coalesce(sum(m.cantidad) filter (where m.cantidad > 0), 0) as entradas,
       coalesce(-sum(m.cantidad) filter (where m.cantidad < 0), 0) as salidas,
       -- Costo promedio de lo que entró, en dólares.
       case when sum(m.cantidad) filter (where m.cantidad > 0 and m.precio_usd is not null) > 0
         then round(
           sum(m.cantidad * m.precio_usd) filter (where m.cantidad > 0 and m.precio_usd is not null) /
           sum(m.cantidad) filter (where m.cantidad > 0 and m.precio_usd is not null), 4)
       end as costo_promedio_usd,
       max(m.fecha) as ultimo_movimiento
  from stock_items i
  left join stock_movimientos_vigentes m on m.item_id = i.id
 group by i.id;
