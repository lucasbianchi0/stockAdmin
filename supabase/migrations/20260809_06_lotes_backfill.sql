-- Las piezas que ya estaban guardadas pasan a ser la Version 1.
--
-- Se generaron todas juntas, en la misma tanda, con el mismo titular: son
-- exactamente una version del sistema aunque se hayan guardado antes de que
-- existiera el concepto. Dejarlas sin numero las volveria invisibles en el
-- historial, que es justo lo que se quiere mirar.
--
-- Solo toca filas sin numero, asi que correrlo dos veces no hace nada la
-- segunda: las que ya tienen lote quedan como estan.
update piezas_generadas
set lote_id     = coalesce(lote_id, '00000000-0000-0000-0000-000000000001'::uuid),
    lote_numero = 1
where lote_numero is null;
