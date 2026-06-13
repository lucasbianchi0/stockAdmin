-- ============================================================
-- Correr en Supabase → SQL Editor
-- ============================================================

-- 1. Productos seleccionados + campos editables por producto
CREATE TABLE my_products (
  code              TEXT PRIMARY KEY,
  added_at          TIMESTAMPTZ DEFAULT NOW(),
  publication_name  TEXT,
  published_price   NUMERIC,
  publication_link  TEXT
);

-- 2. Configuración global (margen, etc.)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 3. Valor inicial del margen Accedra
INSERT INTO settings (key, value) VALUES ('margen_accedra', '1.30');
