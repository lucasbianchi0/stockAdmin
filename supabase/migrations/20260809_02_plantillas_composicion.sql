-- La receta de composicion leida de la imagen subida.
--
-- La plantilla deja de ser "una foto que el generador copia" y pasa a ser una
-- ESTRUCTURA en texto: donde va el sujeto, que proporcion ocupa cada bloque,
-- que tipo de fondo. Eso es lo unico reutilizable de una pieza ajena — el color
-- y el contenido son de su marca, no de la nuestra.
--
-- Va en texto y editable a proposito: la lectura automatica acierta al 80% y el
-- 20% restante se corrige a mano en vez de descartar la plantilla entera.
alter table plantillas add column if not exists composicion text;
