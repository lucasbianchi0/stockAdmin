import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import {
  ACCEDRA_BRAND_CONTEXT,
  AUDIENCIA_LABEL,
  CANAL_BRIEF,
  CANAL_LABEL,
  DIAS_PLAN,
  FORMATO_UNICO,
  OBJETIVOS,
  OBJETIVO_DESC,
  OBJETIVO_LABEL,
  OPCIONES_POR_IDEA,
  POSTS_POR_CANAL,
  esAudiencia,
  esCanal,
  esFechaISO,
  esObjetivo,
  fechaLarga,
  sanitizarContexto,
  sumarDias,
  type Audiencia,
  type Canal,
  type Opcion,
  type PlanResumen,
} from "@/lib/calendario-context"
import { aPlanBase, columnasResumen } from "@/lib/calendario-server"
import {
  DOCTRINA_HEADLINE,
  FORMA_POR_OBJETIVO,
  HEADLINE_MAX_CARACTERES,
  HEADLINE_MAX_PALABRAS,
  PATRONES_HEADLINE,
  TEST_RECHAZO,
  esPatron,
} from "@/lib/copy-headline"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Generar el plan entero es una sola llamada larga: 11 publicaciones con 3
 * opciones cada una. Medido, tarda entre dos y tres minutos.
 *
 * OJO: 60 no alcanza y lo sabemos. El plan hobby de Vercel no deja declarar más
 * (el build falla con "invalid maxDuration value"), así que en producción esta
 * ruta va a cortar por timeout hasta que el proyecto pase a Pro — ahí subir a
 * 300 — o hasta que partamos la generación en varias requests por slot.
 */
export const maxDuration = 60

/**
 * Techo de salida del plan.
 *
 * Los 8000 anteriores no alcanzaban: 11 slots × 3 opciones, cada una con un
 * ángulo y una descripción de imagen de dos frases, dan más de 26 mil
 * caracteres de JSON. El modelo llegaba al tope, la respuesta se cortaba a la
 * mitad de un slot y el JSON.parse tiraba todo el plan a la basura después de
 * dos minutos de espera.
 */
const MAX_TOKENS_PLAN = 32000

/* ── GET · todos los planes ───────────────────────────────────────────────── */

/**
 * La lista del home. Antes esto devolvía "el plan activo" y por eso solo podía
 * haber uno: crear el segundo archivaba el primero. Un plan de agosto y uno de
 * septiembre solapados es lo normal, no la excepción.
 *
 * Los archivados quedan afuera salvo que se pidan: es el estado que significa
 * justamente "no me lo muestres más".
 */
export async function GET(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const incluirArchivados = new URL(req.url).searchParams.get("archivados") === "1"

  let query = supabase
    .from("content_plans")
    .select(columnasResumen)
    .order("fecha_inicio", { ascending: false })

  if (!incluirArchivados) query = query.neq("estado", "archivado")

  const { data: planes, error } = await query
  if (error) {
    console.error("[calendario GET]", error)
    return NextResponse.json({ error: "No se pudieron cargar los planes" }, { status: 500 })
  }

  const ids = (planes ?? []).map((p) => String(p.id))
  const avances = await contarAvances(ids)

  const resumenes: PlanResumen[] = (planes ?? []).map((p) => ({
    ...aPlanBase(p),
    avance: avances.get(String(p.id)) ?? {
      total: 0,
      elegidas: 0,
      conContenido: 0,
      conImagen: 0,
    },
  }))

  return NextResponse.json({ planes: resumenes })
}

/**
 * Cuánto avanzó cada plan, sin traerse los slots enteros.
 *
 * Dos consultas flacas en vez de una gorda: para dibujar una barrita de progreso
 * no hacen falta los captions ni las opciones de cien slots. La segunda existe
 * porque contar "tiene contenido" exige filtrar por null, y agrupar del lado del
 * cliente sale más barato que traer el jsonb completo.
 */
async function contarAvances(planIds: string[]) {
  const avances = new Map<string, PlanResumen["avance"]>()
  if (planIds.length === 0) return avances

  for (const id of planIds) {
    avances.set(id, { total: 0, elegidas: 0, conContenido: 0, conImagen: 0 })
  }

  const { data: slots } = await supabase
    .from("content_slots")
    .select("plan_id, elegida, imagen_path")
    .in("plan_id", planIds)

  for (const s of slots ?? []) {
    const a = avances.get(String(s.plan_id))
    if (!a) continue
    a.total++
    if (s.elegida) a.elegidas++
    if (s.imagen_path) a.conImagen++
  }

  const { data: conContenido } = await supabase
    .from("content_slots")
    .select("plan_id")
    .in("plan_id", planIds)
    .not("contenido", "is", null)

  for (const s of conContenido ?? []) {
    const a = avances.get(String(s.plan_id))
    if (a) a.conContenido++
  }

  return avances
}

/* ── POST · generar un plan nuevo ─────────────────────────────────────────── */

export async function POST(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const raw = body as Record<string, unknown>

  const canales = Array.isArray(raw.canales) ? raw.canales.filter(esCanal) : []
  if (canales.length === 0) {
    return NextResponse.json({ error: "Elegí al menos un canal" }, { status: 400 })
  }
  // Set para que mandar ["meta","meta"] no duplique la sección del prompt.
  const canalesUnicos = [...new Set(canales)] as Canal[]

  if (!esFechaISO(raw.fechaInicio)) {
    return NextResponse.json({ error: "Fecha de inicio inválida" }, { status: 400 })
  }
  const fechaInicio = raw.fechaInicio

  const audiencia: Audiencia = esAudiencia(raw.audiencia) ? raw.audiencia : "todos"
  const contexto = sanitizarContexto(raw.contexto)

  const fechaFin = sumarDias(fechaInicio, DIAS_PLAN - 1)

  try {
    const plan = await generarPlan({ canalesUnicos, fechaInicio, fechaFin, audiencia, contexto })

    const supabaseUsuario = await createSupabaseServer()
    const {
      data: { user },
    } = await supabaseUsuario.auth.getUser()

    // Ya no se archiva el plan anterior: los planes conviven. Era el mecanismo
    // que hacía que solo pudiera haber uno.
    const { data: planRow, error: planErr } = await supabase
      .from("content_plans")
      .insert({
        titulo: plan.titulo,
        arco: plan.arco,
        analisis: plan.analisis || null,
        estado: "activo",
        fecha_inicio: fechaInicio,
        dias: DIAS_PLAN,
        canales: canalesUnicos,
        contexto: contexto || null,
        audiencia,
        created_by: user?.id ?? null,
      })
      .select()
      .single()

    if (planErr || !planRow) throw planErr ?? new Error("Sin plan")

    // Con una sola idea por slot, el plan nace ya elegido: no hay nada que
    // seleccionar entre tres, así que la pieza queda lista para generar de una.
    // El template del feed lo asigna el cliente (`secuenciaFeed`), no la base.
    const filas = plan.slots.map((s, i) => ({
      plan_id: planRow.id,
      fecha: s.fecha,
      canal: s.canal,
      beat: s.beat,
      opciones: s.opciones,
      elegida: s.opciones[0]?.id ?? null,
      orden: i,
    }))

    const { error: slotErr } = await supabase.from("content_slots").insert(filas)
    if (slotErr) throw slotErr

    return NextResponse.json({ planId: String(planRow.id) }, { status: 201 })
  } catch (err) {
    console.error("[calendario POST]", err)
    return NextResponse.json(
      { error: "No se pudo generar el plan. Probá de nuevo." },
      { status: 500 }
    )
  }
}

/* ── Generación ───────────────────────────────────────────────────────────── */

type SlotGenerado = { fecha: string; canal: Canal; beat: string; opciones: Opcion[] }

async function generarPlan({
  canalesUnicos,
  fechaInicio,
  fechaFin,
  audiencia,
  contexto,
}: {
  canalesUnicos: Canal[]
  fechaInicio: string
  fechaFin: string
  audiencia: Audiencia
  contexto: string
}): Promise<{ titulo: string; arco: string; analisis: string; slots: SlotGenerado[] }> {
  const totalPosts = canalesUnicos.reduce((a, c) => a + POSTS_POR_CANAL[c], 0)

  const seccionCanales = canalesUnicos
    .map(
      (c) =>
        `- ${CANAL_LABEL[c]} (canal "${c}"): ${POSTS_POR_CANAL[c]} publicaciones. ${CANAL_BRIEF[c]} Todas las piezas son IMAGEN.`
    )
    .join("\n")

  const seccionContexto = contexto
    ? `\nCONTEXTO QUE DA EL USUARIO — tiene prioridad sobre cualquier idea genérica. Si menciona una fecha, un lanzamiento o un evento, el plan tiene que girar alrededor de eso y ubicar las publicaciones donde corresponda:\n"""\n${contexto}\n"""\n`
    : "\nEl usuario no dio contexto específico: armá un plan general de presencia de marca.\n"

  // Cada objetivo trae ahora también qué FORMA toma su titular. Antes el objetivo
  // solo cambiaba una línea del prompt del caption, así que las once piezas
  // sonaban igual aunque persiguieran cosas distintas.
  const seccionObjetivos = OBJETIVOS.map(
    (o) => `  - "${o}" (${OBJETIVO_LABEL[o]}): ${OBJETIVO_DESC[o]}\n    Titular: ${FORMA_POR_OBJETIVO[o]}`
  ).join("\n")

  // La audiencia del plan orienta el reparto, pero cada pieza declara a quién le
  // habla: un plan puede empujar conversión a decisores y, la misma semana, subir
  // una pieza de cultura dirigida a "corporativo".
  const guiaAudiencia =
    audiencia === "todos"
      ? `La audiencia del plan es TODOS los perfiles. Repartí las piezas entre los tres: "decisores" (técnicos de IT), "negocio" (dueños y gerencia) y "corporativo" (marca empleadora, RH, cultura, otros departamentos).`
      : `La audiencia principal es ${AUDIENCIA_LABEL[audiencia]} (código "${audiencia}"): la mayoría de las piezas le hablan a ese perfil. Podés sumar alguna de "corporativo" (marca empleadora / RH / cultura) si el arco lo pide.`

  // En streaming y no con create(): por encima de ~16 mil tokens de salida, una
  // request sin stream se come el timeout HTTP del SDK antes de que el modelo
  // termine. El resultado es el mismo mensaje, pero la conexión no se cae.
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: MAX_TOKENS_PLAN,
    messages: [
      {
        role: "user",
        content: `${ACCEDRA_BRAND_CONTEXT}

Sos el content strategist de Accedra. Armá el calendario de contenido desde el ${fechaLarga(fechaInicio)} hasta el ${fechaLarga(fechaFin)} (${DIAS_PLAN} días corridos).

- Total de publicaciones: ${totalPosts}, repartidas así:
${seccionCanales}
- Audiencia del plan: ${guiaAudiencia}
${seccionContexto}
OBJETIVO DE CADA PIEZA — toda publicación persigue exactamente UNO de estos, y lo declara:
${seccionObjetivos}
Un buen plan de 15 días NO es todo lo mismo: mezcla los tres. Demasiada conversión quema a la audiencia; solo awareness no genera negocio. Equilibralos con criterio y hacé que el arco progrese (más awareness/educación al principio, más conversión cuando ya hay contexto).

Reglas del calendario:
- Los ${DIAS_PLAN} días van del ${fechaInicio} al ${fechaFin}. Toda "fecha" tiene que caer dentro de ese rango, en formato YYYY-MM-DD.
- Distribuí las publicaciones a lo largo de todo el período, no las amontones en los primeros días.
- Evitá sábados y domingos salvo que el contexto del usuario lo pida: es B2B.
- Como máximo una publicación por canal por día.
- El conjunto cuenta UNA historia. LinkedIn y Meta son dos voces del mismo relato, no dos planes sueltos: si LinkedIn desarrolla un tema técnico, la pieza de Meta de esos días lo acompaña desde el lado humano o visual.
- Cada publicación es UNA sola idea, la que vos como estratega recomendás. No des variantes: proponé la mejor y bancala con un "porQue" de una frase.
- Cada pieza declara su "objetivo" (uno de: ${OBJETIVOS.map((o) => `"${o}"`).join(", ")}) y su "audiencia" (uno de: "decisores", "negocio", "corporativo").
- TODAS las piezas son de formato "imagen". No propongas carruseles, reels, videos, stories ni artículos: no hay quien los produzca y el plan se traba en la primera pieza que nadie puede hacer.

${DOCTRINA_HEADLINE}

VARIÁ LOS PATRONES a lo largo del plan: como máximo DOS piezas pueden repetir el mismo "patron". Once titulares con la misma fórmula se leen como once veces el mismo posteo, por más que el tema cambie.

${TEST_RECHAZO}

ANTES DEL TITULAR, LA TESIS. Cada pieza defiende una afirmación concreta, en una frase que alguien podría discutir. "La importancia de la ciberseguridad" NO es una tesis: nadie la discute y no se puede desarrollar. "El firewall perimetral no ve al atacante que ya entró con credenciales válidas" sí lo es. El titular es la versión impresa de la tesis, y el caption la desarrolla después.

Devolvé SOLO un JSON válido, sin markdown ni texto fuera del objeto:
{
  "titulo": "Nombre del plan, máx 6 palabras",
  "arco": "Qué historia cuentan los 15 días, en 1 frase",
  "analisis": "Lectura de marketer, 3 o 4 frases. Arrancá con el reparto CONCRETO de objetivos (ej: 'De las ${totalPosts} piezas: 6 awareness, 5 educación y 4 conversión') y a qué perfiles les habla. Después, por qué ESE equilibrio le sirve a Accedra en estos 15 días. Concreto, sin humo.",
  "slots": [
    {
      "fecha": "${fechaInicio}",
      "canal": "${canalesUnicos[0]}",
      "beat": "Rol de esta pieza en el arco (ej: 'Apertura — plantear el problema')",
      "opciones": [
        {
          "id": "a",
          "tesis": "La afirmación que defiende la pieza, en 1 frase discutible",
          "headline": "EL TEXTO IMPRESO EN LA PIEZA. Máx ${HEADLINE_MAX_PALABRAS} palabras. Ver las reglas del titular más arriba",
          "patron": ${PATRONES_HEADLINE.map((p) => `"${p.id}"`).join(" | ")},
          "titulo": "Nombre interno de la pieza para la grilla del calendario, máx 8 palabras. NO es el titular impreso",
          "hook": "Primera línea del caption, la que frena el scroll en el feed, máx 15 palabras",
          "objetivo": "awareness | educacion | conversion",
          "audiencia": "decisores | negocio | corporativo",
          "angulo": "De qué trata el posteo: qué se cuenta, con qué estructura y para qué sirve. 2 frases concretas, nada de 'contenido sobre tecnología'",
          "imagen": "Qué se va a VER en la pieza: encuadre, sujeto, si es foto propia o placa. 2 frases",
          "formato": "imagen",
          "recomendada": true,
          "porQue": "Por qué esta idea, en 1 frase: qué busca y a quién le habla"
        }
      ]
    }
  ]
}

Cada slot tiene exactamente UNA opción, con "id": "a".`,
      },
    ],
  })

  const message = await stream.finalMessage()

  const text = message.content[0]?.type === "text" ? message.content[0].text : ""
  const parsed = parsearRespuesta(text)

  // Que haya llegado al tope no es fatal: `parsearRespuesta` rescata los slots
  // completos. Pero se registra, porque significa que el plan salió más corto
  // de lo pedido y el motivo no se ve en ningún lado.
  if (message.stop_reason === "max_tokens") {
    console.warn(
      `[calendario POST] la respuesta llegó al tope de ${MAX_TOKENS_PLAN} tokens; ` +
        `se rescataron ${Array.isArray(parsed.slots) ? parsed.slots.length : 0} slots`
    )
  }

  if (!Array.isArray(parsed.slots) || parsed.slots.length === 0) {
    throw new Error("Plan sin slots")
  }

  // El modelo cumple casi siempre, pero un slot fuera de rango o con un canal
  // que no se pidió rompería la grilla en silencio. Se descarta acá y no en la
  // UI: la base no debería guardar nunca un slot que no se puede dibujar.
  const validos = new Set(canalesUnicos)
  const vistos = new Set<string>()
  const slots: SlotGenerado[] = []

  // A quién le habla una pieza si el modelo no lo dijo: el perfil del plan, o
  // "decisores" cuando el plan apunta a todos.
  const audienciaDefault: Audiencia = audiencia === "todos" ? "decisores" : audiencia

  for (const s of parsed.slots as Record<string, unknown>[]) {
    const canal = s.canal
    if (!esCanal(canal) || !validos.has(canal)) continue
    if (!esFechaISO(s.fecha)) continue
    if (s.fecha < fechaInicio || s.fecha > fechaFin) continue

    const clave = `${s.fecha}|${canal}`
    if (vistos.has(clave)) continue
    vistos.add(clave)

    const opciones = normalizarOpciones(s.opciones, audienciaDefault)
    if (opciones.length === 0) continue

    slots.push({
      fecha: s.fecha,
      canal,
      beat: typeof s.beat === "string" ? s.beat.slice(0, 200) : "",
      opciones,
    })
  }

  if (slots.length === 0) throw new Error("Ningún slot válido")

  slots.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))

  return {
    titulo: typeof parsed.titulo === "string" ? parsed.titulo.slice(0, 120) : "Plan de contenido",
    analisis: typeof parsed.analisis === "string" ? parsed.analisis.slice(0, 1200) : "",
    arco: typeof parsed.arco === "string" ? parsed.arco.slice(0, 500) : "",
    slots,
  }
}

/* ── Parseo de la respuesta ───────────────────────────────────────────────── */

type RespuestaPlan = {
  titulo?: unknown
  analisis?: unknown
  arco?: unknown
  slots?: unknown
}

/**
 * Lee el JSON del plan, y si vino cortado rescata lo que se pueda.
 *
 * El camino feliz es un JSON.parse y nada más. El otro existe porque un plan
 * son dos o tres minutos de generación: perder las diez publicaciones que sí
 * llegaron porque la número once se cortó a la mitad es tirar todo ese tiempo,
 * y el usuario no tiene forma de saber que le faltó una.
 */
function parsearRespuesta(text: string): RespuestaPlan {
  const desde = text.indexOf("{")
  if (desde === -1) throw new Error("Sin JSON en la respuesta")

  const hasta = text.lastIndexOf("}")
  if (hasta > desde) {
    try {
      return JSON.parse(text.slice(desde, hasta + 1)) as RespuestaPlan
    } catch {
      // Cortado. Sigue abajo — no es motivo para perder el plan entero.
    }
  }

  return {
    titulo: campoSuelto(text, "titulo"),
    arco: campoSuelto(text, "arco"),
    analisis: campoSuelto(text, "analisis"),
    slots: slotsCompletos(text),
  }
}

/**
 * Un campo de texto del nivel superior, leído sin parsear el objeto entero.
 *
 * Solo mira lo que hay ANTES de "slots": cada opción de cada slot tiene su
 * propio "titulo", y buscando en todo el texto el primero que aparece podría
 * ser el de una publicación en vez del nombre del plan.
 */
function campoSuelto(text: string, nombre: string): string {
  const finCabecera = text.indexOf('"slots"')
  const cabecera = finCabecera === -1 ? text : text.slice(0, finCabecera)

  const coincide = cabecera.match(new RegExp(`"${nombre}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`))
  if (!coincide) return ""

  // Vuelve a pasar por JSON.parse para deshacer los escapes: un título con una
  // comilla adentro llega como \" y hay que devolverlo como comilla.
  try {
    return JSON.parse(`"${coincide[1]}"`) as string
  } catch {
    return coincide[1]
  }
}

/**
 * Los slots que están completos, recorriendo el array a mano.
 *
 * Cuenta llaves llevando la cuenta de si está dentro de una cadena: sin eso,
 * una llave escrita dentro de un titular —o el `{` de un emoji escapado—
 * descuadraría la profundidad y cortaría el rescate donde no corresponde. Cada
 * objeto que cierra bien se parsea por separado; el que quedó a medias, al
 * final, simplemente nunca cierra y queda afuera.
 */
function slotsCompletos(text: string): unknown[] {
  const marca = text.indexOf('"slots"')
  if (marca === -1) return []

  const inicio = text.indexOf("[", marca)
  if (inicio === -1) return []

  const slots: unknown[] = []
  let profundidad = 0
  let comienzo = -1
  let enCadena = false
  let escapando = false

  for (let i = inicio + 1; i < text.length; i++) {
    const c = text[i]

    if (enCadena) {
      if (escapando) escapando = false
      else if (c === "\\") escapando = true
      else if (c === '"') enCadena = false
      continue
    }

    if (c === '"') {
      enCadena = true
    } else if (c === "{") {
      if (profundidad === 0) comienzo = i
      profundidad++
    } else if (c === "}") {
      profundidad--
      if (profundidad === 0 && comienzo !== -1) {
        try {
          slots.push(JSON.parse(text.slice(comienzo, i + 1)))
        } catch {
          // Un slot que no parsea se descarta solo; los demás siguen.
        }
        comienzo = -1
      }
    } else if (c === "]" && profundidad === 0) {
      break
    }
  }

  return slots
}

const LETRAS = ["a", "b", "c", "d"]

/**
 * El titular, dentro del presupuesto de la placa.
 *
 * Corta por palabra entera y no por carácter: "…acceso a tu re" es peor que un
 * titular corto. Si aun así no entra, el que llega es el que el modelo escribió
 * de más — se registra, porque significa que el prompt no se cumplió y eso no se
 * ve en ningún lado.
 */
function recortarHeadline(raw: unknown): string {
  if (typeof raw !== "string") return ""
  const limpio = raw.trim().replace(/\s+/g, " ")
  if (limpio.length <= HEADLINE_MAX_CARACTERES) return limpio

  const palabras = limpio.split(" ")
  let corto = ""
  for (const p of palabras) {
    const tentativa = corto ? `${corto} ${p}` : p
    if (tentativa.length > HEADLINE_MAX_CARACTERES) break
    corto = tentativa
  }

  console.warn(
    `[calendario] titular de ${limpio.length} caracteres recortado a ${corto.length}: "${limpio}"`
  )
  // Si ni la primera palabra entra, se devuelve el original: mejor una placa
  // fuera de sistema que una pieza sin titular.
  return corto || limpio
}

/**
 * `audienciaDefault` es a quién le habla la pieza si el modelo no lo declara: el
 * perfil del plan, o "decisores" cuando el plan apunta a todos (es el prioritario
 * en un B2B). Nunca "todos": eso es un objetivo del plan, no de una pieza suelta.
 */
function normalizarOpciones(raw: unknown, audienciaDefault: Audiencia): Opcion[] {
  if (!Array.isArray(raw)) return []

  const opciones = raw.slice(0, OPCIONES_POR_IDEA).flatMap((o, i): Opcion[] => {
    if (!o || typeof o !== "object") return []
    const op = o as Record<string, unknown>
    const titulo = typeof op.titulo === "string" ? op.titulo.slice(0, 200) : ""
    if (!titulo) return []

    const audienciaOp =
      esAudiencia(op.audiencia) && op.audiencia !== "todos" ? op.audiencia : audienciaDefault

    // El titular no se completa con el título si falta: son dos textos distintos
    // —uno se imprime enorme dentro de la imagen y el otro es el nombre de la
    // fila en la grilla— y rellenar uno con el otro es justo lo que devolvía
    // palabras sueltas impresas. Vacío se resuelve después, en el derivador.
    //
    // El tope es de caracteres y no de palabras porque lo que se agota es el
    // ANCHO de la columna. Cortado a 200, un titular de sesenta y cuatro salía
    // entero y la placa lo imprimía con la letra a dos tercios del resto del feed.
    const headline = recortarHeadline(op.headline)

    return [
      {
        // El id lo ponemos nosotros: es la clave con la que después se marca la
        // elegida, y si el modelo repite "a" se vuelve ambigua.
        id: LETRAS[i] ?? String(i),
        titulo,
        headline,
        patron: esPatron(op.patron) ? op.patron : "",
        tesis: typeof op.tesis === "string" ? op.tesis.slice(0, 400) : "",
        hook: typeof op.hook === "string" ? op.hook.slice(0, 300) : "",
        objetivo: esObjetivo(op.objetivo) ? op.objetivo : "awareness",
        audiencia: audienciaOp,
        angulo: typeof op.angulo === "string" ? op.angulo.slice(0, 400) : "",
        imagen: typeof op.imagen === "string" ? op.imagen.slice(0, 400) : "",
        formato: FORMATO_UNICO,
        // Con una sola idea, siempre es "la recomendada".
        recomendada: true,
        porQue: typeof op.porQue === "string" ? op.porQue.slice(0, 300) : "",
      },
    ]
  })

  return opciones
}
