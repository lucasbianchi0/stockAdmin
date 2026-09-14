-- El embudo deja afuera las visitas en las que nadie interactuó.
--
-- Del 4/8 al 13/9/2026, 230 de 639 sesiones contadas como humanas vinieron de
-- fuera de Argentina, casi todas de datacenters de EE.UU. con un user agent de
-- Chrome común: sin referente, en escritorio, a la home, y el 91% sin un solo
-- evento después del pageview. Inflaban las sesiones, bajaban la tasa de
-- conversión y disparaban el aviso de "tráfico que no es de Argentina".
--
-- El sitio ahora marca `sessions.interactuo` (migración 20260913_006 de
-- accedra) con el primer gesto humano. Acá sólo cambia el filtro de `ses`:
-- se excluye `false` y se conserva `null`, que es el histórico sin medición.
-- Todo lo demás es la función de 20260913_05_resultados.sql tal cual.
--
-- La columna se crea también acá, idéntica a la de accedra (sin default, ver
-- ahí por qué): la base es compartida y esta función no compila sin ella, así
-- que el orden en que se corran las dos migraciones no puede importar.
alter table public.sessions
  add column if not exists interactuo boolean;

create or replace function resultados_sitio(p_desde date, p_hasta date)
returns jsonb
language sql
stable
as $$
with rango as (
  select p_desde::timestamptz as d1, (p_hasta + 1)::timestamptz as d2
),

-- Visitas que cuentan: ni crawlers, ni el propio equipo, ni navegadores en los
-- que nadie tocó nada. `interactuo` null es una visita anterior a la medición:
-- se cuenta, como se contaba antes.
ses as (
  select s.* from sessions s, rango r
  where s.created_at >= r.d1 and s.created_at < r.d2
    and not s.is_bot and not s.is_internal
    and s.interactuo is not false
),

ev as (select e.* from events e join ses on ses.id = e.session_id),

-- Vistas de página con la siguiente de la misma visita al lado: es la fuente de
-- permanencia para todo lo anterior al 13/9/2026, cuando el sitio todavía no
-- emitía `salida`.
pv as (
  select session_id, path, created_at,
         lead(created_at) over (partition by session_id order by created_at) as sig,
         row_number() over (partition by session_id, path order by created_at) as rn
  from ev where type = 'pageview'
),

-- La medición del navegador. `ms` se SUMA y `scroll` se toma al MAXIMO: una
-- misma página puede emitir varios `salida` si la persona cambió de pestaña y
-- volvió, y cada uno trae su tramo de tiempo pero la misma altura acumulada.
sal as (
  select session_id, path,
         sum(coalesce((metadata->>'ms')::numeric, 0)) as ms,
         max(coalesce((metadata->>'scroll')::numeric, 0)) as scroll
  from ev where type = 'salida'
  group by session_id, path
),

-- Una fila por vista, con su permanencia y su scroll cuando existen.
vistas as (
  select pv.path,
         pv.session_id,
         (pv.sig is null) as es_salida,
         -- La medición del navegador gana; la resta entre vistas es el respaldo
         -- para el histórico. El corte de 30 minutos descarta la visita que
         -- quedó abierta toda la noche.
         coalesce(
           case when pv.rn = 1 then sal.ms / 1000.0 end,
           case when pv.sig is not null and pv.sig - pv.created_at < interval '30 minutes'
                then extract(epoch from (pv.sig - pv.created_at)) end
         ) as seg,
         case when pv.rn = 1 then sal.scroll end as scroll
  from pv
  left join sal on sal.session_id = pv.session_id and sal.path = pv.path
),

-- Leads del período. El origen sale del lead y no de su sesión: la atribución
-- vive 90 días en el navegador, así que quien hizo clic en el anuncio hace dos
-- semanas y hoy entra directo convierte en una visita sin gclid — y el lead
-- igual lleva la campaña. Cruzar por la sesión subcontaría Ads sistemáticamente.
lea as (
  select l.*,
         (es_del_equipo(l.email) or coalesce(s.is_internal, false)) as equipo,
         case
           when l.gclid is not null then 'Google Ads'
           when l.utm_source is not null then l.utm_source
           when l.referrer ilike '%google%' then 'Google orgánico'
           when l.referrer ilike '%linkedin%' then 'LinkedIn'
           when l.referrer is not null then 'Referidos'
           else 'Directo'
         end as origen
  from leads l
  left join sessions s on s.id = l.session_id, rango r
  where l.created_at >= r.d1 and l.created_at < r.d2
),
lea_reales as (select * from lea where not equipo),

-- Mismo vocabulario de origen que en los leads, para que las dos columnas de la
-- tabla se puedan poner una al lado de la otra.
ses_origen as (
  select case
    when gclid is not null then 'Google Ads'
    when utm_source is not null then utm_source
    when referrer ilike '%google%' then 'Google orgánico'
    when referrer ilike '%linkedin%' then 'LinkedIn'
    when referrer ilike '%bing%' or referrer ilike '%duckduckgo%' or referrer ilike '%yahoo%'
      then 'Otros buscadores'
    when referrer ilike '%facebook%' or referrer ilike '%instagram%' then 'Meta'
    when referrer is not null then 'Referidos'
    else 'Directo'
  end as origen
  from ses
),

pv_por_sesion as (
  select session_id, count(*) as n from pv group by session_id
)

select jsonb_build_object(
  'desde', p_desde,
  'hasta', p_hasta,

  'totales', (select jsonb_build_object(
      'sesiones',            (select count(*) from ses),
      'de_ads',              (select count(*) from ses where gclid is not null),
      'vistas',              (select count(*) from pv),
      'visitantes',          (select count(distinct visitor_id) from ses where visitor_id is not null),
      'sesiones_sin_visitante', (select count(*) from ses where visitor_id is null),
      'navegan',             (select count(*) from pv_por_sesion where n > 1),
      'rebotes',             (select count(*) from pv_por_sesion where n = 1),
      'interacciones',       (select count(*) from ev where type not in ('pageview', 'salida')),
      'contactos_directos',  (select count(*) from ev where type = 'click' and name in ('whatsapp','telefono','email')),
      'leads',               (select count(*) from lea),
      'leads_equipo',        (select count(*) from lea where equipo),
      'leads_reales',        (select count(*) from lea_reales),
      'leads_de_ads',        (select count(*) from lea_reales where gclid is not null),
      'ganados',             (select count(*) from lea_reales l join lead_statuses st on st.key = l.status where st.is_won),
      'monto_ganado',        (select coalesce(sum(l.deal_value), 0) from lea_reales l join lead_statuses st on st.key = l.status where st.is_won),
      'permanencia_media',   (select coalesce(round(avg(seg)), 0) from vistas where seg is not null),
      'con_scroll',          (select count(*) from vistas where scroll is not null)
  )),

  -- Un punto por día, con los días vacíos incluidos: sin `generate_series` el
  -- gráfico saltea las fechas sin tráfico y una caída se lee como continuidad.
  'serie', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'dia', d,
             'sesiones', (select count(*) from ses where ses.created_at::date = d),
             'leads', (select count(*) from lea_reales where lea_reales.created_at::date = d)
           ) order by d), '[]'::jsonb)
    from generate_series(p_desde, p_hasta, interval '1 day') g(d)
  ),

  'origenes', (
    select coalesce(jsonb_agg(x order by x->>'sesiones' is null, (x->>'sesiones')::int desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'origen', o.origen,
        'sesiones', o.n,
        'leads', coalesce((select count(*) from lea_reales lr where lr.origen = o.origen), 0)
      ) as x
      from (select origen, count(*) as n from ses_origen group by origen) o
    ) t
  ),

  'paginas', (
    select coalesce(jsonb_agg(x order by (x->>'vistas')::int desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'path', v.path,
        'vistas', count(*),
        'visitantes', count(distinct v.session_id),
        'salidas', count(*) filter (where v.es_salida),
        'segundos', coalesce(round(avg(v.seg) filter (where v.seg is not null)), 0),
        'scroll', round(avg(v.scroll) filter (where v.scroll is not null)),
        'leads', coalesce((select count(*) from lea_reales lr where lr.submitted_from = v.path), 0)
      ) as x
      from vistas v
      group by v.path
    ) t
  ),

  'dispositivos', (
    select coalesce(jsonb_agg(jsonb_build_object('clave', coalesce(device, 'sin dato'), 'valor', n)
                              order by n desc), '[]'::jsonb)
    from (select device, count(*) as n from ses group by device) d
  ),

  'paises', (
    select coalesce(jsonb_agg(jsonb_build_object('clave', clave, 'valor', n) order by n desc), '[]'::jsonb)
    from (
      select case when country = 'AR' then 'Argentina'
                  when country is null then 'sin dato'
                  else 'Fuera de Argentina' end as clave,
             count(*) as n
      from ses group by 1
    ) p
  )
);
$$;
