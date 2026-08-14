-- Plantillas de mensajes: lo que el equipo escribe una y otra vez.
--
-- El mensaje de "te paso el presupuesto", el recordatorio de pago, el primer
-- contacto por LinkedIn. Hoy cada uno vive en el WhatsApp de quien lo escribió
-- la última vez, así que se reescribe desde cero cada vez y sale distinto según
-- quién atienda. Eso no es un problema de tipeo: es que el cliente recibe una
-- voz diferente por persona.
--
-- POR QUE EL AUTOR SE GUARDA COMO TEXTO Y NO SOLO COMO ID
--
-- `autor_id` sirve para saber si la plantilla es tuya (y encender el botón de
-- editar sin pedir permiso a nadie más). Pero el nombre que se muestra va
-- copiado en `autor_nombre` a propósito, por dos motivos:
--
--   · Listar veinte plantillas no puede costar veinte consultas a `auth.users`
--     —que además vive en otro esquema y no se puede joinear desde PostgREST.
--   · Si mañana la persona deja el equipo y se borra su usuario, el crédito
--     tiene que sobrevivir. Una plantilla firmada por "—" es una plantilla que
--     nadie se anima a tocar porque no sabe de dónde salió.
--
-- El precio es que un cambio de nombre no se propaga hacia atrás. Es el precio
-- correcto: el crédito es de quien lo escribió con el nombre que tenía.
--
-- POR QUE LA CIRCUNSTANCIA ES UNA LISTA CERRADA
--
-- Misma lección que las categorías de entidad: un campo libre termina con
-- "Cobranza", "cobranzas" y "Reclamo de pago" como tres cosas distintas, y el
-- filtro deja de servir justo cuando hay suficientes plantillas para
-- necesitarlo. La lista se amplía con una migración, que es exactamente la
-- fricción que se busca.

create table if not exists mensajes_plantilla (
  id uuid primary key default gen_random_uuid(),

  titulo text not null,

  -- En qué momento del trato se usa. Es el eje por el que se busca: nadie
  -- entra acá pensando "quiero el mensaje 4", entra pensando "tengo que
  -- reclamar una factura vencida".
  circunstancia text not null default 'otra'
    check (circunstancia in (
      'prospeccion',   -- Primer contacto, frío
      'seguimiento',   -- Volver sobre algo que quedó abierto
      'cotizacion',    -- Envío de presupuesto
      'cierre',        -- Negociación y confirmación de la orden
      'postventa',     -- Entrega, instalación, soporte
      'cobranza',      -- Recordatorio y reclamo de pago
      'reactivacion',  -- Cliente dormido
      'interno',       -- Equipo puertas adentro
      'otra'
    )),

  -- El canal cambia la forma, no el contenido: el mismo mensaje va corto y sin
  -- asunto por WhatsApp, y con asunto y saludo formal por mail.
  canal text not null default 'whatsapp'
    check (canal in ('whatsapp', 'email', 'linkedin', 'llamada', 'otro')),

  -- Solo tiene sentido en mail. Se guarda igual para los otros canales por si
  -- alguien cambia el canal de una plantilla ya escrita y después vuelve.
  asunto text,

  cuerpo text not null,

  -- Cuándo conviene usar esta y no otra. Es lo que hace que la plantilla se
  -- pueda elegir sin leer las seis enteras.
  cuando_usar text,

  etiquetas text[] not null default '{}',

  autor_id     uuid references auth.users (id) on delete set null,
  autor_nombre text not null,

  -- Quién la tocó por última vez. Solo se muestra si no es el autor: "editado
  -- por la misma persona que la escribió" no es información.
  editor_nombre text,

  -- Cuántas veces se copió. La única señal honesta de cuáles sirven: una
  -- plantilla con cero usos en tres meses es una plantilla para borrar.
  usos integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La pantalla ordena por fecha y filtra por circunstancia y canal del lado del
-- cliente (son decenas de filas, no miles). Estos índices son para cuando deje
-- de serlo.
create index if not exists mensajes_plantilla_circunstancia_idx
  on mensajes_plantilla (circunstancia);
create index if not exists mensajes_plantilla_autor_idx
  on mensajes_plantilla (autor_id);
create index if not exists mensajes_plantilla_fecha_idx
  on mensajes_plantilla (updated_at desc);

alter table mensajes_plantilla enable row level security;

/* ── Fecha de edición ──────────────────────────────────────────────────────── */

-- No alcanza con `set_updated_at()`: copiar un mensaje incrementa `usos`, y con
-- el trigger genérico cada copia haría que la plantilla apareciera como
-- "editada hace 2 minutos". La lista se reordenaría sola por leerla.
--
-- La comparación va sobre el row entero en jsonb menos las dos columnas que no
-- cuentan como edición: así una columna nueva queda cubierta sin que nadie se
-- acuerde de agregarla acá.
create or replace function mensajes_plantilla_touch() returns trigger
language plpgsql as $$
begin
  if (to_jsonb(new) - 'usos' - 'updated_at')
     is not distinct from
     (to_jsonb(old) - 'usos' - 'updated_at') then
    return new;
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists mensajes_plantilla_updated_at on mensajes_plantilla;
create trigger mensajes_plantilla_updated_at before update on mensajes_plantilla
  for each row execute function mensajes_plantilla_touch();

/* ── Contador de usos ──────────────────────────────────────────────────────── */

-- Como función y no como update desde la app porque el patrón leer-sumar-guardar
-- pierde copias cuando dos personas usan la misma plantilla a la vez. Acá el
-- incremento lo resuelve Postgres sobre la fila bloqueada.
create or replace function mensaje_plantilla_usado(p_id uuid) returns integer
language sql as $$
  update mensajes_plantilla
     set usos = usos + 1
   where id = p_id
  returning usos;
$$;

/* ── Semillas ──────────────────────────────────────────────────────────────── */

-- Seis mensajes reales para que la pantalla nazca con algo adentro. No son la
-- versión definitiva de nada: son el ejemplo de la convención de variables
-- {{asi}} y del nivel de detalle que se espera en "cuándo usar".
insert into mensajes_plantilla
  (titulo, circunstancia, canal, asunto, cuerpo, cuando_usar, etiquetas, autor_nombre)
values
  (
    'Primer contacto por LinkedIn',
    'prospeccion',
    'linkedin',
    null,
    'Hola {{nombre}}, ¿cómo estás?

Vi que en {{empresa}} están {{motivo}}. En Accedra trabajamos con equipos de IT de empresas parecidas resolviendo justo eso: infraestructura de red, servidores y licenciamiento, con equipo propio acá en Argentina.

No te escribo para venderte nada hoy. Si en algún momento están evaluando el tema, me gustaría quedar a mano para cuando pase.

Saludos,
{{yo}}',
    'Primer mensaje a alguien que no nos conoce. La clave es el {{motivo}}: si no podés completarlo con algo concreto que viste de esa empresa, no mandes este mensaje — se nota.',
    array['frío', 'linkedin'],
    'Equipo Accedra'
  ),
  (
    'Envío de presupuesto',
    'cotizacion',
    'email',
    'Propuesta {{empresa}} — {{asunto_corto}}',
    'Hola {{nombre}},

Te adjunto la propuesta por {{asunto_corto}}, según lo que hablamos el {{fecha_reunion}}.

Tres cosas para tener a mano:
· Los precios están expresados en {{moneda}} y tienen validez por {{validez}} días.
· El plazo de entrega estimado es de {{plazo}} días hábiles desde la confirmación.
· Incluye {{incluye}}.

Cualquier punto que quieras ajustar lo vemos: la idea es que la propuesta refleje lo que necesitan, no lo que nosotros supusimos.

Quedo atento.

{{yo}}
Accedra IT Solutions',
    'Cuando ya hubo una conversación y el presupuesto sale por mail. Si el precio va en dólares, dejar explícito el tipo de cambio en {{moneda}} — es la primera pregunta que vuelve siempre.',
    array['presupuesto', 'mail'],
    'Equipo Accedra'
  ),
  (
    'Seguimiento de propuesta sin respuesta',
    'seguimiento',
    'whatsapp',
    null,
    'Hola {{nombre}}, ¿cómo va todo?

Te escribo por la propuesta que te mandé el {{fecha_envio}}. No es para apurarte: quiero saber si les sirve como está o si conviene que la ajustemos por algún lado.

Si el tema quedó para más adelante también está perfecto, avisame y lo retomamos cuando les sirva.',
    'A los 4 o 5 días hábiles del envío. La frase que hace la diferencia es la última: darle una salida cómoda es lo que hace que conteste en vez de esquivar.',
    array['follow-up'],
    'Equipo Accedra'
  ),
  (
    'Recordatorio de factura próxima a vencer',
    'cobranza',
    'email',
    'Factura {{numero_factura}} — vence el {{fecha_vencimiento}}',
    'Hola {{nombre}},

Te paso un recordatorio de la factura {{numero_factura}} por {{importe}}, con vencimiento el {{fecha_vencimiento}}.

Si ya la pagaron, ignorá este mensaje y disculpá la molestia — o pasame el comprobante y la imputamos.

Datos para la transferencia:
{{datos_bancarios}}

Gracias,
{{yo}}',
    'Tres días ANTES del vencimiento, no después. Un recordatorio previo es un servicio; el mismo texto mandado tarde es un reclamo, y se lee distinto.',
    array['cobranza', 'antes-del-vencimiento'],
    'Equipo Accedra'
  ),
  (
    'Reclamo de factura vencida',
    'cobranza',
    'whatsapp',
    null,
    'Hola {{nombre}}, ¿cómo estás?

Te consulto por la factura {{numero_factura}} de {{importe}}, que venció el {{fecha_vencimiento}} y todavía figura impaga de nuestro lado.

¿La ves con fecha de pago? Si hay algo trabado avisame y lo vemos.',
    'Después del vencimiento y solo con quien tiene una relación ya establecida. Sigue siendo una pregunta, no una intimación: el tono duro se guarda para cuando este mensaje ya se mandó dos veces.',
    array['cobranza', 'vencida'],
    'Equipo Accedra'
  ),
  (
    'Entrega y puesta en marcha',
    'postventa',
    'whatsapp',
    null,
    'Hola {{nombre}}, ya salió el pedido {{numero_pedido}} 👌

Llega el {{fecha_entrega}} a {{direccion}}. Va con {{detalle}}.

Cuando lo reciban, cualquier cosa que no cierre escribime directo a mí y lo resolvemos. Si necesitan una mano con la configuración, coordinamos.',
    'El mismo día del despacho. El punto de este mensaje no es informar la entrega —eso lo dice el remito— sino dejar un nombre y un canal para cuando algo falle.',
    array['entrega', 'postventa'],
    'Equipo Accedra'
  )
on conflict do nothing;
