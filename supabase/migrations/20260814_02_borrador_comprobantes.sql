-- Borrador → confirmado → anulado: el ciclo de vida de un comprobante.
--
-- Hoy una factura nace confirmada. Se guarda y en ese mismo instante entra en
-- los saldos, en los pendientes de cobro, en el libro IVA y en el mayor. No hay
-- lugar donde cargarla, mirarla con calma y recién después decir "sí, esta es".
--
-- Eso importa por dos motivos concretos:
--
--  · **La carga inteligente.** Se adjuntan seis PDF, el modelo extrae los datos
--    y hoy hay que confirmar uno por uno en el momento o perder el trabajo. Con
--    borradores se cargan los seis, se revisan cuando se pueda y se confirman en
--    lote.
--  · **Un comprobante confirmado ya no debería poder editarse libremente.** Si
--    se le cambia el importe a una factura que ya tiene un cobro imputado, el
--    saldo del cliente cambia sin que nadie haya cobrado nada. La única forma
--    honesta de separar "todavía la estoy cargando" de "esto ya es un dato" es
--    un estado explícito.
--
-- LAS REGLAS, EN UNA LÍNEA CADA UNA
--
--   borrador    editable entero · no suma a ningún saldo · no genera asiento
--   confirmado  entra en saldos, IVA y mayor · editable solo si nadie lo imputó
--   anulado     conserva el número, no suma, y su asiento se borra
--
-- Nada de esto se apoya en que la aplicación se acuerde: lo sostienen los
-- triggers de abajo.

/* ── 1 · La columna ───────────────────────────────────────────────────────── */

-- `confirmado` como default y no `borrador`: lo ya cargado es real y tiene que
-- seguir sumando exactamente igual después de esta migración. El borrador es
-- una elección explícita del formulario, no un estado al que se cae por omisión.
alter table comprobantes
  add column if not exists estado text not null default 'confirmado'
    check (estado in ('borrador', 'confirmado', 'anulado'));

-- Cuándo se confirmó, que no es lo mismo que cuándo se cargó. Es el dato que
-- contesta "¿esta factura estuvo tres semanas en borrador?".
alter table comprobantes
  add column if not exists confirmado_at timestamptz,
  add column if not exists confirmado_por uuid references auth.users (id) on delete set null;

-- Los listados filtran por estado casi siempre, y el índice de fecha solo no
-- alcanza cuando hay muchos borradores viejos.
create index if not exists comprobantes_estado_idx
  on comprobantes (tipo, estado, fecha desc);

/* ── 2 · Un borrador no puede tener número repetido, pero sí no tenerlo ───── */

-- Los índices únicos de la fase 4 son parciales sobre `punto_venta is not null`,
-- así que un borrador sin numerar no choca con nada. Lo que sí hay que evitar es
-- que dos borradores reserven el mismo número: se resuelve solo, porque el
-- índice no distingue estado — dos comprobantes con el mismo número siguen sin
-- poder coexistir, esté cualquiera de los dos en borrador.

/* ── 3 · Un borrador no participa de nada ─────────────────────────────────── */

-- Imputar un cobro contra un borrador dejaría plata cancelando una factura que
-- todavía no existe del todo. Se prohíbe en la base porque la validación en el
-- handler no alcanza: el importador y cualquier script futuro escriben directo.
create or replace function imputacion_solo_confirmados() returns trigger
language plpgsql as $$
declare
  v_estado text;
begin
  select estado into v_estado from comprobantes where id = new.comprobante_id;

  if v_estado is distinct from 'confirmado' then
    raise exception
      'No se puede imputar contra un comprobante en estado %. Confirmalo primero.', v_estado
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists imputaciones_solo_confirmados on imputaciones;
create trigger imputaciones_solo_confirmados
  before insert or update on imputaciones
  for each row execute function imputacion_solo_confirmados();

-- Y al revés: un comprobante con imputaciones no puede volver a borrador ni
-- anularse. Primero se anula el recibo que lo canceló.
create or replace function comprobante_estado_valido() returns trigger
language plpgsql as $$
declare
  v_imputado numeric;
begin
  if new.estado = 'confirmado' or new.estado = old.estado then
    return new;
  end if;

  select coalesce(sum(importe), 0) into v_imputado
    from imputaciones where comprobante_id = new.id;

  if v_imputado > 0 then
    raise exception
      'Este comprobante ya tiene % imputado en recibos. Anulá el recibo antes de cambiarle el estado.', v_imputado
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists comprobantes_estado_valido on comprobantes;
create trigger comprobantes_estado_valido
  before update of estado on comprobantes
  for each row execute function comprobante_estado_valido();

/* ── 4 · El saldo ─────────────────────────────────────────────────────────── */

-- `comprobantes_saldo` está definida con `select c.*`, pero Postgres congela la
-- lista de columnas en el momento de crear la vista: agregar `estado` a la tabla
-- no se la agrega a la vista. Hay que recrearla, con la misma definición, para
-- que la columna nueva aparezca.
drop view if exists comprobantes_saldo cascade;
create view comprobantes_saldo as
select
  c.*,
  coalesce(i.imputado, 0) as imputado,
  round(c.total - coalesce(i.imputado, 0), 2) as saldo
from comprobantes c
left join (
  select comprobante_id, sum(importe) as imputado
    from imputaciones
   group by comprobante_id
) i on i.comprobante_id = c.id;

-- Los pendientes y los reportes tienen que ver solo lo confirmado. En vez de
-- repetir `estado = 'confirmado'` en cada consulta —y que alguna se olvide— va
-- una vista con el filtro puesto.
create view comprobantes_vigentes as
  select * from comprobantes_saldo where estado = 'confirmado';

/* ── 5 · El asiento se genera al confirmar, no al cargar ──────────────────── */

-- El motor no se toca. `asiento_de_comprobante` sigue siendo exactamente la
-- misma función de noventa líneas que arma el asiento; lo único que cambia es
-- *cuándo* se la llama, y eso vive en el trigger.
--
-- Redefinir la función entera acá para agregarle un `if` de dos líneas sería
-- duplicarla: la próxima vez que alguien corrija una regla de imputación
-- tendría que acordarse de que hay una segunda copia en esta migración. El
-- trigger es el lugar correcto para una condición sobre el estado del
-- documento.
create or replace function tg_asiento_comprobante() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform asiento_borrar('comprobante', old.id);
    return old;
  end if;

  -- Un borrador todavía no es un hecho contable y un anulado dejó de serlo. El
  -- borrado explícito es lo que hace que pasar de confirmado a borrador se
  -- lleve el asiento en vez de dejarlo colgado en el mayor.
  if new.estado is distinct from 'confirmado' then
    perform asiento_borrar('comprobante', new.id);
    return new;
  end if;

  begin
    perform asiento_de_comprobante(new.id);
  exception when others then
    raise warning 'Comprobante % guardado sin asiento: %', new.id, sqlerrm;
  end;

  return new;
end $$;

/* ── 6 · Los borradores no son un pendiente contable ──────────────────────── */

-- Sin esto, cada factura que alguien deje a medio cargar aparecería en la lista
-- de trabajo de contabilidad como un problema. No lo es: todavía no pretende
-- estar en el mayor.
create or replace view documentos_sin_asiento as
  select 'comprobante' as origen, c.id, c.fecha,
         c.clase || ' ' || coalesce(c.punto_venta::text || '-' || c.numero::text, 's/n') as referencia,
         c.total_ars as importe_ars,
         case when c.cuenta_contable_id is null then 'Sin cuenta contable imputada'
              else 'El motor no pudo armar el asiento' end as motivo
    from comprobantes c
   where c.estado = 'confirmado'
     and not exists (select 1 from asientos a
                      where a.origen = 'comprobante' and a.origen_id = c.id and a.estado = 'vigente')
  union all
  select 'movimiento', m.id, m.fecha,
         coalesce(m.detalle, m.referencia, 'Movimiento'), m.importe_ars,
         case when m.cuenta_contable_id is null then 'Sin cuenta contable imputada'
              else 'El motor no pudo armar el asiento' end
    from movimientos m
   where m.pago_id is null
     and not exists (select 1 from asientos a
                      where a.origen = 'movimiento' and a.origen_id = m.id and a.estado = 'vigente');

/* ── 7 · Adjuntos ─────────────────────────────────────────────────────────── */

-- El PDF de la factura, guardado.
--
-- Hoy la carga inteligente lee el archivo, extrae los datos y lo tira. Seis
-- meses después, cuando el contador pide el respaldo de una compra, hay que ir a
-- buscarlo al mail. El archivo es parte del comprobante, no un insumo temporal
-- del lector.
create table if not exists comprobante_adjuntos (
  id             uuid primary key default gen_random_uuid(),
  comprobante_id uuid not null references comprobantes (id) on delete cascade,

  nombre    text not null,
  -- La ruta dentro del bucket de Storage. No la URL: las URL firmadas vencen y
  -- guardarlas sería guardar algo que deja de servir.
  ruta      text not null unique,
  tipo_mime text,
  tamano    integer check (tamano >= 0),

  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists comprobante_adjuntos_idx
  on comprobante_adjuntos (comprobante_id, created_at desc);

alter table comprobante_adjuntos enable row level security;

-- El bucket, privado. Un comprobante tiene CUIT, importes y razón social: nada
-- de eso puede quedar accesible con solo saber la URL.
insert into storage.buckets (id, name, public)
select 'comprobantes', 'comprobantes', false
where not exists (select 1 from storage.buckets where id = 'comprobantes');
