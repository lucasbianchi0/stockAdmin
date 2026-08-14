/**
 * El catálogo de los prompts que usa la generación de contenido.
 *
 * Es una referencia legible de lo que el sistema le manda a los modelos en cada
 * paso, con {variables} donde en runtime van los datos reales del plan y de la
 * pieza. No es el string exacto byte a byte —cada prompt se arma con el contexto
 * de marca de Accedra, el brief del canal y las fechas— pero sí la estructura y
 * las instrucciones que mandan. Sirve para entender y auditar qué se pide, y como
 * base para escribir prompts propios (ver la tabla `content_prompts`).
 *
 * Vive como dato estático y del lado del cliente: la página los muestra en modo
 * lectura. Los prompts propios que crea el equipo salen de la base, no de acá.
 */

export type PromptSistema = {
  id: string
  nombre: string
  /** En una línea, qué hace este prompt. */
  descripcion: string
  /** Qué modelo lo corre. */
  modelo: string
  /** Dónde se dispara, para poder ubicarlo en el código. */
  donde: string
  /** El cuerpo, con {variables} en lugar de los datos reales. */
  cuerpo: string
}

export const PROMPTS_SISTEMA: PromptSistema[] = [
  {
    id: "generar-plan",
    nombre: "Generar el plan de 15 días",
    descripcion:
      "Arma el calendario entero: reparte las publicaciones por canal, les asigna objetivo y audiencia, y escribe la lectura estratégica del plan.",
    modelo: "claude-sonnet-4-6",
    donde: "POST /api/contenido/calendario",
    cuerpo: `{CONTEXTO_DE_MARCA_ACCEDRA}

Sos el content strategist de Accedra. Armá el calendario de contenido desde el {fecha_inicio} hasta el {fecha_fin} ({15} días corridos).

- Total de publicaciones: {total}, repartidas por canal ({posts_por_canal}).
- Audiencia del plan: {guía_de_audiencia}.

OBJETIVO DE CADA PIEZA — toda publicación persigue exactamente UNO y lo declara:
  - "awareness" (Awareness): dar a conocer la marca
  - "educacion" (Educación): enseñar / generar consideración
  - "conversion" (Conversión): generar demanda / llamado a la acción
Un buen plan de 15 días mezcla los tres y hace que el arco progrese (más awareness/educación al principio, más conversión cuando ya hay contexto).

Reglas: fechas dentro del rango, distribuidas; evitar fines de semana (es B2B); una publicación por canal por día; el conjunto cuenta UNA historia; una sola idea por día (la recomendada); cada pieza declara "objetivo" y "audiencia" ("decisores" | "negocio" | "corporativo"); todas de formato "imagen".

Devolvé SOLO un JSON:
{
  "titulo": "…",
  "arco": "…",
  "analisis": "Reparto CONCRETO de objetivos (ej: 'De las {total}: 6 awareness, 5 educación, 4 conversión') y a qué perfiles les habla, y por qué ese equilibrio.",
  "slots": [{ "fecha", "canal", "beat", "opciones": [{ "id":"a", "titulo", "hook", "objetivo", "audiencia", "angulo", "imagen", "formato":"imagen", "recomendada":true, "porQue" }] }]
}`,
  },
  {
    id: "generar-contenido",
    nombre: "Generar el contenido de una pieza",
    descripcion:
      "Escribe el caption completo, la versión corta, los hashtags, el CTA y el prompt de imagen, orientados al objetivo y a la audiencia de la pieza.",
    modelo: "claude-sonnet-4-6",
    donde: "POST /api/contenido/calendario/slot",
    cuerpo: `{CONTEXTO_DE_MARCA_ACCEDRA}

Generá el contenido completo y listo para publicar de esta pieza.

CANAL: {canal} — {brief_del_canal}
LA PIEZA:
- Título: "{titulo}"  · Hook: "{hook}"  · Ángulo: "{angulo}"
- Se publica el {fecha}  · Rol en el plan: {beat}
- Audiencia a la que le habla: {audiencia}
- Objetivo de marketing: {objetivo} — {qué_persigue}. Escribí el caption para cumplir ESE objetivo: si es Conversión, cerrá con un llamado a la acción claro; si es Educación, enseñá algo concreto; si es Awareness, priorizá la historia y la marca por encima de la venta.
{ajuste_del_usuario_si_hay}

Usá EXACTAMENTE estos separadores:
###CAPTION###  · ###CAPTION_CORTO###  · ###HASHTAGS###  · ###CTA###  · ###PROMPT_IMAGEN###
(longitud y tono según el canal: LinkedIn 150-250 palabras y sin emojis decorativos; Meta 60-120 palabras y escaneable).`,
  },
  {
    id: "regenerar-idea",
    nombre: "Regenerar la idea de una pieza",
    descripcion:
      "Cuando la idea recomendada no convence, produce una nueva respetando los campos que fijó el usuario (título, ángulo, objetivo, audiencia) y su instrucción libre.",
    modelo: "claude-sonnet-4-6",
    donde: "POST /api/contenido/calendario/slot/regenerar",
    cuerpo: `{CONTEXTO_DE_MARCA_ACCEDRA}

Sos el content strategist de Accedra. Regenerá UNA idea de publicación para este espacio. No des variantes: proponé la mejor.

CANAL: {canal} — {brief_del_canal}
DEFINICIÓN (no se negocia):
- Objetivo: {objetivo} — {qué_persigue}
- Audiencia: {audiencia}
- Se publica el {fecha}  · Rol en el arco: {beat}
{idea_actual_si_hay}
{título_base_fijado_por_el_usuario}
{ángulo_base_fijado_por_el_usuario}
{instrucción_del_usuario — tiene prioridad}

Devolvé SOLO un JSON: { "titulo", "hook", "angulo", "imagen", "porQue" }`,
  },
  {
    id: "derivar-feed",
    nombre: "Derivar las variables del template del feed",
    descripcion:
      "Traduce la publicación ya escrita a las variables del template visual (titular, categoría, servicios, métrica…), siempre contra el catálogo real de Accedra.",
    modelo: "claude-sonnet-4-6",
    donde: "POST /api/contenido/calendario/slot/prompt-feed",
    cuerpo: `{VOCABULARIO_Y_CATALOGO_DE_ACCEDRA}

Sos el director de arte de Accedra. La publicación ya está escrita; tu trabajo es traducirla a las variables de un template visual. No estás escribiendo contenido nuevo.

LA PUBLICACIÓN
- Título: "{titulo}"  · Hook: "{hook}"  · Ángulo: "{angulo}"
- Se publica el {fecha}  · Caption ya escrito: """{caption}"""

EL TEMPLATE: {nombre_template} — {cuándo_usar}

Devolvé SOLO este JSON con los campos que el template pide ({campos}: headline, category, servicios, features, metrica, cta, evento, partner, clientes).

Reglas que no se negocian:
- Todo lo que sea un servicio, tecnología, cliente, partner o cifra sale del catálogo. Si no está ahí, va vacío.
- El texto se imprime DENTRO de la imagen: cortito, sin comillas, sin emojis, sin hashtags.
- Un campo que no aplique va vacío. Vacío es correcto; inventar no.`,
  },
]

export function promptSistemaPorId(id: string): PromptSistema | null {
  return PROMPTS_SISTEMA.find((p) => p.id === id) ?? null
}
