-- Conversiones sin conexión: informarle a Google qué clics terminaron en cliente.
--
-- POR QUE ESTA VIA Y NO LA ETIQUETA DE GTAG
--
-- Es una decisión tomada y escrita, no una omisión — la misma que ya explica
-- `accedra/scripts/ads/conversiones-offline.mjs`. Dos motivos, en este orden:
--
--   1. La política de privacidad publicada del sitio dice, en negrita, que no usa
--      cookies publicitarias ni de seguimiento entre sitios. `gtag.js` instala
--      `_gcl_aw` y `_gcl_dc`, que son exactamente eso. Poner la etiqueta
--      convertiría ese párrafo en falso.
--   2. La misma política ya describe ESTE mecanismo: se informa que una consulta
--      se convirtió en cliente sin que la plataforma reciba el mensaje ni el
--      detalle. Viaja el gclid, el momento y el monto. Nada más.
--
-- Y mide mejor: la etiqueta le enseña a Google a comprar formularios
-- completados; esto le enseña a comprar CONTRATOS.
--
-- QUE AGREGA ESTA MIGRACION
--
--   · `resultados_leads` devuelve dos columnas más: `gclid` —lo que se le sube a
--     Google— y `subida_en`, para saber qué queda en la cola.
--   · `es_del_equipo_lote`, que es el filtro que no se puede saltear.

/* ══════════════════════════════════════════════════════════════════════════
   El filtro que no se puede saltear
   ══════════════════════════════════════════════════════════════════════════ */

-- Cuáles de estas direcciones son nuestras, en una sola vuelta.
--
-- POR QUE EN LOTE Y NO UNA POR UNA
--
-- El endpoint que sube conversiones aborta sin subir nada si la verificación
-- falla, porque una conversión aceptada por Google no se puede deshacer. Con una
-- llamada por lead, la probabilidad de que alguna se caiga crece con el tamaño
-- del lote — y lo que está en juego es enseñarle a Smart Bidding a comprar clics
-- que nunca fueron clientes.
--
-- No es hipotético: el 13/9/2026, de los tres leads de la base que tenían gclid,
-- los tres eran direcciones del propio equipo probando los formularios.
create or replace function es_del_equipo_lote(p_emails text[])
returns table (email text)
language sql
stable
as $$
  select e from unnest(p_emails) as e where es_del_equipo(e);
$$;

revoke all on function es_del_equipo_lote(text[]) from public;
revoke all on function es_del_equipo_lote(text[]) from anon, authenticated;
grant execute on function es_del_equipo_lote(text[]) to service_role, supabase_read_only_user;

/* ══════════════════════════════════════════════════════════════════════════
   La bandeja, con lo que hace falta para subir
   ══════════════════════════════════════════════════════════════════════════ */

-- `drop` y no `create or replace`: Postgres no deja cambiar las columnas de
-- salida de una función que devuelve una tabla.
drop function if exists resultados_leads(date, date);

create function resultados_leads(p_desde date, p_hasta date)
returns table (
  id uuid,
  created_at timestamptz,
  nombre text,
  empresa text,
  email text,
  mensaje text,
  servicio text,
  estado text,
  monto numeric,
  moneda text,
  tipo text,
  detalle text,
  equipo boolean,
  origen text,
  campana text,
  keyword text,
  landing text,
  enviado_desde text,
  dispositivo text,
  pais text,
  paginas_vistas int,
  recorrido text[],
  -- El identificador del clic del anuncio. Es lo único que se le manda a Google.
  gclid text,
  -- Cuándo se informó. `null` = sigue en la cola.
  subida_en timestamptz
)
language sql
stable
as $$
  select
    l.id,
    l.created_at,
    l.name,
    l.company,
    l.email,
    l.message,
    l.service,
    l.status,
    l.deal_value,
    l.deal_currency,
    coalesce(l.metadata->>'tipo', 'contacto'),
    coalesce(l.metadata->>'solucion', l.metadata->>'evento', l.metadata->>'popup', l.service),
    (es_del_equipo(l.email) or coalesce(s.is_internal, false)),
    case
      when l.gclid is not null then 'Google Ads'
      when l.utm_source is not null then l.utm_source
      when l.referrer ilike '%google%' then 'Google orgánico'
      when l.referrer ilike '%linkedin%' then 'LinkedIn'
      when l.referrer is not null then 'Referidos'
      else 'Directo'
    end,
    l.utm_campaign,
    l.utm_term,
    l.landing_page,
    l.submitted_from,
    s.device,
    s.country,
    coalesce((select count(*)::int from events e where e.session_id = l.session_id and e.type = 'pageview'), 0),
    coalesce((
      select array_agg(p order by orden)
      from (
        select e.path as p, min(e.created_at) as orden
        from events e
        where e.session_id = l.session_id and e.type = 'pageview'
        group by e.path
      ) r
    ), '{}'),
    l.gclid,
    l.conversion_uploaded_at
  from leads l
  left join sessions s on s.id = l.session_id
  where l.created_at >= p_desde::timestamptz
    and l.created_at < (p_hasta + 1)::timestamptz
  order by l.created_at desc;
$$;

revoke all on function resultados_leads(date, date) from public;
revoke all on function resultados_leads(date, date) from anon, authenticated;
grant execute on function resultados_leads(date, date) to service_role, supabase_read_only_user;
