/*
 * Presupuestos: mas tipos de renglon y la alicuota de IVA por renglon
 * -----------------------------------------------------------------------------
 *
 * Pedido de Comercial (06-10-26):
 *
 *   «En TIPO deberiamos agregar mas opciones: Materiales, Mano de Obra,
 *    Hardware, Licencia, Servicios, Otros»
 *
 *   «Deberiamos agregar en la carga del item el TIPO de IVA, asi cuando hagamos
 *    que el presupuesto salga directo, tenga discriminado los items que llevan
 *    10,5 % y 21 %»
 *
 * LOS TIPOS
 *
 * Con solo tres, la Wacom, los cargadores y las licencias terminaban en "otro",
 * que arranca sin margen —es el tipo del flete que se absorbe— y obligaba a
 * escribir la venta a mano en cada uno. Los nuevos toman margen: hardware y
 * licencia el de materiales, servicio el de mano de obra (eso vive en la app,
 * en `margenDe`). Los renglones existentes no se reclasifican: eso lo decide
 * quien conoce cada presupuesto, no una migracion.
 *
 * EL IVA
 *
 * La columna `iva` existe desde el principio, pero la pantalla la pisaba con
 * 21 % en cada guardado. Ahora se elige por renglon, y el check deja entrar
 * solo las dos alicuotas que se usan: un 0,15 tipeado por error no puede
 * aparecer discriminado en una propuesta.
 */

alter table presupuesto_items drop constraint if exists presupuesto_items_tipo_check;
alter table presupuesto_items add constraint presupuesto_items_tipo_check
  check (tipo in ('material', 'mano_obra', 'hardware', 'licencia', 'servicio', 'otro'));

alter table presupuesto_items drop constraint if exists presupuesto_items_iva_check;
alter table presupuesto_items add constraint presupuesto_items_iva_check
  check (iva in (0.105, 0.21));
