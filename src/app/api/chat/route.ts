import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"

import { createSupabaseServer } from "@/lib/supabase-server"
import { accesoDeUsuario, type Acceso } from "@/lib/permisos"
import { contarUso } from "@/lib/rate-limit"
import { armarSystemPrompt } from "@/lib/chatbot/persona"
import { mapaPara } from "@/lib/chatbot/knowledge"
import { armarContexto } from "@/lib/chatbot/context"
import { datosDelPanel, herramientaPanel, seccionesPara } from "@/lib/chatbot/admin-reportes"
import {
  documentosPara,
  herramientaDocumentos,
  leerDocumento,
  type ContenidoLectura,
  type Documento,
} from "@/lib/chatbot/documentos"
import { MAX_LARGO, MAX_LARGO_RESPUESTA, MAX_MENSAJES } from "@/lib/chatbot/limites"

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

export const maxDuration = 60

const MODELO = "claude-opus-5"
/** Si el modelo principal declina, la API reintenta en éste dentro del mismo pedido. */
const RESPALDO = "claude-opus-4-8"
/** Con herramientas, dos vueltas alcanzan (pide, contesta). La tercera es de
 *  gracia y va sin poder pedir más: sin tope, un bucle se come la cuenta. */
const VUELTAS = 3

const LIMITE_RAFAGA = { cantidad: 25, segundos: 300 }
const LIMITE_DIA = { cantidad: 120, segundos: 86400 }
/** Leer un PDF cuesta decenas de veces un mensaje común: tiene su propio techo. */
const LIMITE_DOCUMENTOS_DIA = 20
/** Y por mensaje. Con dos lecturas y los dos bloques del sistema se usan justo
 *  los cuatro puntos de caché que permite la API. */
const LECTURAS_POR_MENSAJE = 2

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
  return mensajes
}

type Estado = {
  acceso: Acceso
  userId: string
  documentos: Documento[]
  lecturas: number
}

async function ejecutar(
  llamada: Anthropic.Beta.BetaToolUseBlock,
  estado: Estado
): Promise<ContenidoLectura> {
  const input = (llamada.input ?? {}) as Record<string, unknown>

  if (llamada.name === "datos_del_panel") {
    return datosDelPanel(input.seccion, estado.acceso)
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

  return "Esa herramienta no existe."
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
  if (!historial) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })

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
  const [contexto, documentos] = await Promise.all([
    armarContexto(user, acceso),
    documentosPara(acceso),
  ])
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: armarSystemPrompt(acceso, mapaPara(acceso)), cache_control: { type: "ephemeral" } },
    { type: "text", text: contexto, cache_control: { type: "ephemeral" } },
  ]

  // ── 5. Herramientas según el acceso. ────────────────────────────────────────
  // Se entrega sólo lo que corresponde: un modelo no puede llamar a una sección
  // o abrir un documento que no recibió, por más que el mensaje lo convenza.
  const secciones = seccionesPara(acceso)
  const herramientas: Anthropic.Beta.BetaTool[] = [
    ...(secciones.length > 0 ? [herramientaPanel(secciones)] : []),
    ...(documentos.length > 0 ? [herramientaDocumentos(documentos)] : []),
  ]

  const estado: Estado = { acceso, userId: user.id, documentos, lecturas: 0 }
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
      try {
        for (let vuelta = 0; vuelta < VUELTAS; vuelta++) {
          const ultima = vuelta === VUELTAS - 1
          // Si la vuelta anterior ya escribió algo ("dejame fijarme"), lo que
          // sigue va en otro párrafo y no pegado a la misma oración.
          let separar = huboTexto

          const respuesta = client.beta.messages.stream(
            {
              model: MODELO,
              max_tokens: 2000,
              betas: ["server-side-fallback-2026-06-01"],
              fallbacks: [{ model: RESPALDO }],
              system,
              messages: mensajes,
              ...(herramientas.length > 0
                ? { tools: herramientas, tool_choice: ultima ? { type: "none" as const } : { type: "auto" as const } }
                : {}),
              // Una consulta de soporte no necesita razonar en profundidad, y la
              // persona está mirando la pantalla esperando.
              output_config: { effort: "low" },
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
          mensajes.push({
            role: "user",
            content: await Promise.all(
              llamadas.map(async (l) => ({
                type: "tool_result" as const,
                tool_use_id: l.id,
                content: await ejecutar(l, estado),
              }))
            ),
          })
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
