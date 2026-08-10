-- Calendario V2 — varios planes conviviendo, template por pieza, imagen persistida.
--
-- Toda la migracion es aditiva: tres columnas nullables o con default. El plan
-- que hoy esta cargado, con sus slots y su contenido generado, sigue andando sin
-- tocarlo. Nada de lo de aca rompe el codigo que ya esta desplegado.

/* ── Varios planes conviviendo ────────────────────────────────────────────── */

-- "archivado" era un booleano porque solo habia dos situaciones posibles: el
-- plan activo y los viejos. Pero un plan tiene mas vida que esa: se arma antes
-- de arrancar (borrador), se ejecuta (activo) y se termina de publicar
-- (terminado) mucho antes de que a alguien le interese esconderlo. Con el
-- booleano, "ya lo publique todo" y "no quiero verlo mas" son el mismo estado.
alter table content_plans add column if not exists estado text not null default 'activo'
  check (estado in ('borrador', 'activo', 'terminado', 'archivado'));

-- El titulo lo escribe el modelo al generar el plan. "nombre" es como lo llama
-- el usuario despues, y manda cuando esta: son dos cosas distintas y pisar una
-- con la otra obligaria a elegir entre renombrar o perder lo que propuso el
-- modelo. La UI muestra coalesce(nombre, titulo).
alter table content_plans add column if not exists nombre text;

-- Backfill acotado a proposito: al agregar la columna, las filas que ya existian
-- quedaron todas en 'activo' por el default, asi que lo unico que falta corregir
-- son las archivadas. Escribir "set estado = case when archivado ..." para toda
-- la tabla parece mas prolijo pero no es idempotente: una segunda corrida
-- devolveria a 'activo' cualquier plan que para entonces estuviera en 'borrador'
-- o 'terminado'.
update content_plans set estado = 'archivado' where archivado and estado <> 'archivado';

create index if not exists content_plans_estado_idx
  on content_plans (estado, fecha_inicio desc);

/* ── Las dos columnas, sincronizadas mientras dure la transicion ──────────── */

-- "archivado" no se borra todavia. Las queries de hoy filtran archivado = false
-- y migrarlas a "estado" lleva mas de un commit; cualquier consulta que quede a
-- mitad de camino dejaria de encontrar el plan y la pantalla apareceria vacia,
-- sin error — que es la peor forma de romperse, porque nadie se entera.
--
-- El trigger hace que escribir cualquiera de las dos columnas actualice la otra,
-- asi que el codigo viejo y el nuevo pueden convivir sin coordinarse. Cuando la
-- fase 2 este cerrada y ninguna query mencione "archivado", se borran el trigger,
-- la funcion y la columna de una.
-- search_path vacio: el cuerpo no nombra ninguna tabla ni funcion propia, solo
-- toca NEW y OLD, asi que no pierde nada — y el linter de Supabase marca como
-- riesgo toda funcion que deje el search_path abierto.
create or replace function content_plans_sync_estado() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- En un insert no hay valor anterior contra el cual comparar, asi que manda
    -- el que sea explicito. Un insert que solo dice archivado = true (el codigo
    -- viejo) tiene que quedar archivado igual.
    if new.archivado then
      new.estado := 'archivado';
    else
      new.archivado := (new.estado = 'archivado');
    end if;
    return new;
  end if;

  -- En un update gana la columna que efectivamente cambio. Si cambiaron las dos
  -- a la vez, gana "estado": es la que tiene mas informacion.
  if new.estado is distinct from old.estado then
    new.archivado := (new.estado = 'archivado');
  elsif new.archivado is distinct from old.archivado then
    new.estado := case when new.archivado then 'archivado' else 'activo' end;
  end if;

  return new;
end;
$$;

drop trigger if exists content_plans_sync_estado_trg on content_plans;
create trigger content_plans_sync_estado_trg
  before insert or update on content_plans
  for each row execute function content_plans_sync_estado();

/* ── El template de cada pieza, decidido al planificar ────────────────────── */

-- Hoy el template se elige recien al generar la imagen, y por eso no se puede
-- previsualizar el feed: sin saber que forma va a tener cada pieza no hay nada
-- que dibujar. Guardarlo en el slot es lo que habilita ver la grilla antes de
-- gastar una sola generacion.
--
-- Texto y no FK, por el mismo criterio que piezas_generadas.template_id: los
-- templates se renombran y se borran, y un plan de hace dos meses tiene que
-- sobrevivir a eso aunque el template ya no exista.
--
-- Nullable porque el plan que ya esta cargado no tiene ninguno asignado: la UI
-- tiene que tolerar el null y ofrecer asignarlo, nunca reventar.
alter table content_slots add column if not exists template_slug text;

/* ── La imagen generada, para que sobreviva al refresh ────────────────────── */

-- Hasta ahora la imagen vivia en memoria del navegador: recargar la pestaña
-- tiraba cuatro minutos de generacion a la basura. Apunta al bucket "piezas",
-- que ya existe — se guarda la ruta y no el base64 porque son ~600 KB por pieza
-- y esta tabla se lee entera cada vez que se abre el calendario.
alter table content_slots add column if not exists imagen_path text;
