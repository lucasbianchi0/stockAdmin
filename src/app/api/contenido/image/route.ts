import { exigirModulo } from "@/lib/guard-api"
import { NextResponse } from "next/server"
import { IMAGE_STYLE_SUFFIX } from "@/lib/contenido-context"
import { supabase } from "@/lib/supabase"
import { BUCKET_PLANTILLAS } from "@/lib/plantillas"
import { promptDeTemplate, templatePorId, type TemplatePieza } from "@/lib/templates-pieza"

// El bloque de estilo sale del Brand Kit (ver IMAGE_STYLE_SUFFIX): antes vivía
// acá escrito a mano y por eso seguía pidiendo el azul viejo #2B6AC8.
const STYLE_SUFFIX = IMAGE_STYLE_SUFFIX

type SizeKind = "square" | "portrait" | "landscape"


// ─── Gemini ─────────────────────────────────────────────────────────────────
// Con GEMINI_API_KEY cargada, Gemini genera y OpenAI queda de red: si Google
// falla —cuota, corte, respuesta sin imagen— la pieza igual sale. Un generador
// caído no debería frenar a alguien que está armando el calendario del mes.

const GEMINI_MODEL = "gemini-3.1-flash-image"
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"

/** Relación de aspecto por tipo de pieza. 4:5 es el vertical de feed, no 9:16. */
const GEMINI_ASPECTO: Record<SizeKind, string> = {
  square: "1:1",
  portrait: "4:5",
  landscape: "16:9",
}

type BloqueGemini = { type?: string; data?: string; mime_type?: string; text?: string }

type RespuestaGemini = {
  output_image?: { data?: string; mime_type?: string }
  steps?: Array<{ type?: string; content?: BloqueGemini[]; model_output?: BloqueGemini[] }>
}

/**
 * Dónde viene la imagen.
 *
 * Verificado contra la API el 8/8/2026: la respuesta trae `steps`, el primero de
 * tipo "thought" y el último de tipo "model_output" con la imagen en `content[]`.
 * La documentación describe `output_image` y `model_output[]`, que en la práctica
 * no aparecen — se contemplan igual porque una respuesta válida leída como fallo
 * manda la generación a OpenAI sin motivo.
 */
function extraerImagen(data: RespuestaGemini): { b64: string; mime: string } | null {
  if (data.output_image?.data) {
    return { b64: data.output_image.data, mime: data.output_image.mime_type ?? "image/jpeg" }
  }
  for (const paso of data.steps ?? []) {
    for (const bloque of [...(paso.content ?? []), ...(paso.model_output ?? [])]) {
      if (bloque.type === "image" && bloque.data) {
        return { b64: bloque.data, mime: bloque.mime_type ?? "image/jpeg" }
      }
    }
  }
  return null
}

/**
 * La plantilla, si hay: baja el archivo y lo devuelve como bloque de entrada.
 *
 * Verificado contra la API: con una imagen de referencia adelante del texto, el
 * modelo copia fondo, luz y acento sin que se los nombre. Es la diferencia más
 * grande entre quince piezas sueltas y quince piezas de la misma marca.
 */
async function bloqueDePlantilla(plantillaId: string) {
  const { data: fila } = await supabase
    .from("plantillas")
    .select("storage_path, mime_type")
    .eq("id", plantillaId)
    .eq("activa", true)
    .maybeSingle()

  if (!fila?.storage_path) return null

  const { data: archivo } = await supabase.storage
    .from(BUCKET_PLANTILLAS)
    .download(String(fila.storage_path))

  if (!archivo) return null

  return {
    type: "image",
    mime_type: String(fila.mime_type ?? "image/jpeg"),
    data: Buffer.from(await archivo.arrayBuffer()).toString("base64"),
  }
}

async function generarConGemini(
  prompt: string,
  sizeKind: SizeKind,
  plantillaId?: string
): Promise<string> {
  const referencia = plantillaId ? await bloqueDePlantilla(plantillaId) : null

  // La referencia va PRIMERO. Con el texto adelante el modelo la trata como
  // algo a describir; adelante, como el molde a seguir.
  //
  // Y la instrucción separa explícitamente qué se copia de qué se descarta: las
  // referencias son piezas de OTRAS marcas, subidas por su composición. Sin esta
  // separación el modelo copia también el color y los signos de identidad, y la
  // pieza sale con el verde de una y el rojo de la otra — que es exactamente lo
  // que no puede pasar.
  const input = referencia
    ? [
        referencia,
        {
          type: "text",
          text: `La imagen de referencia es un MOLDE DE COMPOSICIÓN de otra marca. No es la marca para la que trabajás.

COPIÁ de la referencia, y solo esto:
- La estructura: dónde va el sujeto, cuánto espacio vacío queda y dónde.
- El encuadre, la proporción y la jerarquía visual.
- El tratamiento fotográfico: tipo de luz, contraste, nivel de minimalismo.
- El grado de sobriedad y de "aire".

IGNORÁ por completo de la referencia:
- Su paleta. Los colores de la pieza nueva son ÚNICAMENTE los de la marca descrita abajo.
- Sus logos, wordmarks, mascotas, sellos, badges, hashtags y dominios.
- Sus textos y su contenido.
- Cualquier elemento que identifique a esa marca.

La pieza nueva es de Accedra y solo puede tener el lenguaje visual de Accedra:

${prompt}`,
        },
      ]
    : [{ type: "text", text: prompt }]

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY!,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input,
      response_format: {
        type: "image",
        mime_type: "image/jpeg",
        aspect_ratio: GEMINI_ASPECTO[sizeKind],
        // 1K y no 2K: Instagram y LinkedIn muestran 1080 px de ancho, así que
        // 2K son 2,5 MB de base64 viajando en el JSON para terminar reescalados.
        image_size: "1K",
      },
    }),
  })

  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  const cuerpo = (await res.json()) as RespuestaGemini
  const imagen = extraerImagen(cuerpo)

  if (!imagen) {
    // Un 200 sin imagen casi siempre trae el motivo escrito: el modelo contestó
    // con texto, se quedó sin tokens de salida o rechazó el pedido. Tirar el
    // cuerpo dejaba "respondió sin imagen", que no se puede diagnosticar.
    const texto = (cuerpo.steps ?? [])
      .flatMap((p) => [...(p.content ?? []), ...(p.model_output ?? [])])
      .filter((b) => b.type === "text")
      .map((b) => (b as { text?: string }).text)
      .filter(Boolean)
      .join(" ")
      .slice(0, 400)

    const estado = (cuerpo as { status?: string }).status ?? "?"
    throw new Error(
      `Gemini devolvió 200 sin imagen (status ${estado})${texto ? `: ${texto}` : " y sin texto"}`
    )
  }
  return `data:${imagen.mime};base64,${imagen.b64}`
}

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

  const concept = typeof raw.prompt === "string" ? raw.prompt.trim().slice(0, 3500) : ""
  if (!concept) {
    return NextResponse.json({ error: "Prompt requerido" }, { status: 400 })
  }

  const sizeKind: SizeKind =
    raw.size === "portrait" || raw.size === "landscape" ? raw.size : "square"

  const plantillaId = typeof raw.plantillaId === "string" ? raw.plantillaId : undefined

  const template = templatePorId(typeof raw.templateId === "string" ? raw.templateId : null)
  const composicion = typeof raw.composicion === "string" ? raw.composicion.slice(0, 3000) : ""
  const titular = typeof raw.titular === "string" ? raw.titular.trim().slice(0, 200) : ""
  const sujeto = typeof raw.sujeto === "string" ? raw.sujeto.trim().slice(0, 400) : ""
  const etiqueta = typeof raw.etiqueta === "string" ? raw.etiqueta.trim().slice(0, 30) : ""

  // Carousel continuity note (keeps the slides looking like one set).
  let seriesNote = ""
  if (raw.carousel && typeof raw.carousel === "object" && !Array.isArray(raw.carousel)) {
    const c = raw.carousel as Record<string, unknown>
    const index = typeof c.index === "number" ? c.index : null
    const total = typeof c.total === "number" ? c.total : null
    if (index && total) {
      seriesNote = `\n\nEsta es la slide ${index} de ${total} de un carrusel cohesivo: mantené EXACTAMENTE el mismo layout, fondo y sistema de estilo que el resto de las slides, variando solo el concepto de esta.`
    }
  }

  // Con template, la receta manda y el bloque de estilo genérico sobra: repetir
  // paleta y prohibiciones dos veces solo diluye la instrucción.
  const receta: TemplatePieza | null = composicion
    ? {
        id: "adhoc",
        nombre: "Prueba",
        cuandoUsar: "",
        // La densidad la lee el algoritmo de secuencia para armar la grilla, y
        // una receta suelta escrita a mano no entra en ninguna: "mixta" es la
        // que no impone restricciones. `promptDeTemplate` no la mira.
        densidad: "mixta",
        llevaFoto: true,
        composicion,
      }
    : template

  const finalPrompt = receta
    ? promptDeTemplate({ template: receta, titular: titular || concept, sujeto, etiqueta })
    : `${concept}${seriesNote}${STYLE_SUFFIX}`

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Falta GEMINI_API_KEY" }, { status: 500 })
  }

  try {
    const image = await generarConGemini(finalPrompt, sizeKind, plantillaId)
    return NextResponse.json({ image, model: GEMINI_MODEL, prompt: finalPrompt })
  } catch (err) {
    // Sin respaldo a propósito: Claude analiza, Gemini genera y nadie más. Un
    // fallback a otro proveedor enmascaraba el error real —el 429 de una cuenta
    // que ni siquiera usamos tapaba el motivo por el que Gemini no devolvió
    // imagen— y hacía imposible diagnosticar nada.
    console.error("[contenido/image]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo generar la imagen" },
      { status: 502 }
    )
  }

}
