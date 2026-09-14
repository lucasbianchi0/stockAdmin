import type Anthropic from "@anthropic-ai/sdk"

import { supabase } from "@/lib/supabase"
import { LIMITES } from "@/lib/tickets"
import { COLUMNAS_TICKET, aTicket, ordenInicial } from "@/lib/tickets-server"
import { citar } from "@/lib/chatbot/sanear"
import type { AgenteId } from "@/lib/chatbot/agentes"

/**
 * ANOTAR EN LA TICKETERA — la única herramienta del asistente que escribe.
 *
 * Todas las demás leen: el panel, los PDF. Ésta deja algo hecho, y eso cambia
 * las reglas.
 *
 * POR QUE EXISTE
 *
 * Una auditoría del especialista termina con seis cosas para hacer, ordenadas y
 * con su justificación. Ese párrafo, hoy, se copia a mano al tablero o se
 * pierde: la conversación vive en `sessionStorage` y muere al cerrar la
 * pestaña. El trabajo de pensar qué hacer ya está pago; lo que se pierde es el
 * paso de anotarlo.
 *
 * TRES REGLAS QUE LA HACEN SEGURA
 *
 * 1. **Sólo si la persona lo pide.** Está escrito en la descripción que lee el
 *    modelo, que es donde de verdad se cumple. Un asistente que abre tickets
 *    porque le pareció buena idea es un asistente que se apaga a la semana.
 *
 * 2. **Nace sin asignar.** El agente no reparte trabajo entre personas: propone
 *    tareas. Quién la agarra se decide en el tablero, que es donde se ve la
 *    carga de cada uno. El ticket sí queda etiquetado con quien lo pidió —el
 *    autor es la persona que estaba hablando, no el modelo— para que dentro de
 *    dos semanas se sepa de dónde salió.
 *
 * 3. **Lista cerrada de proyectos.** El modelo elige uno de los que existen o
 *    ninguno; no puede crear proyectos. Si no, cada conversación inventaría su
 *    propia taxonomía.
 */

export type ProyectoTicket = { id: string; nombre: string }

/** Los proyectos existentes, para el enum de la herramienta. Si falla, la
 *  herramienta sigue sirviendo sin proyectos: un ticket suelto es mejor que
 *  ningún ticket. */
export async function proyectosDeTickets(): Promise<ProyectoTicket[]> {
  const { data, error } = await supabase
    .from("ticket_proyectos")
    .select("id, nombre")
    .order("nombre")
    .limit(50)

  if (error) {
    console.error("[chat tickets proyectos]", error)
    return []
  }
  return (data ?? []).map((p) => ({ id: String(p.id), nombre: String(p.nombre) }))
}

export function herramientaTicket(proyectos: ProyectoTicket[]): Anthropic.Beta.BetaTool {
  const nombres = proyectos.map((p) => p.nombre)

  return {
    name: "crear_ticket",
    description: [
      "Anota una tarea en la Ticketera del backoffice (/tickets), el tablero que mira todo el equipo.",
      "",
      "CUÁNDO USARLA: sólo cuando la persona te lo pide —«creá un ticket», «anotá esto», «pasalo al tablero»—.",
      "Nunca por tu cuenta, ni siquiera cuando la tarea sea obvia o urgente: proponerla en la respuesta",
      "y preguntar si la anotás es siempre lo correcto. Si te pide varias, llamá a la herramienta una vez",
      "por cada una, en el mismo turno.",
      "",
      "UN TICKET = UNA ACCIÓN CONCRETA que alguien puede empezar el lunes. «Mejorar el marketing» no es",
      "un ticket; «Cargar las negativas de las cinco líneas sin consulta» sí.",
      "",
      "LA DESCRIPCIÓN ES LO QUE QUEDA. La conversación se borra al cerrar la pestaña; el ticket no. Escribí",
      "ahí todo lo que haría falta para hacerlo sin volver a preguntarte: qué hay que hacer, por qué",
      "—con los números que lo justifican—, dónde se hace y cómo se sabe que terminó. Un ticket que dice",
      "«ver lo que hablamos» es un ticket muerto.",
      "",
      "QUEDA SIN ASIGNAR, en Backlog y a nombre de quien te está hablando. Vos no repartís trabajo: quién",
      "lo agarra se decide en el tablero, donde se ve la carga de cada uno.",
      nombres.length > 0
        ? `\nPROYECTO: opcional, y sólo uno de los que existen. Si ninguno encaja, no mandes el campo.`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    input_schema: {
      type: "object",
      properties: {
        titulo: {
          type: "string",
          description:
            "Qué hay que hacer, empezando por un verbo y en una línea. Máximo 120 caracteres. Ej.: «Cargar negativas y concordancia exacta en las cinco líneas sin consulta».",
        },
        descripcion: {
          type: "string",
          description:
            "El detalle completo: qué se espera, por qué (con los datos concretos), dónde se hace y cómo se sabe que terminó. Escribilo para alguien que no leyó esta conversación.",
        },
        ...(nombres.length > 0
          ? {
              proyecto: {
                type: "string",
                enum: nombres,
                description: "Opcional. Uno de los proyectos que ya existen, o nada.",
              },
            }
          : {}),
      },
      required: ["titulo", "descripcion"],
    },
  }
}

export type ContextoTicket = {
  /** Quién está hablando. El ticket queda a su nombre: el modelo no es autor de
   *  nada, es el que toma nota. */
  usuarioId: string
  usuarioNombre: string
  agenteId: AgenteId
  proyectos: ProyectoTicket[]
}

/**
 * Crea el ticket y devuelve la línea que lee el modelo.
 *
 * No tira nunca: un error se convierte en una frase que el asistente puede
 * contar. Que falle anotar no puede tumbar la respuesta que ya escribió.
 */
export async function crearTicketDesdeAgente(
  input: Record<string, unknown>,
  ctx: ContextoTicket
): Promise<string> {
  const titulo = texto(input.titulo, LIMITES.titulo)
  if (!titulo) return "No se creó: faltó el título. Escribí uno que empiece por un verbo y reintentá."

  const descripcion = texto(input.descripcion, LIMITES.descripcion)
  if (!descripcion) {
    return "No se creó: faltó la descripción. Acordate de que es lo único que queda cuando se cierra la conversación."
  }

  // El nombre del proyecto viene del enum, pero se vuelve a resolver contra la
  // base: el enum es una sugerencia del prompt, no una garantía.
  const pedido = typeof input.proyecto === "string" ? input.proyecto.trim().toLowerCase() : ""
  const proyecto = pedido
    ? (ctx.proyectos.find((p) => p.nombre.trim().toLowerCase() === pedido) ?? null)
    : null

  try {
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        titulo,
        descripcion,
        estado: "backlog",
        proyecto_id: proyecto?.id ?? null,
        autor_id: ctx.usuarioId,
        autor_nombre: ctx.usuarioNombre,
        // Sin asignar, a propósito — ver el comentario de arriba.
        asignado_id: null,
        asignado_nombre: null,
        origen_agente: ctx.agenteId,
        orden: await ordenInicial("backlog"),
      })
      .select(COLUMNAS_TICKET)
      .single()

    if (error || !data) throw error ?? new Error("sin fila")

    const creado = aTicket(data)
    return [
      `Ticket creado en la Ticketera: ${citar(creado.titulo, 120)}.`,
      `Está en Backlog, sin asignar${proyecto ? `, en el proyecto ${citar(proyecto.nombre, 40)}` : ""}, a nombre de ${ctx.usuarioNombre}.`,
      "Avisale en una línea y decile que lo reparta desde /tickets. No repitas la descripción entera: ya está guardada.",
    ].join(" ")
  } catch (e) {
    console.error("[chat crear_ticket]", e)
    return "No se pudo guardar el ticket. Decíselo y ofrecele el texto para que lo pegue él en /tickets."
  }
}

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}
