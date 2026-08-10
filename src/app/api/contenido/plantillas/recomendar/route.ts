import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Qué plantilla le va mejor a esta pieza.
 *
 * Es una llamada de texto corta y barata: solo compara la descripción de la
 * pieza contra el "cuándo usar" de cada plantilla. No mira las imágenes —no
 * hace falta y multiplicaría el costo por cada generación.
 *
 * Falla hacia adelante: si el modelo no responde o responde cualquier cosa,
 * devuelve la primera activa. Quedarse sin plantilla por un timeout sería peor
 * que elegir una que quizás no es la óptima.
 */
export async function POST(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>
  const pieza = typeof raw.pieza === "string" ? raw.pieza.slice(0, 1500) : ""

  const { data } = await supabase
    .from("plantillas")
    .select("id, nombre, cuando_usar")
    .eq("activa", true)
    .order("orden")

  const plantillas = data ?? []
  if (plantillas.length === 0) return NextResponse.json({ plantillaId: null, porQue: null })
  if (plantillas.length === 1) {
    return NextResponse.json({
      plantillaId: plantillas[0].id,
      porQue: "Es la única plantilla activa.",
    })
  }

  const porDefecto = {
    plantillaId: plantillas[0].id,
    porQue: "Elegida por orden: no se pudo evaluar el encaje.",
  }

  if (!pieza) return NextResponse.json(porDefecto)

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Sos director de arte. Elegí cuál de estas plantillas visuales le va mejor a la pieza que se va a producir.

PLANTILLAS
${plantillas
  .map((p, i) => `${i + 1}. [${p.id}] ${p.nombre}${p.cuando_usar ? ` — se usa cuando: ${p.cuando_usar}` : ""}`)
  .join("\n")}

LA PIEZA
"""
${pieza}
"""

Devolvé SOLO un JSON, sin markdown:
{"plantillaId": "el id exacto entre corchetes", "porQue": "por qué esa y no las otras, 1 frase corta"}`,
        },
      ],
    })

    const texto = msg.content[0].type === "text" ? msg.content[0].text : ""
    const json = texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1)
    const elegida = JSON.parse(json) as { plantillaId?: unknown; porQue?: unknown }

    // El id tiene que existir de verdad: un modelo puede devolver uno inventado
    // y eso mandaría a generar sin referencia, en silencio.
    const valido = plantillas.some((p) => p.id === elegida.plantillaId)
    if (!valido) return NextResponse.json(porDefecto)

    return NextResponse.json({
      plantillaId: elegida.plantillaId,
      porQue: typeof elegida.porQue === "string" ? elegida.porQue.slice(0, 200) : null,
    })
  } catch (err) {
    console.warn("[plantillas recomendar]", err)
    return NextResponse.json(porDefecto)
  }
}
