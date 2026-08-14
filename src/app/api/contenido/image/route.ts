import { exigirModulo } from "@/lib/guard-api"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { NextResponse } from "next/server"
import { IMAGE_STYLE_SUFFIX } from "@/lib/contenido-context"
import { supabase } from "@/lib/supabase"
import { BUCKET_PLANTILLAS } from "@/lib/plantillas"
import { promptDeTemplate, templatePorId, type TemplatePieza } from "@/lib/templates-pieza"
import { conLogo, vinoEnmarcada } from "@/lib/logo-pieza"

// El bloque de estilo sale del Brand Kit (ver IMAGE_STYLE_SUFFIX): antes vivía
// acá escrito a mano y por eso seguía pidiendo el azul viejo #2B6AC8.
const STYLE_SUFFIX = IMAGE_STYLE_SUFFIX

type SizeKind = "square" | "portrait" | "landscape"


// ─── Gemini ─────────────────────────────────────────────────────────────────
// Con GEMINI_API_KEY cargada, Gemini genera y OpenAI queda de red: si Google
// falla —cuota, corte, respuesta sin imagen— la pieza igual sale. Un generador
// caído no debería frenar a alguien que está armando el calendario del mes.

/**
 * Pro y no Flash.
 *
 * Flash es el tier de volumen: rápido, barato y suficiente para una escena. Pero
 * una pieza de feed no es una escena — es un titular en tipografía, un bloque de
 * etiquetas, una banda y un pie, todo alineado a una grilla. Google separa los
 * dos casos explícitamente: Pro es el "professional design engine con reasoning
 * core para layouts complejos y renderizado preciso de texto", y es justo lo que
 * acá se rompía. Con Flash el titular salía con una letra de más y las etiquetas
 * pisadas.
 *
 * Cuesta bastante más por imagen. Si hace falta volver atrás para una tanda de
 * pruebas, la variable de entorno lo baja sin tocar el código.
 */
const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image"
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"

/**
 * 2K y no 1K.
 *
 * A 1K un titular de tres líneas entra con el cuerpo justo y el modelo lo
 * resuelve engordando la letra hasta que pierde el tracking. 2K le da lugar.
 *
 * 4K no: la imagen viaja como base64 dentro del JSON y se guarda por la ruta de
 * `slot/imagen`, que corta en 8 MB. Una pieza en 4K queda al filo de ese tope
 * para mostrarse igual reescalada a 1080 en el feed.
 */
const GEMINI_RESOLUCION = "2K"

/**
 * Sin esto la ruta se muere en producción y anda perfecto en local.
 *
 * El default de Vercel para una función sin `maxDuration` son 10 segundos, y una
 * pieza con Pro a 2K tarda entre 28 y 37 medidos. O sea: todas las imágenes
 * fallarían por timeout apenas se despliegue, sin ningún síntoma en desarrollo.
 *
 * 60 es el techo del plan hobby. Deja poco margen —una generación lenta lo roza—
 * así que si empiezan a aparecer timeouts, el arreglo no es subir esto sino
 * bajar la resolución a 1K o pasar el plan a Pro y poner 300.
 */
export const maxDuration = 60

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

/**
 * La referencia de marca del camino 2. Es de Accedra, no de otra marca.
 *
 * Es la diferencia más grande medida hasta ahora en este sistema: las mismas dos
 * piezas generadas sin referencia salen con un logo inventado, la foto gris y
 * una costura visible entre la foto y el texto; con la referencia adelante salen
 * con el isotipo correcto, la foto hundida en negro y sin corte. El texto solo
 * no alcanza para transmitir cuánto negro es "casi negro".
 *
 * Vive como archivo en el repo y no en la base a propósito: no es una plantilla
 * que el usuario elige por pieza, es LA definición visual del sistema. Cambiar
 * este archivo cambia las quince piezas.
 */
const REFERENCIA_MARCA = "public/brand/referencia-feed.png"

async function referenciaDeMarca() {
  try {
    const bytes = await readFile(join(process.cwd(), REFERENCIA_MARCA))
    return { type: "image", mime_type: "image/png", data: bytes.toString("base64") }
  } catch (err) {
    // Falla abierto: sin la referencia la pieza sale peor, pero sale. Se
    // registra porque "salió con otro logo" no se diagnostica de otra forma.
    console.error("[contenido/image referencia]", err)
    return null
  }
}

/**
 * Qué se copia de la referencia cuando la referencia ES de la marca.
 *
 * Es lo contrario del bloque que acompaña a las plantillas, que son piezas
 * AJENAS subidas por su composición y de las que hay que ignorar el color y los
 * signos de identidad. Acá la identidad es justamente lo que se viene a buscar.
 */
const COPIA_LA_MARCA = `The attached image is Accedra's own Instagram feed board: finished posts from the visual system you are working in. This is the brand you work for — not a foreign reference.

COPY from it, exactly:
- The overall level of darkness. These pieces are almost entirely black; match that, and never lighten anything to make it "readable".
- The photographic and graphic treatment: photographs drowned in shadow, cold and blue; graphics as thin luminous line-work on black, never solid or illustrative.
- The typography, and look closely at its WEIGHT: the headlines in the reference are thin — regular or light, not bold. Match that thinness exactly; a bolder headline is the single most common way to get this system wrong.
- How much of each piece is empty flat black, and how small the text block is inside it.
- The small uppercase blue eyebrow label, the icon style and the spacing of any list or pill.

IGNORE from it:
- The board layout itself, the grid of several posts, and the Instagram format badges in the corners. You are producing ONE single square piece, full bleed, with no badge.
- Every headline and photograph in it — those come from the brief below.
- The Accedra logo in the bottom-left of every piece. That logo is composited afterwards from the official file; you must NOT draw it, and you must leave that corner clear as the brief describes.

The new piece:

`

async function generarConGemini(
  prompt: string,
  sizeKind: SizeKind,
  plantillaId?: string,
  conMarca = false
): Promise<string> {
  // El camino 2 lleva la referencia de marca; el camino de siempre, la plantilla
  // que se haya elegido. Nunca las dos: son dos instrucciones opuestas sobre qué
  // hacer con la identidad de la imagen que se manda adelante.
  if (conMarca) {
    const marca = await referenciaDeMarca()
    if (marca) return await pedirImagen([marca, { type: "text", text: COPIA_LA_MARCA + prompt }], sizeKind)
    return await pedirImagen([{ type: "text", text: prompt }], sizeKind)
  }

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

  return await pedirImagen(input, sizeKind)
}

/** El pedido a Gemini y la lectura de la respuesta, ya armado el input. */
async function pedirImagen(input: unknown[], sizeKind: SizeKind): Promise<string> {
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
        image_size: GEMINI_RESOLUCION,
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

/**
 * Le pega el logotipo oficial a la pieza que devolvió el generador.
 *
 * Solo el camino 2: el sistema viejo pide el logo dentro del prompt y componerle
 * otro encima lo duplicaría.
 */
async function componerLogo(dataUrl: string): Promise<string> {
  const coincide = dataUrl.match(/^data:image\/\w+;base64,(.+)$/)
  if (!coincide) return dataUrl

  const conMarca = await conLogo(Buffer.from(coincide[1], "base64"))
  return `data:image/jpeg;base64,${conMarca.toString("base64")}`
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

  /**
   * Camino 2 — "Feed 1080": el prompt llega entero y no se le toca nada.
   *
   * Los quince templates de `templates-feed.ts` ya traen adentro su paleta, su
   * tipografía y sus prohibiciones. Pegarles atrás el bloque de estilo del Brand
   * Kit sería mandarle al generador dos sistemas de identidad en el mismo
   * pedido, y de ahí no sale ninguno de los dos. Por lo mismo se ignora la
   * plantilla de referencia: es una imagen de OTRA marca puesta como molde, y
   * acá el molde ya lo pone el template.
   */
  const crudo = raw.sistema === "feed"

  // El tope sube en crudo porque un template del feed ya son ~2.000 caracteres
  // antes de las variables; 3.500 le cortaba la cola justo donde van las
  // prohibiciones.
  const concept = typeof raw.prompt === "string" ? raw.prompt.trim().slice(0, crudo ? 8000 : 3500) : ""
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

  const finalPrompt = crudo
    ? concept
    : receta
      ? promptDeTemplate({ template: receta, titular: titular || concept, sujeto, etiqueta })
      : `${concept}${seriesNote}${STYLE_SUFFIX}`

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Falta GEMINI_API_KEY" }, { status: 500 })
  }

  try {
    let generada = await generarConGemini(
      finalPrompt,
      sizeKind,
      crudo ? undefined : plantillaId,
      crudo
    )

    // Un reintento y uno solo si la pieza vino enmarcada como mockup. Es un
    // fallo intermitente que no cede por prompt —le pegamos tres veces— y que
    // arruina la pieza entera, porque el logo compuesto cae fuera del arte.
    // Reintentar sale ~0,18 USD; publicar una pieza así sale bastante más caro.
    if (crudo) {
      const bytes = Buffer.from(generada.split(",")[1] ?? "", "base64")
      if (await vinoEnmarcada(bytes)) {
        console.warn("[contenido/image] pieza enmarcada, regenerando")
        generada = await generarConGemini(finalPrompt, sizeKind, undefined, true)
      }
    }

    const image = crudo ? await componerLogo(generada) : generada
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
