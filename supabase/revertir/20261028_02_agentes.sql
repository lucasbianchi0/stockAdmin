-- Deshace 20261028_02_agentes.sql. Se pierde todo lo que entregaron los agentes
-- (las notas que ya se crearon desde una propuesta quedan en `notas`).
drop table if exists agentes_trabajos;

delete from calendario_entradas where clave = 'agente-informe';

update calendario_entradas
set dias_semana = '{2,4}', hora = '10:00', ejecutor = 'claude',
    descripcion = 'Redacta las notas de /recursos y las deja en Marketing → Notas para revisar. Arranca en dos por semana.'
where clave = 'agente-blog';

update calendario_entradas
set estado = 'planificado', ejecutor = 'claude',
    descripcion = 'Analiza seguidores, alcance y publicaciones de la página. Hasta que llegue la API, sobre el .xls importado en Resultados.'
where clave = 'agente-linkedin';

update calendario_entradas
set titulo = 'Revisión semanal de Instagram y Facebook', ejecutor = 'claude',
    descripcion = 'Analiza la semana de las dos redes sobre lo que trae el proceso diario de Meta y propone qué publicar.'
where clave = 'agente-redes';

update calendario_entradas
set ejecutor = 'claude',
    descripcion = 'Lee la semana de las campañas (gasto, conversiones, términos de búsqueda), la compara con la anterior y propone cambios. Lo que se aplique se carga en Versiones de Ads.'
where clave = 'agente-ads';
