/*
 * El legajo de un presupuesto
 * -----------------------------------------------------------------------------
 *
 * Pedido de Administracion, con su motivo:
 *
 *   «La idea es que cada PRES sirva como legajo y poder guardar todo lo
 *    relacionado: remitos, facturas de compra, facturas de venta, OC, etc.
 *    Porque si con el tiempo te piden el N° de serie de un producto que
 *    entregaste, buscando ahi la factura es mas facil; o si hay que hacer algun
 *    reclamo.»
 *
 * La tabla `presupuesto_adjuntos` ya existia desde la migracion del modulo. Lo
 * que falta es donde viven los archivos: un bucket propio, privado, igual que
 * el de comprobantes.
 *
 * Privado y no publico: un remito lleva direcciones y numeros de serie, y una
 * factura de compra lleva el costo. Nada de eso puede quedar accesible con solo
 * saber la direccion del archivo. Se sirve con URLs firmadas que vencen.
 */

insert into storage.buckets (id, name, public)
values ('presupuestos', 'presupuestos', false)
on conflict (id) do nothing;
