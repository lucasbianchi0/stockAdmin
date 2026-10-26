/*
 * Los chats de WhatsApp de Accedra — ADITIVO.
 *
 * El número sigue en la app de WhatsApp Business del celular; Kapso lo conecta
 * a la API oficial en modo coexistencia y nos avisa por webhook de cada
 * mensaje: los que escriben los clientes y los que el equipo contesta desde el
 * teléfono. Acá queda la copia, para buscarla y verla pegada a cada contacto.
 *
 * Una conversación por número de teléfono (no por la "conversación" de Kapso,
 * que se cierra a las 24 horas de inactividad y vuelve a abrirse): para quien
 * lo mira es un solo chat, como en el celular.
 *
 * `contacto_id` se completa solo cuando el teléfono coincide con un contacto, o
 * con el contacto que se crea al primer mensaje. `on delete set null`: borrar
 * un contacto no borra lo que esa persona escribió.
 *
 * `wamid` (el id de WhatsApp) es único: el webhook puede llegar dos veces y la
 * importación del historial puede traer mensajes que ya llegaron por webhook.
 *
 * RLS habilitado y sin políticas, como el resto: se llega sólo por las rutas
 * de la API con la service role.
 *
 * Revertir: supabase/revertir/20261025_01_whatsapp.sql
 */

create table if not exists whatsapp_conversaciones (
  id uuid primary key default gen_random_uuid(),

  -- Como lo manda WhatsApp: sólo dígitos, con código de país (5491133001233).
  telefono text not null unique,
  -- El nombre que la persona tiene en su perfil de WhatsApp.
  nombre_perfil text,

  contacto_id uuid references contactos (id) on delete set null,

  ultimo_mensaje_at timestamptz,
  ultimo_texto text,
  ultima_direccion text check (ultima_direccion in ('entrante', 'saliente')),
  mensajes integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_conversaciones_ultimo_idx
  on whatsapp_conversaciones (ultimo_mensaje_at desc nulls last);
create index if not exists whatsapp_conversaciones_contacto_idx
  on whatsapp_conversaciones (contacto_id);

drop trigger if exists whatsapp_conversaciones_updated_at on whatsapp_conversaciones;
create trigger whatsapp_conversaciones_updated_at before update on whatsapp_conversaciones
  for each row execute function set_updated_at();

alter table whatsapp_conversaciones enable row level security;

create table if not exists whatsapp_mensajes (
  id uuid primary key default gen_random_uuid(),
  wamid text not null unique,
  conversacion_id uuid not null references whatsapp_conversaciones (id) on delete cascade,

  direccion text not null check (direccion in ('entrante', 'saliente')),
  -- De dónde vino: cloud_api, business_app (contestado desde el celular),
  -- history_sync (historial importado al conectar), etc. Tal cual lo da Kapso.
  origen text,
  tipo text not null default 'text',
  -- El texto, o la representación que da Kapso de lo que no es texto
  -- ("[Imagen] foto.jpg"). Sin archivos: esos quedan en Kapso.
  texto text,

  enviado_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_mensajes_conversacion_idx
  on whatsapp_mensajes (conversacion_id, enviado_at);

alter table whatsapp_mensajes enable row level security;
