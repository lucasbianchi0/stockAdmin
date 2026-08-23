-- Con que tema se compuso cada pieza.
--
-- POR QUE HACE FALTA GUARDARLO. El tema no es una preferencia de quien mira: es
-- parte de la pieza. Decide la paleta, el layout, el logo, la direccion de arte
-- de la foto y —esto es lo importante— los limites con los que se escribio el
-- copy: el titular claro va en dos lineas de hasta 21 caracteres y el oscuro en
-- una columna de hasta 50 en total. Son dos textos distintos.
--
-- Sin esta columna, regenerar la imagen de una pieza clara la devolveria oscura,
-- con un titular escrito para otra composicion. El JPG que se reviso y se aprobo
-- dejaria de ser reproducible.
--
-- Default 'oscuro': todo lo que ya existe se compuso asi y se sigue componiendo
-- asi. La migracion no cambia ninguna pieza.
alter table content_slots add column if not exists tema text not null default 'oscuro'
  check (tema in ('oscuro', 'claro'));

-- El historial tambien lo anota. Un titular escrito para el tema claro —dos
-- lineas cortas y parejas— no sirve tal cual para el oscuro, asi que saber con
-- cual se escribio es parte de saber que se escribio.
alter table content_historial add column if not exists tema text not null default 'oscuro'
  check (tema in ('oscuro', 'claro'));
