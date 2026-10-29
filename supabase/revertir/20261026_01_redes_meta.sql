-- Deshace 20261026_01_redes_meta.sql. Se pierden las métricas guardadas y las
-- cuentas conectadas (hay que volver a correr scripts/conectar-social.mjs).
drop table if exists redes_sincronizaciones;
drop table if exists redes_publicaciones;
drop table if exists redes_dias;
drop table if exists social_cuentas;
