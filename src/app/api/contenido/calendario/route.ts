import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { secuenciaRecomendada } from "@/lib/secuencia"
import { templatesActivos } from "@/lib/templates-server"
import {
  ACCEDRA_BRAND_CONTEXT,
  AUDIENCIA_LABEL,
  CANAL_BRIEF,
  CANAL_LABEL,
  DIAS_PLAN,
  FORMATO_UNICO,
  OPCIONES_POR_IDEA,
  POSTS_POR_CANAL,
  esAudiencia,
  esCanal,
  esFechaISO,
  fechaLarga,
  sanitizarContexto,
  sumarDias,
  type Audiencia,
  type Canal,
  type Opcion,
  type PlanResumen,
} from "@/lib/calendario-context"
import { aPlanBase, columnasResumen } from "@/lib/calendario-server"

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

  const audiencia: Audiencia = esAudiencia(raw.audiencia) ? raw.audiencia : "ambos"
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

    /**
     * El template de cada pieza se decide acá, junto con el plan.
     *
     * Se calcula sobre los slots ya validados y con ids provisorios —el índice—
     * porque los definitivos los pone la base recién al insertar. Como la
     * secuencia solo necesita fecha y canal para ordenar, alcanza.
     */
    const secuencia = secuenciaRecomendada(
      plan.slots.map((s, i) => ({ id: String(i), fecha: s.fecha, canal: s.canal })),
      await templatesActivos(),
      { semilla: 0 }
    )

    const filas = plan.slots.map((s, i) => ({
      plan_id: planRow.id,
      fecha: s.fecha,
      canal: s.canal,
      beat: s.beat,
      opciones: s.opciones,
      template_slug: secuencia.get(String(i)) ?? null,
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

- Audiencia: ${AUDIENCIA_LABEL[audiencia]}
- Total de publicaciones: ${totalPosts}, repartidas así:
${seccionCanales}
${seccionContexto}
Reglas del calendario:
- Los ${DIAS_PLAN} días van del ${fechaInicio} al ${fechaFin}. Toda "fecha" tiene que caer dentro de ese rango, en formato YYYY-MM-DD.
- Distribuí las publicaciones a lo largo de todo el período, no las amontones en los primeros días.
- Evitá sábados y domingos salvo que el contexto del usuario lo pida: es B2B.
- Como máximo una publicación por canal por día.
- El conjunto cuenta UNA historia. LinkedIn y Meta son dos voces del mismo relato, no dos planes sueltos: si LinkedIn desarrolla un tema técnico, la pieza de Meta de esos días lo acompaña desde el lado humano o visual.
- Cada publicación necesita exactamente ${OPCIONES_POR_IDEA} opciones creativas MUY distintas entre sí. No tres variantes del mismo título: tres ángulos que se podrían defender por separado.
- En cada publicación, exactamente UNA de las tres opciones lleva "recomendada": true, con un "porQue" de una frase que explique por qué esa y no las otras dos. Las otras dos llevan "recomendada": false y "porQue": "".
- TODAS las piezas son de formato "imagen". No propongas carruseles, reels, videos, stories ni artículos: no hay quien los produzca y el plan se traba en la primera pieza que nadie puede hacer.

Devolvé SOLO un JSON válido, sin markdown ni texto fuera del objeto:
{
  "titulo": "Nombre del plan, máx 6 palabras",
  "arco": "Qué historia cuentan los 15 días, en 1 frase",
  "analisis": "Lectura de marketer, 3 o 4 frases: por qué ESTE reparto y no otro. Qué proporción va a dar a conocer, qué proporción educa, qué proporción convierte, y por qué ese equilibrio le sirve a Accedra en estos 15 días. Concreto, sin humo.",
  "slots": [
    {
      "fecha": "${fechaInicio}",
      "canal": "${canalesUnicos[0]}",
      "beat": "Rol de esta pieza en el arco (ej: 'Apertura — plantear el problema')",
      "opciones": [
        {
          "id": "a",
          "titulo": "Título de la publicación, máx 8 palabras",
          "hook": "Primera línea que frena el scroll, máx 15 palabras",
          "angulo": "De qué trata el posteo: qué se cuenta, con qué estructura y para qué sirve. 2 frases concretas, nada de 'contenido sobre tecnología'",
          "imagen": "Qué se va a VER en la pieza: encuadre, sujeto, si es foto propia o placa. 2 frases",
          "formato": "imagen",
          "recomendada": true,
          "porQue": "Por qué esta y no las otras dos. 1 frase. Vacío en las no recomendadas"
        }
      ]
    }
  ]
}

Los "id" de las opciones son "a", "b", "c" dentro de cada slot.`,
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

  for (const s of parsed.slots as Record<string, unknown>[]) {
    const canal = s.canal
    if (!esCanal(canal) || !validos.has(canal)) continue
    if (!esFechaISO(s.fecha)) continue
    if (s.fecha < fechaInicio || s.fecha > fechaFin) continue

    const clave = `${s.fecha}|${canal}`
    if (vistos.has(clave)) continue
    vistos.add(clave)

    const opciones = normalizarOpciones(s.opciones)
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

function normalizarOpciones(raw: unknown): Opcion[] {
  if (!Array.isArray(raw)) return []

  const opciones = raw.slice(0, OPCIONES_POR_IDEA).flatMap((o, i): Opcion[] => {
    if (!o || typeof o !== "object") return []
    const op = o as Record<string, unknown>
    const titulo = typeof op.titulo === "string" ? op.titulo.slice(0, 200) : ""
    if (!titulo) return []

    return [
      {
        // El id lo ponemos nosotros: es la clave con la que después se marca la
        // elegida, y si el modelo repite "a" en dos opciones se vuelve ambigua.
        id: LETRAS[i] ?? String(i),
        titulo,
        hook: typeof op.hook === "string" ? op.hook.slice(0, 300) : "",
        angulo: typeof op.angulo === "string" ? op.angulo.slice(0, 400) : "",
        imagen: typeof op.imagen === "string" ? op.imagen.slice(0, 400) : "",
        formato: FORMATO_UNICO,
        recomendada: op.recomendada === true,
        porQue: typeof op.porQue === "string" ? op.porQue.slice(0, 300) : "",
      },
    ]
  })

  // Exactamente una recomendada. El modelo a veces marca dos o ninguna, y las
  // dos fallas rompen lo mismo: si no hay una sola sugerencia clara, la
  // recomendación deja de significar algo.
  const marcadas = opciones.filter((o) => o.recomendada)
  if (marcadas.length !== 1 && opciones.length > 0) {
    opciones.forEach((o, i) => {
      o.recomendada = i === 0
      if (i !== 0) o.porQue = ""
    })
    if (!opciones[0].porQue) {
      opciones[0].porQue = "Es la primera del set: el modelo no marcó una recomendación clara."
    }
  }

  return opciones
}
