-- Los templates del generador de imagenes son los del banco (templates-feed.ts,
-- en el codigo), no pedidos guardados por el equipo. La tabla de templates
-- propios se habia creado en 20261005_01 y quedo sin uso: se saca.
-- Estaba vacia al borrarse; sus imagenes del bucket "generador" ya se habian
-- eliminado.
drop table if exists generador_templates;
