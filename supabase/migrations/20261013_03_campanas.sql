/*
 * Campañas: un mensaje para un grupo de personas.
 *
 * Por ahora una campaña se crea en borrador y nada más: tiene nombre, a quién
 * va (un grupo de `contacto_grupos`) y con qué mensaje (una plantilla de
 * `mensajes_plantilla`). El envío todavía no existe.
 *
 * Está armada para lo que sigue:
 *   · `estado` ya prevé los pasos (borrador → programada → enviando → enviada).
 *   · `canal` separa mail de WhatsApp, que se mandan por caminos distintos.
 *   · Los envíos van a ser una tabla aparte (campaña × miembro del grupo) con
 *     su estado por persona: enviado, abierto, respondido, rebotado.
 *
 * El grupo se guarda por referencia y no se copia: si alguien suma personas al
 * grupo antes de mandar, la campaña las incluye. Al mandar, los envíos dejan
 * la foto de a quién se le mandó.
 */

create table if not exists campanas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  grupo_id uuid not null references contacto_grupos (id) on delete restrict,
  plantilla_id uuid references mensajes_plantilla (id) on delete set null,
  canal text not null default 'email' check (canal in ('email', 'whatsapp')),
  estado text not null default 'borrador'
    check (estado in ('borrador', 'programada', 'enviando', 'enviada', 'cancelada')),
  -- Desde dónde se armó: "crm" o "contactos". Para saber de dónde salen.
  origen text not null default 'contactos' check (origen in ('contactos', 'crm')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_by_nombre text
);

create index if not exists campanas_grupo_idx on campanas (grupo_id);

drop trigger if exists campanas_updated_at on campanas;
create trigger campanas_updated_at before update on campanas
  for each row execute function set_updated_at();

alter table campanas enable row level security;
