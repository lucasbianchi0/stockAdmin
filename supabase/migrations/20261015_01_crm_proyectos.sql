/*
 * El CRM pasa de "una fila por persona" a "una fila por proyecto".
 *
 * Una misma cuenta tiene muchos proyectos a la vez (Andreani: más de diez),
 * algunos con la misma persona y otros con otra, y cada uno se sigue aparte:
 * su etapa, su porcentaje, su próxima acción, su historial, su presupuesto.
 * Por eso se va el `unique (contacto_id, owner_id)`: la misma persona puede
 * tener varios proyectos en el mismo CRM.
 *
 * La columna `producto` queda con ese nombre y ahora guarda el nombre del
 * proyecto ("Firma biométrica en sucursales"). No se renombra para no cortar
 * la versión publicada mientras sale la nueva.
 *
 * El porcentaje de cierre pasa a escalones fijos: 0, 25, 50, 75, 100. Lo que
 * había se acomoda: ganada → 100, perdida → 0, el resto al escalón más
 * cercano (sin llegar a 100 si no está ganada: 100 es ganada, ver
 * `reglaDeCierre` en src/lib/comercial/crm.ts).
 */

alter table crm_oportunidades drop constraint if exists crm_oportunidades_contacto_id_owner_id_key;

create index if not exists crm_oportunidades_contacto_owner_idx
  on crm_oportunidades (contacto_id, owner_id);

comment on column crm_oportunidades.producto is 'El nombre del proyecto (en la app: "Proyecto").';

alter table crm_oportunidades drop constraint if exists crm_oportunidades_probabilidad_check;

update crm_oportunidades
set probabilidad = case
  when estado = 'ganada' then 100
  when estado = 'perdida' then 0
  else least(75, (round(probabilidad / 25.0) * 25)::int)
end;

alter table crm_oportunidades alter column probabilidad set default 0;

alter table crm_oportunidades add constraint crm_oportunidades_probabilidad_check
  check (probabilidad in (0, 25, 50, 75, 100));
