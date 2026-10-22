-- Deshace 20261021_01_linkedin.sql. Se pierde lo importado de LinkedIn; los
-- .xls se pueden volver a exportar desde la analítica de la página.
drop table if exists linkedin_cargas;
drop table if exists linkedin_demografia;
drop table if exists linkedin_publicaciones;
drop table if exists linkedin_dias;
