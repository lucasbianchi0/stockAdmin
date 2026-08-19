/**
 * La generación del fondo. Es lo único que sigue viajando a un modelo.
 *
 * Vive aparte de `api/contenido/image` porque pide otra cosa: aquella ruta pide
 * la pieza terminada —foto, titular, grilla y logo en una sola pasada— y esta
 * pide solamente la imagen. Son dos contratos distintos con el mismo proveedor,
 * y mezclarlos en una función con banderas terminaría con un prompt que a veces
 * lleva texto y a veces no.
 *
 * El motor es el mismo que usa el lote del calendario: OpenRouter con
 * gpt-image-2 si hay clave, y Gemini directo si no. Sin respaldo silencioso entre
 * uno y otro, por la misma razón de siempre: un fallback que se traga un 402 deja
 * "salió la pieza" donde hubo crédito agotado.
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"

/**
 * La placa de referencia de la marca: las quince piezas terminadas.
 *
 * Es la que fija cuánto es "casi negro" y cómo se ve una foto hundida en sombra;
 * el texto solo no alcanza para transmitirlo. Acá se le pide explícitamente que
 * IGNORE el texto y los logos que se ven en ella, porque lo que estamos pidiendo
 * es la etapa anterior a que se compongan.
 */
const REFERENCIA = "public/brand/referencia-feed-board.png"

const COPIA_LA_MARCA = `The attached image is Accedra's own feed board: the finished pieces of the visual system you are working in. Copy from it the level of darkness, the cold navy grade, the photographic treatment, and the way the image is drowned in shadow on the side where type goes.

IGNORE every word and every logo in it. You are producing the BACKGROUND PLATE only — the stage before any type or logo is composited on top.

`

const OPENROUTER_URL = "https://openrouter.ai/api/v1/images"
const OPENROUTER_MODEL = process.env.OPENROUTER_IMAGE_MODEL || "openai/gpt-image-2"
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image"

export type Proporcion = "square" | "portrait"

const ASPECTO: Record<Proporcion, string> = { square: "1:1", portrait: "4:5" }

async function referencia(): Promise<string | null> {
  try {
    return (await readFile(join(process.cwd(), REFERENCIA))).toString("base64")
  } catch (err) {
    // Falla abierto: sin la referencia el fondo sale peor, pero sale.
    console.error("[placa/fondo referencia]", err)
    return null
  }
}

/** ¿Hay con qué generar? Lo pregunta la ruta antes de hacer nada. */
export function hayMotor(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY)
}

export async function generarFondo(prompt: string, proporcion: Proporcion): Promise<string> {
  const marca = await referencia()
  const texto = marca ? COPIA_LA_MARCA + prompt : prompt

  return process.env.OPENROUTER_API_KEY
    ? await porOpenRouter(texto, proporcion, marca)
    : await porGemini(texto, proporcion, marca)
}

async function porOpenRouter(
  prompt: string,
  proporcion: Proporcion,
  marca: string | null
): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      prompt,
      aspect_ratio: proporcion === "portrait" ? "3:4" : ASPECTO[proporcion],
      n: 1,
      ...(marca
        ? {
            input_references: [
              { type: "image_url", image_url: { url: `data:image/png;base64,${marca}` } },
            ],
          }
        : {}),
    }),
  })

  if (!res.ok) {
    // El cuerpo entero en el mensaje: el fallo más probable es el 402 por crédito
    // agotado, y eso se resuelve solo si se lee.
    throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  const cuerpo = (await res.json()) as { data?: { b64_json?: string; media_type?: string }[] }
  const img = cuerpo.data?.[0]
  if (!img?.b64_json) throw new Error("OpenRouter devolvió 200 sin imagen")

  return `data:${img.media_type ?? "image/jpeg"};base64,${img.b64_json}`
}

type BloqueGemini = { type?: string; data?: string; mime_type?: string }

async function porGemini(
  prompt: string,
  proporcion: Proporcion,
  marca: string | null
): Promise<string> {
  const input: unknown[] = marca
    ? [{ type: "image", mime_type: "image/png", data: marca }, { type: "text", text: prompt }]
    : [{ type: "text", text: prompt }]

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input,
      response_format: {
        type: "image",
        mime_type: "image/jpeg",
        aspect_ratio: ASPECTO[proporcion],
        image_size: "2K",
      },
    }),
  })

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)

  const data = (await res.json()) as {
    output_image?: { data?: string; mime_type?: string }
    steps?: { content?: BloqueGemini[]; model_output?: BloqueGemini[] }[]
  }

  if (data.output_image?.data) {
    return `data:${data.output_image.mime_type ?? "image/jpeg"};base64,${data.output_image.data}`
  }
  for (const paso of data.steps ?? []) {
    for (const bloque of [...(paso.content ?? []), ...(paso.model_output ?? [])]) {
      if (bloque.type === "image" && bloque.data) {
        return `data:${bloque.mime_type ?? "image/jpeg"};base64,${bloque.data}`
      }
    }
  }

  throw new Error("Gemini devolvió 200 sin imagen")
}
