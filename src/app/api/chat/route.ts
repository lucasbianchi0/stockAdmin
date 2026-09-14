import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"

import { createSupabaseServer } from "@/lib/supabase-server"
import { accesoDeUsuario, type Acceso } from "@/lib/permisos"
import { contarUso } from "@/lib/rate-limit"
import { armarSystemPrompt } from "@/lib/chatbot/persona"
import { mapaPara } from "@/lib/chatbot/knowledge"
import { armarContexto } from "@/lib/chatbot/context"
import {
  SECCIONES_ASISTENTE,
  datosDelPanel,
  herramientaPanel,
  seccionesPara,
  type Seccion,
} from "@/lib/chatbot/admin-reportes"
import { agentePorId, esAgenteId, puedeUsarAgente, type AgenteId } from "@/lib/chatbot/agentes"
import { armarPromptEspecialista, especialista } from "@/lib/chatbot/especialistas"
import {
  documentosPara,
  herramientaDocumentos,
  leerDocumento,
  type ContenidoLectura,
  type Documento,
} from "@/lib/chatbot/documentos"
import {
  crearTicketDesdeAgente,
  herramientaTicket,
  proyectosDeTickets,
  type ProyectoTicket,
} from "@/lib/chatbot/tickets"
import { MAX_HISTORIAL, MAX_LARGO, MAX_LARGO_RESPUESTA, MAX_MENSAJES } from "@/lib/chatbot/limites"
import { nombreDeUsuario } from "@/lib/usuario"

/**
 * El asistente del backoffice.
 *
 * La regla que sostiene toda la seguridad: el usuario, su acceso y su contexto
 * salen de la sesión del servidor, nunca del body. Del navegador llega el
 * historial y nada más — ni rol, ni id, ni preferencias.
 *
 * Responde SSE armado a mano (`texto`, `error`, `fin`) y no un stream de texto
 * plano, porque un error a mitad de respuesta tiene que poder distinguirse de
 * una respuesta que dice "error".
 */

/** Un especialista razona y puede leer un informe entero antes de contestar. */
export const maxDuration = 120

/**
 * Un modelo por tipo de trabajo.
 *
 * El asistente contesta dónde queda cada cosa, un dato de la marca o un número
 * del panel, en tres oraciones: lo difícil ya lo resolvieron el prompt, el mapa
 * y las herramientas, y Sonnet lo hace igual de bien por 2,5 veces menos.
 * Los especialistas auditan, cruzan un informe con el presupuesto o calculan la
 * rentabilidad de un producto: ahí sí se nota Opus, y un número mal leído
 * cuesta más que lo que se ahorra.
 */
const MODELO_ASISTENTE = "claude-sonnet-5"
const MODELO_ESPECIALISTA = "claude-opus-5"
/**
 * Si Opus declina, la API reintenta en éste dentro del mismo pedido. Sonnet 5
 * no tiene respaldo: su lista de modelos permitidos en /v1/models está vacía y
 * mandarle uno es un 400. Un rechazo del asistente se muestra como tal.
 */
const RESPALDO_ESPECIALISTA = "claude-opus-4-8"
/** Con herramientas, dos vueltas alcanzan (pide, contesta). La tercera es de
 *  gracia y va sin poder pedir más: sin tope, un bucle se come la cuenta. */
const VUELTAS = 3
/** Una auditoría trae varias secciones y un informe antes de escribir. */
const VUELTAS_ESPECIALISTA = 5

const LIMITE_RAFAGA = { cantidad: 25, segundos: 300 }
const LIMITE_DIA = { cantidad: 120, segundos: 86400 }
/** Leer un PDF cuesta decenas de veces un mensaje común: tiene su propio techo. */
const LIMITE_DOCUMENTOS_DIA = 20
/** Y por mensaje: cada PDF son miles de tokens que viajan en cada vuelta. */
const LECTURAS_POR_MENSAJE = 2
/**
 * Tickets que puede anotar un agente, por mensaje y por día.
 *
 * Es la única herramienta que escribe, y el tablero lo mira todo el equipo: un
 * bucle que abre cuarenta tickets no gasta plata, ensucia el trabajo de los
 * demás y hay que limpiarlo a mano. Seis por mensaje alcanzan para el plan más
 * largo que escribe un especialista.
 */
const TICKETS_POR_MENSAJE = 6
const LIMITE_TICKETS_DIA = 40

type Entrada = { role: "user" | "assistant"; content: string }

function leerHistorial(body: unknown): Entrada[] | null {
  if (!body || typeof body !== "object") return null
  const crudo = (body as { messages?: unknown }).messages
  if (!Array.isArray(crudo) || crudo.length === 0 || crudo.length > MAX_MENSAJES) return null

  const mensajes: Entrada[] = []
  for (const m of crudo) {
    if (!m || typeof m !== "object") return null
    const { role, content } = m as Record<string, unknown>
    if (role !== "user" && role !== "assistant") return null
    if (typeof content !== "string") return null
    const texto = content.trim()
    // Lo que escribe la persona tiene un tope; lo que respondió el asistente,
    // otro más alto. Con uno solo, la primera respuesta larga rompía el
    // mensaje siguiente.
    const tope = role === "user" ? MAX_LARGO : MAX_LARGO_RESPUESTA
    if (!texto || texto.length > tope) return null
    mensajes.push({ role, content: texto })
  }

  // La API exige que arranque y termine en la persona.
  if (mensajes[0].role !== "user" || mensajes[mensajes.length - 1].role !== "user") return null
  // El techo de gasto del historial entero. El navegador ya recorta antes de
  // mandar; esto es lo que vale si alguien arma el pedido a mano.
  if (mensajes.reduce((n, m) => n + m.content.length, 0) > MAX_HISTORIAL) return null
  return mensajes
}

/** Sin `agente` es el asistente, como antes de que hubiera agentes. */
function leerAgente(body: unknown): AgenteId | null {
  const crudo = (body as { agente?: unknown }).agente
  if (crudo === undefined) return "asistente"
  return esAgenteId(crudo) ? crudo : null
}

type Estado = {
  acceso: Acceso
  userId: string
  usuarioNombre: string
  agenteId: AgenteId
  documentos: Documento[]
  secciones: Seccion[]
  proyectos: ProyectoTicket[]
  lecturas: number
  tickets: number
}

async function ejecutar(
  llamada: Anthropic.Beta.BetaToolUseBlock,
  estado: Estado
): Promise<ContenidoLectura> {
  const input = (llamada.input ?? {}) as Record<string, unknown>

  if (llamada.name === "datos_del_panel") {
    return datosDelPanel(input.seccion, estado.acceso, estado.secciones)
  }

  if (llamada.name === "leer_documento") {
    // Se cuenta antes del primer await: dos lecturas pedidas en paralelo
    // tienen que ver el mismo contador.
    if (estado.lecturas >= LECTURAS_POR_MENSAJE) {
      return "Ya se leyeron dos documentos en este mensaje. Respondé con eso y, si hace falta otro, que lo pregunte aparte."
    }
    estado.lecturas++

    const cupo = await contarUso(`chat-doc:${estado.userId}`, LIMITE_DOCUMENTOS_DIA, 86400)
    if (cupo === "excedido") {
      return "Se alcanzó el límite de lecturas de documentos de hoy. Decile que lo abra desde la pantalla; mañana se renueva."
    }
    if (cupo === "sin-contador") {
      return "No pude abrir el documento ahora. Decile que lo mire desde la pantalla."
    }
    return leerDocumento(input.clave, estado.documentos)
  }

  if (llamada.name === "crear_ticket") {
    // Se cuenta antes del primer await, igual que las lecturas: seis tickets
    // pedidos en la misma vuelta tienen que ver el mismo contador.
    if (estado.tickets >= TICKETS_POR_MENSAJE) {
      return "Ya se anotaron demasiados tickets en este mensaje. Contá los que quedaron y ofrecele anotar el resto en otra tanda."
    }
    estado.tickets++

    const cupo = await contarUso(`chat-ticket:${estado.userId}`, LIMITE_TICKETS_DIA, 86400)
    if (cupo === "excedido") {
      return "Se alcanzó el límite de tickets del día. Decile que lo anote él desde /tickets; mañana se renueva."
    }
    if (cupo === "sin-contador") {
      return "No pude anotar el ticket ahora. Ofrecele el texto para que lo pegue él en /tickets."
    }

    return crearTicketDesdeAgente(input, {
      usuarioId: estado.userId,
      usuarioNombre: estado.usuarioNombre,
      agenteId: estado.agenteId,
      proyectos: estado.proyectos,
    })
  }

  return "Esa herramienta no existe."
}

/**
 * Qué decirle a la persona mientras el modelo usa una herramienta.
 *
 * Sin esto, entre que el agente decide anotar seis tickets y escribe la
 * respuesta pasan varios segundos con tres puntitos en pantalla: lo mismo que
 * se ve cuando algo se colgó. Y acá encima el modelo está escribiendo en el
 * tablero del equipo, que es exactamente el momento en que alguien quiere saber
 * qué está pasando.
 *
 * Es la etiqueta de la tanda, no una por llamada: dos etiquetas alternándose a
 * 200ms no las lee nadie.
 */
function etiquetaDePaso(nombres: string[]): string {
  const tickets = nombres.filter((n) => n === "crear_ticket").length
  if (tickets > 0) return tickets === 1 ? "Anotando el ticket" : `Anotando ${tickets} tickets`
  if (nombres.includes("leer_documento")) return "Leyendo el documento"
  if (nombres.includes("datos_del_panel")) return "Mirando los números"
  return "Buscando datos"
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "El asistente todavía no está configurado." },
      { status: 503 }
    )
  }

  // ── 1. Sesión → usuario y acceso. Nunca del body. ──────────────────────────
  const supabaseAuth = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const acceso = accesoDeUsuario(user)
  if (!acceso.admin && acceso.modulos.length === 0) {
    return NextResponse.json({ error: "El usuario no tiene módulos asignados" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
  }
  const historial = leerHistorial(body)
  const agenteId = leerAgente(body)
  if (!historial || !agenteId) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })

  // El selector ya esconde los agentes de otros módulos; esto es la barrera.
  if (!puedeUsarAgente(acceso, agentePorId(agenteId))) {
    return NextResponse.json({ error: "No tenés habilitado ese agente." }, { status: 403 })
  }

  // ── 2. Techo de gasto, por usuario y no por IP. ─────────────────────────────
  // Con sólo la ráfaga, alguien sostiene 25 mensajes cada cinco minutos todo el
  // día: 7.200. La diaria es la que pone el techo.
  const [rafaga, dia] = await Promise.all([
    contarUso(`chat:${user.id}`, LIMITE_RAFAGA.cantidad, LIMITE_RAFAGA.segundos),
    contarUso(`chat-dia:${user.id}`, LIMITE_DIA.cantidad, LIMITE_DIA.segundos),
  ])
  if (rafaga === "sin-contador" || dia === "sin-contador") {
    return NextResponse.json(
      { error: "El asistente no está disponible en este momento. Probá en un rato." },
      { status: 503 }
    )
  }
  if (dia === "excedido") {
    return NextResponse.json(
      { error: "Llegaste al límite de mensajes de hoy. Mañana se renueva." },
      { status: 429 }
    )
  }
  if (rafaga === "excedido") {
    return NextResponse.json(
      { error: "Mandaste muchos mensajes seguidos. Esperá unos minutos y seguimos." },
      { status: 429 }
    )
  }

  // ── 3 y 4. Contexto vivo, documentos y prompt. ──────────────────────────────
  // Dos bloques con caché: el primero es igual para todos los que comparten
  // acceso; el segundo cambia por persona pero no durante la conversación.
  // Un especialista cambia la persona, lo que puede leer y cuánto razona; el
  // acceso y los límites son los mismos.
  const esp = agenteId === "asistente" ? null : especialista(agenteId)
  const [contexto, disponibles, proyectos] = await Promise.all([
    armarContexto(user, acceso, esp ? esp.contextoMarketing : true),
    esp && !esp.documentos ? Promise.resolve([]) : documentosPara(acceso),
    proyectosDeTickets(),
  ])
  const documentos =
    !esp || esp.documentos === "todos"
      ? disponibles
      : disponibles.filter((d) => d.origen.tipo === (esp.documentos === "brochures" ? "brochure" : "informe"))

  const prompt =
    agenteId === "asistente"
      ? armarSystemPrompt(acceso, mapaPara(acceso))
      : armarPromptEspecialista(agenteId, acceso)
  /*
   * La caché, en tres alturas, de lo más estable a lo más volátil:
   *
   *  1. El prompt: igual para todos los que comparten acceso y agente. Una hora
   *     y no cinco minutos: en un backoffice con pocas personas las
   *     conversaciones llegan espaciadas, y con cinco minutos casi cada una
   *     volvía a pagar la escritura entera.
   *  2. El estado compartido (fecha, popup, plantillas): cambia por día o
   *     cuando alguien toca algo. Marca propia para que ese cambio no tire la
   *     del prompt. También una hora: las de una hora tienen que ir antes que
   *     las de cinco minutos.
   *  3. El nombre de quien escribe, sin marca: si fuera adentro de lo cacheado,
   *     el bloque sería distinto por persona y no lo reusaría nadie.
   *
   * La conversación la cachea la marca automática del pedido (ver abajo), que
   * se corre sola al final de cada vuelta. Son tres de los cuatro puntos que
   * permite la API.
   */
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: prompt, cache_control: { type: "ephemeral", ttl: "1h" } },
    { type: "text", text: contexto.compartido, cache_control: { type: "ephemeral", ttl: "1h" } },
    { type: "text", text: contexto.personal },
  ]

  // ── 5. Herramientas según el acceso y el agente. ────────────────────────────
  // Se entrega sólo lo que corresponde: un modelo no puede llamar a una sección
  // o abrir un documento que no recibió, por más que el mensaje lo convenza.
  const secciones = seccionesPara(acceso, esp ? esp.secciones : SECCIONES_ASISTENTE)
  const herramientas: Anthropic.Beta.BetaTool[] = [
    ...(secciones.length > 0 ? [herramientaPanel(secciones)] : []),
    ...(documentos.length > 0 ? [herramientaDocumentos(documentos)] : []),
    // La ticketera es de todos los que tienen algún módulo —y acá arriba ya se
    // rechazó a quien no tiene ninguno—, así que va con cualquier agente.
    //
    // Su descripción lleva la lista de proyectos, y las herramientas van antes
    // que el prompt en el prefijo cacheado: crear o renombrar un proyecto tira
    // la caché de todos hasta la siguiente escritura. Es barato porque pasa una
    // vez cada varias semanas; si algún día los proyectos se tocaran a diario,
    // habría que sacarlos del esquema y resolverlos por nombre al ejecutar.
    herramientaTicket(proyectos),
  ]

  const estado: Estado = {
    acceso,
    userId: user.id,
    usuarioNombre: nombreDeUsuario(user),
    agenteId,
    documentos,
    secciones,
    proyectos,
    lecturas: 0,
    tickets: 0,
  }
  const vueltas = esp ? VUELTAS_ESPECIALISTA : VUELTAS
  const client = new Anthropic()
  const mensajes: Anthropic.Beta.BetaMessageParam[] = historial.map((m) => ({
    role: m.role,
    content: m.content,
  }))
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let cerrado = false
      const enviar = (evento: string, dato: unknown) => {
        if (cerrado) return
        try {
          controller.enqueue(encoder.encode(`event: ${evento}\ndata: ${JSON.stringify(dato)}\n\n`))
        } catch {
          cerrado = true
        }
      }

      let huboTexto = false
      // Lo que costó el mensaje, sumando las vueltas. Va al log sin el
      // contenido: es la única forma de saber si la caché se está leyendo.
      const uso = { vueltas: 0, entrada: 0, escrituraCache: 0, lecturaCache: 0, salida: 0 }
      try {
        for (let vuelta = 0; vuelta < vueltas; vuelta++) {
          const ultima = vuelta === vueltas - 1
          // Si la vuelta anterior ya escribió algo ("dejame fijarme"), lo que
          // sigue va en otro párrafo y no pegado a la misma oración.
          let separar = huboTexto

          const respuesta = client.beta.messages.stream(
            {
              model: esp ? MODELO_ESPECIALISTA : MODELO_ASISTENTE,
              // Una auditoría o un plan son largos; una consulta de soporte, no.
              max_tokens: esp ? 8000 : 2000,
              ...(esp
                ? { betas: ["server-side-fallback-2026-06-01"], fallbacks: [{ model: RESPALDO_ESPECIALISTA }] }
                : {}),
              system,
              messages: mensajes,
              // La conversación: la marca cae en el último bloque y avanza con
              // cada mensaje y cada vuelta, así lo ya mandado se lee a 0,1×.
              cache_control: { type: "ephemeral" },
              ...(herramientas.length > 0
                ? { tools: herramientas, tool_choice: ultima ? { type: "none" as const } : { type: "auto" as const } }
                : {}),
              // Una consulta de soporte no necesita razonar en profundidad, y la
              // persona está mirando la pantalla esperando. Un especialista sí:
              // cruzar un informe con el presupuesto es justamente su trabajo.
              ...(esp ? { thinking: { type: "adaptive" as const } } : {}),
              output_config: { effort: esp ? ("medium" as const) : ("low" as const) },
            },
            { signal: req.signal }
          )

          respuesta.on("text", (t) => {
            if (separar) {
              enviar("texto", "\n\n")
              separar = false
            }
            huboTexto = true
            enviar("texto", t)
          })

          const final = await respuesta.finalMessage()
          uso.vueltas++
          uso.entrada += final.usage.input_tokens
          uso.escrituraCache += final.usage.cache_creation_input_tokens ?? 0
          uso.lecturaCache += final.usage.cache_read_input_tokens ?? 0
          uso.salida += final.usage.output_tokens

          if (final.stop_reason === "refusal") {
            enviar("error", { mensaje: "Eso no lo puedo responder." })
            break
          }
          if (final.stop_reason !== "tool_use") break

          // La vuelta de herramienta: el turno del asistente entero vuelve al
          // historial, y los resultados van juntos en un solo turno de usuario.
          const llamadas = final.content.filter(
            (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use"
          )
          mensajes.push({ role: "assistant", content: final.content })

          enviar("paso", { texto: etiquetaDePaso(llamadas.map((l) => l.name)) })
          const resultados = await Promise.all(
            llamadas.map(async (l) => ({
              type: "tool_result" as const,
              tool_use_id: l.id,
              content: await ejecutar(l, estado),
            }))
          )
          // Se apaga acá y no al final del stream: lo que sigue es el modelo
          // escribiendo, y para eso ya está el indicador de siempre.
          enviar("paso", { texto: null })

          mensajes.push({ role: "user", content: resultados })
        }
        enviar("fin", { ok: true })
      } catch (e) {
        // Si la persona cerró el panel o mandó otro mensaje, no es una falla.
        if (!req.signal.aborted) {
          // Con el userId y sin el contenido: la conversación es efímera
          // también en los logs.
          console.error("[chat] Falló", { userId: user.id, error: (e as Error).message })
          enviar("error", { mensaje: "Se me cortó la respuesta. Probá de nuevo." })
        }
      } finally {
        if (uso.vueltas > 0) console.info("[chat] uso", { userId: user.id, agente: agenteId, ...uso })
        cerrado = true
        try {
          controller.close()
        } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // Sin no-transform un proxy puede bufferear el stream y la respuesta
      // aparece toda junta al final.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  })
}
