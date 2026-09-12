-- El techo de gasto del asistente.
--
-- POR QUE EN LA BASE
--
-- Cada mensaje al asistente es una llamada paga a la API del modelo. Un
-- contador en memoria no sirve en Vercel: cada lambda tiene el suyo y el límite
-- se multiplica por la cantidad de instancias vivas. Postgres ya está, y una
-- sola función que incrementa y compara en la misma sentencia alcanza.
--
-- POR QUE VENTANAS FIJAS
--
-- La ventana es el múltiplo de `p_window_seconds` en el que cae `now()`. Una
-- ventana deslizante sería más justa en el borde, pero pide guardar cada
-- mensaje; con una fila por ventana la tabla no crece con el uso sino con los
-- usuarios, y el asistente tiene dos límites (ráfaga y día) que ya cubren el
-- caso de alguien que aprovecha el borde.
--
-- QUIEN LA LLAMA
--
-- Sólo el servidor, con la service role. Se revoca a anon y authenticated: si
-- un usuario pudiera llamarla con su sesión podría inflar el contador de otro.

create table if not exists rate_limits (
  bucket   text        not null,
  ventana  timestamptz not null,
  contador integer     not null default 0,
  primary key (bucket, ventana)
);

alter table rate_limits enable row level security;

create index if not exists rate_limits_ventana_idx on rate_limits (ventana);

create or replace function rate_limit_hit(p_bucket text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ventana  timestamptz;
  v_contador integer;
begin
  if p_window_seconds <= 0 or p_limit <= 0 then
    return false;
  end if;

  v_ventana := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into rate_limits (bucket, ventana, contador)
  values (p_bucket, v_ventana, 1)
  on conflict (bucket, ventana)
    do update set contador = rate_limits.contador + 1
  returning contador into v_contador;

  -- Limpieza de ventanas viejas, de a ratos: hacerla en cada llamada sería un
  -- delete por mensaje para una tabla que casi nunca tiene nada que borrar.
  if random() < 0.02 then
    delete from rate_limits where ventana < now() - interval '2 days';
  end if;

  return v_contador <= p_limit;
end;
$$;

revoke all on function rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function rate_limit_hit(text, int, int) to service_role;
