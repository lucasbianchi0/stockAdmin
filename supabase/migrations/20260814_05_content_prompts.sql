-- Prompts de contenido propios.
--
-- La página /contenido/prompts muestra, en modo lectura, los prompts que usa la
-- generación (esos viven en el código, en prompts-sistema.ts). Esta tabla guarda
-- los que el equipo crea a mano: quedan con el usuario que los creó, para poder
-- reusarlos y para saber de quién salió cada uno.
--
-- Se accede con el cliente service-role (como content_plans y content_slots), así
-- que no lleva RLS: el guard de módulo "marketing" ya protege las rutas.

create table if not exists content_prompts (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  cuerpo text not null,
  -- Quién lo creó. `set null` para no perder el prompt si se borra el usuario;
  -- el email queda desnormalizado para poder mostrar el autor sin un join.
  created_by uuid references auth.users (id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_prompts_created_at_idx
  on content_prompts (created_at desc);
