-- Imagenes de referencia de un template de imagen.
--
-- Rutas dentro del bucket "generador" (templates/<id>/...). Al usar el template,
-- se cargan como referencias del pedido para que la generacion se base en ellas:
-- una pieza modelo, un producto, una foto del equipo.
alter table generador_templates add column if not exists referencias text[] not null default '{}';
