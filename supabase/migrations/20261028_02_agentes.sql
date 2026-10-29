-- Agentes: lo que entregan los agentes semanales, esperando que alguien lo mire.
--
-- Un agente (un script de scripts/agentes/ que corre en GitHub Actions) lee
-- datos, le pide a Claude un análisis y deja el resultado acá. Nunca publica ni
-- toca nada por su cuenta: cada propuesta espera a que una persona la apruebe o
-- la descarte desde la pantalla Agentes.
--
-- UNA FILA POR CORRIDA, LAS PROPUESTAS ADENTRO
--
-- Las propuestas viven en un jsonb y no en otra tabla porque nunca se leen
-- sueltas: se miran juntas, en el contexto del análisis que las originó. Cada
-- una lleva su propio `estado` (pendiente | aprobada | descartada).
--
-- Aditiva. Revertir: supabase/revertir/20261028_02_agentes.sql

create table if not exists agentes_trabajos (
  id uuid primary key default gen_random_uuid(),
  -- La misma clave del Calendario (agente-blog, agente-ads…).
  clave text not null,
  titulo text not null,
  -- El análisis, en markdown.
  resumen text not null default '',
  /*
   * [{ id, titulo, detalle, estado, ...lo propio de cada agente }]
   *   blog:    tipo, categoria, keyword, intencion, puntos[], porQue, notaId
   *   ads:     tipo, campana, dato
   *   redes:   red, texto, ideaVisual
   *   informe: (sólo titulo y detalle: son acciones para la semana)
   */
  propuestas jsonb not null default '[]'::jsonb,
  -- Con qué datos trabajó y qué no pudo leer ("Ads: token vencido").
  fuentes jsonb not null default '{}'::jsonb,
  revisado_por text,
  revisado_en timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists agentes_trabajos_clave_idx on agentes_trabajos (clave, created_at desc);

alter table agentes_trabajos enable row level security;

/* ── El Calendario, al día con los agentes que existen ─────────────────────── */

-- El blog pasa al domingo y ya no redacta: trae tres notas para elegir.
update calendario_entradas
set descripcion = 'Los domingos propone tres notas para /recursos (una guía, una nota y un caso) mirando lo que ya está publicado y lo que se busca en Ads. La que se aprueba queda como borrador en Marketing → Notas.',
    dias_semana = '{0}',
    hora = '10:00'
where clave = 'agente-blog';

-- LinkedIn lo cubre el agente de redes, que mira las tres juntas.
update calendario_entradas
set estado = 'pausado',
    descripcion = 'Lo cubre la revisión semanal de redes (miércoles), que mira LinkedIn, Instagram y Facebook juntas.'
where clave = 'agente-linkedin';

update calendario_entradas
set titulo = 'Revisión semanal de redes',
    descripcion = 'Analiza la semana de LinkedIn, Instagram y Facebook y propone tres posts, apoyados en las notas recientes del blog. Quedan en Agentes para copiar.'
where clave = 'agente-redes';

update calendario_entradas
set descripcion = 'Lee la semana de las campañas (gasto, conversiones, términos de búsqueda), la compara con la anterior y propone cambios. Sólo propone: lo que se aplique se carga en Versiones de Ads.'
where clave = 'agente-ads';

insert into calendario_entradas
  (tipo, titulo, descripcion, fecha, hora, duracion_min, repeticion, dias_semana, ejecutor, clave, estado)
values
  ('agente', 'Informe semanal de marketing',
   'Junta Ads, LinkedIn, Instagram, Facebook, leads y blog de la semana anterior y deja tres acciones para la semana. Se lee en Agentes.',
   '2026-11-02', '08:00', 30, 'semanal', '{1}', 'github', 'agente-informe', 'planificado')
on conflict (clave) do nothing;

-- Los agentes corren en GitHub Actions, no en una rutina de Claude.
update calendario_entradas
set ejecutor = 'github'
where clave in ('agente-blog', 'agente-redes', 'agente-ads', 'agente-informe');
