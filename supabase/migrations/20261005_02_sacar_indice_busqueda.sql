-- El historial se busca con ilike (encuentra palabras a medio escribir), que no
-- usa un indice de texto completo. Se habia creado en la migracion anterior y
-- ya se saco de ahi; esto lo borra de las bases donde llego a aplicarse.
drop index if exists generador_historial_busqueda_idx;
