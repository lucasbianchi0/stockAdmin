-- Inscripciones a eventos desde el sitio.
--
-- Quien entra a un evento en accedra.com.ar deja su mail en el popup del evento
-- y queda anotado; le llega un mail de confirmación. Esta tabla es la lista de
-- anotados, que el equipo ve en el backoffice (Asistentes → Inscriptos).
--
-- POR QUE UNA FUNCION Y NO UN INSERT DESDE EL SITIO
--
-- Anotarse tiene cuatro reglas que no pueden fallar por una carrera entre dos
-- pedidos simultáneos: el evento tiene que estar publicado, no tiene que haber
-- terminado, no se puede pasar del cupo y la misma dirección no se anota dos
-- veces. La función toma el lock de la fila del evento, así dos personas
-- anotándose al mismo tiempo en el último lugar no terminan siendo 31 de 30.
--
-- Devuelve un estado y no lanza: el endpoint del sitio decide qué responder con
-- cada uno, y "ya estabas anotado" se contesta igual que "te anotamos" para no
-- revelar qué direcciones están en la lista.
--
-- SEGURIDAD
--
-- RLS activo sin políticas y la función sin permiso para anon/authenticated: la
-- única vía es la service role, desde el servidor del sitio. La clave pública de
-- Supabase no puede leer la lista ni anotar a nadie.

create table if not exists evento_inscripciones (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos (id) on delete cascade,
  -- Siempre en minúsculas: es la clave de "ya está anotado".
  email text not null check (length(email) between 3 and 254 and email = lower(email)),
  created_at timestamptz not null default now(),
  unique (evento_id, email)
);

create index if not exists evento_inscripciones_evento_idx
  on evento_inscripciones (evento_id, created_at desc);

alter table evento_inscripciones enable row level security;

create or replace function inscribir_en_evento(p_evento uuid, p_email text)
returns text
language plpgsql
as $$
declare
  v_evento eventos%rowtype;
  v_email text := lower(trim(p_email));
  v_total int;
begin
  -- El lock serializa las inscripciones del mismo evento; las de eventos
  -- distintos no se esperan entre sí.
  select * into v_evento from eventos where id = p_evento for update;

  if not found or not v_evento.publicado then
    return 'inexistente';
  end if;

  -- Misma regla que el sitio y el backoffice: sin hora de fin, termina a las
  -- tres horas del inicio.
  if coalesce(v_evento.fin, v_evento.inicio + interval '3 hours') <= now() then
    return 'cerrado';
  end if;

  if exists (select 1 from evento_inscripciones where evento_id = p_evento and email = v_email) then
    return 'repetido';
  end if;

  if v_evento.cupo is not null then
    select count(*) into v_total from evento_inscripciones where evento_id = p_evento;
    if v_total >= v_evento.cupo then
      return 'completo';
    end if;
  end if;

  insert into evento_inscripciones (evento_id, email) values (p_evento, v_email);
  return 'nuevo';
end;
$$;

revoke all on function inscribir_en_evento(uuid, text) from public;
revoke all on function inscribir_en_evento(uuid, text) from anon, authenticated;
