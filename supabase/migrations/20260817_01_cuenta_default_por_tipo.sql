-- Cuenta de imputacion por defecto para la carga de facturas.
--
-- EL PROBLEMA
--
-- `asiento_de_comprobante` corta y no genera nada cuando el comprobante no tiene
-- `cuenta_contable_id`. Es correcto: no hay forma de inventar contra que se
-- imputa un gasto. En la carga manual casi no se nota, porque al elegir el
-- proveedor el formulario copia la cuenta que la ficha tiene guardada.
--
-- Donde si se notaba es en la carga automatica de PDF, y de la peor manera: un
-- proveedor recien dado de alta todavia no tiene cuenta en la ficha, asi que sus
-- primeras facturas entraban sin imputar. La deuda quedaba, el saldo del
-- proveedor quedaba, y en el mayor no habia nada — una contabilidad que
-- descuadra en silencio y se descubre al cierre.
--
-- LA SOLUCION, Y SU LIMITE
--
-- Un ultimo escalon despues de la ficha. No adivina mejor que una persona:
-- adivina lo que pasa la mayoria de las veces en una empresa de reventa, deja el
-- asiento armado, y la pantalla de carga muestra cual eligio para poder
-- cambiarla antes de guardar. Que sea configuracion y no una constante en el
-- codigo es el punto: el contador la cambia con un UPDATE de una linea.
--
-- `do nothing` y no `do update`: si alguien ya las eligio distinto, esta
-- migracion no le pisa la eleccion.

insert into config_contable (clave, cuenta_id, descripcion)
select v.clave, p.id, v.descripcion
  from (values
  ('compras_default', '508', 'Imputacion por defecto de una factura de compra sin cuenta en la ficha'),
  ('ventas_default',  '811', 'Imputacion por defecto de una factura de venta sin cuenta en la ficha')
  ) as v (clave, codigo, descripcion)
  join plan_cuentas p on p.codigo = v.codigo
on conflict (clave) do nothing;
