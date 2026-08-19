import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import type { Opcion } from "@/lib/calendario-context"
import { normalizarVariables } from "@/lib/feed-variables"
import { placaDeVariables } from "@/lib/placa/de-variables"
import { promptDeFondo } from "@/lib/placa/fondos"
import { generarFondo, hayMotor } from "@/lib/placa/fondo-server"
import { renderizarPlaca } from "@/lib/placa/placa-tipografica"
import { templateFeedPorId } from "@/lib/templates-feed"

/**
 * Una pieza del feed por el sistema nuevo: el modelo hace el fondo, el código
 * pone el texto y el logo.
 *
 * Recibe las variables ya derivadas por `slot/prompt-feed` en vez de derivarlas
 * de nuevo: esa traducción cuesta una llamada a un modelo de texto y el panel ya
 * la hizo para mostrar el prompt. Pedirla dos veces sería pagar dos veces por la
 * misma respuesta y, peor, arriesgar que salgan distintas.
 *
 * `maxDuration` es la misma que la ruta de imagen: lo que tarda es la generación
 * del fondo. La composición del texto son ~150 ms.
 */
export const maxDuration = 60

export async function POST(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  if (!hayMotor()) {
    return NextResponse.json(
      { error: "Falta OPENROUTER_API_KEY o GEMINI_API_KEY" },
      { status: 500 }
    )
  }

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

  const template = templateFeedPorId(
    typeof raw.templateFeedId === "string" ? raw.templateFeedId : null
  )
  if (!template) return NextResponse.json({ error: "Ese template no existe" }, { status: 400 })

  /*
   * La escena sale del posteo, no de una tabla.
   *
   * Se lee de la base y no del body por lo mismo de siempre: el cliente ya manda
   * las variables del texto, pero el brief de arte define qué foto se paga, y eso
   * se toma de lo que el plan guardó. Un cliente que mande otra escena estaría
   * generando una pieza que no es la que el plan aprobó.
   */
  const slotId = typeof raw.slotId === "string" ? raw.slotId : null
  let escena: string | null = null

  if (slotId) {
    const { data: slot } = await supabase
      .from("content_slots")
      .select("opciones, elegida")
      .eq("id", slotId)
      .maybeSingle()

    if (slot) {
      const opciones = (slot.opciones ?? []) as Opcion[]
      const opcion = opciones.find((o) => o.id === slot.elegida) ?? opciones[0] ?? null
      escena = opcion?.imagen?.trim() || null
    }
  }

  // `template.id` va como respaldo: los planes viejos no tienen brief de escena
  // guardado y siguen saliendo con la que les tocaba.
  const prompt = promptDeFondo(escena, template.familia, template.id)
  if (!prompt) {
    // Falla explícito y no con una escena genérica: una pieza sin brief de arte se
    // arregla escribiéndolo, y un fondo inventado se publica sin que nadie note
    // que el sistema no tenía nada para ese caso.
    return NextResponse.json(
      { error: "Esta pieza no tiene descripción de imagen. Regenerá la idea." },
      { status: 400 }
    )
  }

  const variables = normalizarVariables(raw.variables)
  if (variables.headline.length === 0) {
    return NextResponse.json({ error: "La pieza no tiene titular" }, { status: 400 })
  }

  const formato = raw.size === "portrait" ? "portrait" : "square"

  try {
    const fondo = await generarFondo(prompt, formato)
    const placa = placaDeVariables(variables, template, formato)
    const jpeg = await renderizarPlaca({ ...placa, fondo })

    // El mismo contrato que `api/contenido/image`, para que el cliente pueda
    // cambiar de camino sin ramificar el manejo de la respuesta.
    return NextResponse.json({
      image: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      modelo: "placa · fondo generado + texto compuesto",
      layout: placa.layout,
    })
  } catch (err) {
    console.error("[contenido/placa]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo componer la pieza" },
      { status: 500 }
    )
  }
}
