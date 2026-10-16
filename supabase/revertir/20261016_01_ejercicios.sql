-- Deshace 20261016_01_ejercicios.sql si la prueba no se aprueba. No toca asientos.
drop view if exists ejercicios_resumen;
drop view if exists asientos_por_ejercicio;
drop function if exists ejercicio_cambiar_inicio(smallint, date);
drop function if exists ejercicio_cambiar_fin(smallint, date);
drop function if exists ejercicio_nombre(date, date);
drop table if exists ejercicios;
