-- Cada tanda masiva de generacion es una version.
--
-- Versionar receta por receta responde "como cambio este template". Versionar
-- por tanda responde la pregunta que importa: "como se ve el sistema entero
-- hoy contra la semana pasada". Quince piezas generadas juntas con el mismo
-- titular son una foto del sistema en ese momento, y es lo unico comparable.
alter table piezas_generadas add column if not exists lote_id uuid;
alter table piezas_generadas add column if not exists lote_numero integer;

create index if not exists piezas_lote_idx on piezas_generadas (lote_numero desc, created_at);
