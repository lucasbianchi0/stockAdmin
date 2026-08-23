import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import type { Opcion } from "@/lib/calendario-context"
import { normalizarVariables } from "@/lib/feed-variables"
import { placaDeVariables } from "@/lib/placa/de-variables"
import { revisarPlaca } from "@/lib/placa/invariantes"
import { promptDeFondo } from "@/lib/placa/fondos"
import { generarFondo, hayMotor } from "@/lib/placa/fondo-server"
import { renderizarPlaca } from "@/lib/placa/placa-tipografica"
import { esTema, type Tema } from "@/lib/placa/sistema"
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
  let temaGuardado: Tema | null = null

  if (slotId) {
    const { data: slot } = await supabase
      .from("content_slots")
      .select("opciones, elegida, tema")
      .eq("id", slotId)
      .maybeSingle()

    if (slot) {
      const opciones = (slot.opciones ?? []) as Opcion[]
      const opcion = opciones.find((o) => o.id === slot.elegida) ?? opciones[0] ?? null
      escena = opcion?.imagen?.trim() || null
      if (esTema(slot.tema)) temaGuardado = slot.tema
    }
  }

  /*
   * El tema sale de la PIEZA, no del cliente.
   *
   * Es el mismo criterio que la escena: el cliente puede pedir la composición,
   * pero lo que decide con qué reglas se escribió el copy está guardado. Si el
   * cliente mandara otro tema, estaría componiendo un titular pensado para dos
   * líneas cortas dentro de una columna angosta, o al revés.
   *
   * El body queda como respaldo para la pieza que todavía no se guardó y para
   * las pruebas.
   */
  const tema: Tema = temaGuardado ?? (esTema(raw.tema) ? raw.tema : "oscuro")

  // `template.id` va como respaldo: los planes viejos no tienen brief de escena
  // guardado y siguen saliendo con la que les tocaba.
  const prompt = promptDeFondo(escena, template.familia, template.id, undefined, tema)
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
    const placa = placaDeVariables(variables, template, formato, undefined, tema)

    /*
     * La revisión va ANTES de rasterizar y viaja con la respuesta.
     *
     * No frena la generación: una pieza con una falla se publica igual, porque
     * no tenerla es peor. Lo que cambia es que ahora se sabe. Antes el único
     * rastro de una pieza fuera de sistema era un `console.warn` en el servidor,
     * y por eso el titular cortado llegó hasta el feed sin que nadie lo viera
     * hasta tener la imagen delante.
     */
    const fallas = revisarPlaca(placa)
    if (fallas.length > 0) {
      console.warn(`[contenido/placa] ${template.id}: ${fallas.map((f) => f.detalle).join(" ")}`)
    }

    const jpeg = await renderizarPlaca({ ...placa, fondo })

    // El mismo contrato que `api/contenido/image`, para que el cliente pueda
    // cambiar de camino sin ramificar el manejo de la respuesta.
    return NextResponse.json({
      image: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      modelo: "placa · fondo generado + texto compuesto",
      layout: placa.layout,
      fallas,
    })
  } catch (err) {
    console.error("[contenido/placa]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo componer la pieza" },
      { status: 500 }
    )
  }
}
