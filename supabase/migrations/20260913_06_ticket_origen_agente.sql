-- De dónde salió el ticket: lo anotó una persona o lo dictó un agente.
--
-- El asistente termina una auditoría con seis cosas para hacer, y hasta hoy ese
-- párrafo se copiaba a mano al tablero o se perdía al cerrar la pestaña — las
-- conversaciones no se guardan en ninguna tabla, a propósito. Con la
-- herramienta de la ticketera, el agente las anota él mismo.
--
-- POR QUE SE GUARDA Y SE MUESTRA
--
-- Un ticket que escribió un modelo no vale lo mismo que uno que escribió una
-- persona: nadie lo revisó todavía. La etiqueta en la tarjeta es lo que hace
-- que quien lo lee sepa qué está leyendo — una propuesta, no una orden del
-- equipo. Sin la marca, en dos semanas el tablero tiene tickets que nadie
-- recuerda haber pedido y nadie sabe de dónde salieron.
--
-- Texto libre y no una clave contra una tabla: los agentes viven en el código
-- (`src/lib/chatbot/agentes.ts`), no en la base. Un id que ya no exista se
-- dibuja con el nombre genérico y no rompe nada.
alter table tickets add column if not exists origen_agente text;

comment on column tickets.origen_agente is
  'Id del agente del asistente que creó el ticket (asistente, marketing, finanzas, ecommerce). NULL = lo anotó una persona a mano.';
