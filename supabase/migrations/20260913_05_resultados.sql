-- Panel de resultados: campañas, embudo del sitio y leads en una sola pantalla.
--
-- Nada de lo que se muestra es dato nuevo. `sessions`, `events` y `leads` ya
-- están en esta misma base desde que el sitio los escribe; lo que faltaba era
-- calcularlos juntos. Esta migración agrega tres cosas y ninguna es una tabla de
-- métricas duplicada:
--
--   1. `marketing_equipo` — quiénes somos nosotros, para poder descontarnos.
--   2. `ads_campanas_mes` — la foto congelada del cierre de cada mes de Google.
--   3. Las funciones que arman el embudo, para que el SQL viva en la base y no
--      repartido en cuatro consultas de supabase-js que nadie puede correr a mano.
--
-- POR QUE FUNCIONES Y NO CONSULTAS DESDE LA APP
--
-- El cálculo tiene ventanas, `lead()` y una regla de permanencia que combina dos
-- fuentes. Eso con el cliente de supabase-js son seis consultas y un cruce en
-- JavaScript: más lento, imposible de verificar a mano, y con la aritmética del
-- embudo escrita en un lugar donde nadie la va a encontrar cuando un número no
-- cierre. Acá se corre con `select` y se audita.

/* ══════════════════════════════════════════════════════════════════════════
   1 · Quiénes somos nosotros
   ══════════════════════════════════════════════════════════════════════════ */

-- POR QUE HACE FALTA
--
-- El sitio ya marca el tráfico del propio equipo con `?interno=1`, pero eso vive
-- en el localStorage de cada navegador y sólo lo tiene quien se acordó de
-- activarlo. Resultado medido el 13/9/2026: de los diez leads de la base, tres
-- estaban marcados como internos y otros cinco eran direcciones nuestras que el
-- filtro no detectaba. O sea que el panel habría mostrado siete consultas cuando
-- las de afuera eran dos.
--
-- El mail es la segunda red, y es la buena: no depende de que nadie se acuerde
-- de nada. Es una tabla y no una constante en el código para que se pueda sumar
-- una dirección sin un deploy — típicamente la de alguien que entra a probar un
-- formulario desde su casilla personal.
create table if not exists marketing_equipo (
  -- Un mail exacto (`sofia@ejemplo.com`) o un dominio entero (`@accedra.com.ar`).
  -- El arroba adelante es lo que distingue los dos casos: sin él sería ambiguo
  -- para cualquiera que cargue una fila dentro de seis meses.
  patron text primary key check (length(btrim(patron)) > 2),
  nota text,
  created_at timestamptz not null default now()
);

insert into marketing_equipo (patron, nota) values
  ('@accedra.com.ar', 'El dominio de la empresa: nadie de adentro es un lead'),
  ('lucmbianchi2000@gmail.com', 'Lucas, casilla personal — prueba los formularios')
on conflict (patron) do nothing;

alter table marketing_equipo enable row level security;

create or replace function es_del_equipo(p_email text) returns boolean
language sql stable as $$
  select exists (
    select 1 from marketing_equipo m
    where case
      when m.patron like '@%' then lower(coalesce(p_email, '')) like '%' || lower(m.patron)
      else lower(coalesce(p_email, '')) = lower(m.patron)
    end
  );
$$;

/* ══════════════════════════════════════════════════════════════════════════
   2 · El cierre mensual de Google Ads
   ══════════════════════════════════════════════════════════════════════════ */

-- POR QUE SE GUARDA SI LA API RESPONDE EN VIVO
--
-- Por tres motivos, y cada uno alcanzaría solo:
--
--   · Google reescribe las cifras hasta unos tres días después del hecho. Un
--     panel que consulta siempre en vivo muestra un agosto que cambia solo, y la
--     primera vez que alguien lo note deja de creerle a la pantalla entera.
--   · El refresh token de OAuth se vence. Cuando eso pasa, el panel tiene que
--     seguir mostrando la historia en vez de quedar en blanco.
--   · La API sólo devuelve lo que la cuenta conserva. La serie larga —la que
--     permite comparar agosto con agosto— tiene que vivir de este lado.
--
-- El grano es el mes y no el día a propósito: el mes es la unidad de decisión de
-- esta cuenta. Con 135 clics en treinta días, un día suelto no es una señal.
create table if not exists ads_campanas_mes (
  -- Primer día del mes. Que sea `date` y no un texto '2026-08' es lo que permite
  -- ordenar y restar meses sin parsear nada.
  periodo date not null,
  campana_id text not null,
  campana text not null,
  estado text,
  canal text,

  impresiones bigint not null default 0,
  clics bigint not null default 0,
  -- En la moneda de la cuenta (ARS), ya dividido por el millón que devuelve la
  -- API. Guardar micros obligaría a acordarse de dividir en cada consulta.
  coste numeric(14,2) not null default 0,
  conversiones numeric(12,2) not null default 0,
  valor_conversiones numeric(14,2) not null default 0,

  actualizado_en timestamptz not null default now(),

  -- Reimportar un mes lo actualiza en vez de duplicarlo. Es lo que hace que el
  -- cron se pueda correr dos veces sin pensarlo.
  primary key (periodo, campana_id)
);

create index if not exists ads_campanas_mes_periodo_idx on ads_campanas_mes (periodo desc);

alter table ads_campanas_mes enable row level security;

/* ══════════════════════════════════════════════════════════════════════════
   3 · El embudo del sitio
   ══════════════════════════════════════════════════════════════════════════ */

-- Devuelve un solo jsonb con todo lo que dibuja la pantalla.
--
-- POR QUE UN SOLO OBJETO Y NO SEIS FUNCIONES
--
-- Porque las seis partes tienen que hablar del mismo instante. Con seis llamadas
-- separadas, un lead que entra entre la segunda y la tercera hace que el total
-- del embudo no coincida con la lista de abajo, y nadie va a sospechar de una
-- carrera: van a sospechar de la aritmética.
create or replace function resultados_sitio(p_desde date, p_hasta date)
returns jsonb
language sql
stable
as $$
with rango as (
  select p_desde::timestamptz as d1, (p_hasta + 1)::timestamptz as d2
),

-- Visitas que cuentan: ni crawlers ni el propio equipo.
ses as (
  select s.* from sessions s, rango r
  where s.created_at >= r.d1 and s.created_at < r.d2
    and not s.is_bot and not s.is_internal
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

-- Sólo la service role. Los handlers de /api ya chequean el módulo a mano
-- (ver docs/PERMISOS.md); abrir esto a `authenticated` dejaría que cualquier
-- sesión del backoffice leyera los leads sin pasar por ese control.
revoke all on function resultados_sitio(date, date) from public;
revoke all on function resultados_sitio(date, date) from anon, authenticated;

/* ══════════════════════════════════════════════════════════════════════════
   4 · La bandeja
   ══════════════════════════════════════════════════════════════════════════ */

-- La lista de leads con su origen y el recorrido que hizo cada uno antes de
-- dejar el mail. Va aparte de `resultados_sitio` porque es lo único de la
-- pantalla que se pagina y se filtra: mezclarla con los agregados obligaría a
-- recalcular todo el embudo cada vez que alguien cambia de página.
create or replace function resultados_leads(p_desde date, p_hasta date)
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
  recorrido text[]
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
    -- Qué pidió exactamente: el brochure de una solución, el evento, el popup.
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
    -- Las páginas en orden, sin repetir dos veces seguidas la misma. Es lo que
    -- responde "qué estaba mirando cuando decidió escribir".
    coalesce((
      select array_agg(p order by orden)
      from (
        select e.path as p, min(e.created_at) as orden
        from events e
        where e.session_id = l.session_id and e.type = 'pageview'
        group by e.path
      ) r
    ), '{}')
  from leads l
  left join sessions s on s.id = l.session_id
  where l.created_at >= p_desde::timestamptz
    and l.created_at < (p_hasta + 1)::timestamptz
  order by l.created_at desc;
$$;

revoke all on function resultados_leads(date, date) from public;
revoke all on function resultados_leads(date, date) from anon, authenticated;

/* ══════════════════════════════════════════════════════════════════════════
   5 · Permisos
   ══════════════════════════════════════════════════════════════════════════ */

-- La service role es la que usan los handlers de /api, que ya chequean el
-- módulo a mano (ver docs/PERMISOS.md). `supabase_read_only_user` es el rol con
-- el que se inspecciona la base desde afuera: sin esto, auditar un número del
-- panel corriendo la función a mano no se puede, que es justo lo que estas
-- funciones vienen a habilitar.
grant execute on function resultados_sitio(date, date) to service_role, supabase_read_only_user;
grant execute on function resultados_leads(date, date) to service_role, supabase_read_only_user;
grant execute on function es_del_equipo(text) to service_role, supabase_read_only_user;
