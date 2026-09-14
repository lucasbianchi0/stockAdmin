-- Categorías de eventos: a qué solución de Accedra pertenece cada uno.
--
-- Son las mismas cinco soluciones del sitio (/soluciones/<slug>), con el mismo
-- slug, así un evento de Copilot se agrupa con "IA & Software" y "Consultoría"
-- y el sitio lo filtra y lo pinta con el color de esa solución.
--
-- Un array y no una tabla intermedia: son cinco valores fijos, un evento puede
-- tener varios, y la única consulta es "los de esta categoría", que un índice
-- GIN resuelve. El `check` garantiza que no entre un slug que el sitio no sepa
-- nombrar ni pintar; si se agrega una solución, se agrega acá y en
-- CATEGORIAS de src/lib/marketing/eventos.ts y lib/eventos.ts del sitio.

alter table eventos
  add column if not exists categorias text[] not null default '{}'
    check (categorias <@ array['networking', 'firma-biometrica', 'consultoria', 'seguridad', 'software-ai']::text[]);

create index if not exists eventos_categorias_idx on eventos using gin (categorias);
