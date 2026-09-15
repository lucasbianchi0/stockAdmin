-- Un cliente consumidor final se puede identificar por DNI.
--
-- Una persona sin CUIT a la que se le hace factura B tiene DNI, y el check de
-- once dígitos no dejaba cerrar la ficha: o se inventaba un CUIT o quedaba sin
-- documento, que es la ficha que después se duplica.
--
-- Va en la misma columna `cuit` y no en una nueva: el largo dice qué es (7 u 8
-- un DNI, 11 un CUIT), y así el índice único, la búsqueda y el aviso de
-- duplicado siguen funcionando sin tocar nada. Sólo clientes: un proveedor
-- factura siempre con CUIT y su check queda como estaba.
--
-- Ensancha lo que acepta la columna; ninguna fila existente puede violarlo.

alter table clientes drop constraint if exists clientes_cuit_check;
alter table clientes add constraint clientes_cuit_check
  check (cuit ~ '^([0-9]{11}|[0-9]{7,8})$');
