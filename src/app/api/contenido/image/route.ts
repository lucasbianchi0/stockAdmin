import { exigirModulo } from "@/lib/guard-api"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { NextResponse } from "next/server"
import sharp from "sharp"
import { IMAGE_STYLE_SUFFIX } from "@/lib/contenido-context"
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
- The dark, cold, restrained MOOD, and the fact that the text column is deep black.
  But read that mood correctly: the darkness belongs to the BACKGROUND and to the column the type sits on, NOT to the photograph. The photograph itself is a real, properly lit scene — you can see the equipment, the cables, the surfaces, the depth. A murky brown-black smear where the image should be is the single worst outcome for this piece and is worse than a photograph that came out slightly too bright.
- The photographic and graphic treatment: photographs drowned in shadow, cold and blue; graphics as thin luminous line-work on black, never solid or illustrative.
- The typeface itself: the same neo-grotesque, the same tight tracking, the same sentence case, the same white on black.
- How much of each piece is empty flat black, and how small the text block is inside it.
- The small uppercase blue eyebrow label, the icon style and the spacing of any list or pill.

IGNORE from it:
- The WEIGHT of the headlines. The reference board is from an earlier stage of the system, when headlines were set thin. They are not any more: the brief below sets the headline in BOLD, and the brief wins over the reference on this one point. Copy the face, not its lightness.
- The board layout itself, the grid of several posts, and the Instagram format badges in the corners. You are producing ONE single square piece, full bleed, with no badge.
- Every headline and photograph in it — those come from the brief below.
- The Accedra logo in the bottom-left of every piece. That logo is composited afterwards from the official file; you must NOT draw it, and you must leave that corner clear as the brief describes.

The new piece:

`

// ─── OpenRouter ─────────────────────────────────────────────────────────────
// Con OPENROUTER_API_KEY cargada, el camino 2 genera por acá.
//
// Es el MISMO modelo que el camino directo —Gemini 3 Pro Image, que OpenRouter
// publica como "Nano Banana Pro"— así que la pieza no cambia. Lo que cambia es
// de qué cuenta sale la cuota y por dónde se factura.
//
// Y NO hay respaldo a Gemini si OpenRouter falla, por la misma razón que este
// archivo nunca tuvo respaldo a OpenAI (ver el catch del final): un fallback
// silencioso deja "salió la pieza" cuando lo que hubo fue un 402 de crédito
// agotado, y el error real no aparece hasta que alguien mira la factura.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/images"

/**
 * El endpoint de imágenes de OpenRouter es propio, no el de chat: recibe
 * `prompt` suelto y devuelve el base64 en `data[0].b64_json`.
 *
 * Verificado contra la API el 14/8/2026: este modelo acepta `resolution`
 * (1K/2K/4K), `aspect_ratio` (1:1, 4:5 y 16:9 entre otros) e `input_references`
 * hasta 14 imágenes. O sea, las tres cosas que el camino 2 necesita —2K, el
 * cuadrado del feed y la placa de referencia de marca— sin perder nada respecto
 * de pegarle directo a Google.
 */
const OPENROUTER_MODEL = process.env.OPENROUTER_IMAGE_MODEL || "openai/gpt-image-2"

type RespuestaOpenRouter = {
  data?: Array<{ b64_json?: string; media_type?: string }>
}

/**
 * El tamaño se pide distinto según de quién sea el modelo, y mandar el parámetro
 * que no corresponde es un 400.
 *
 * Verificado contra el catálogo de OpenRouter el 14/8/2026:
 *
 * - `google/gemini-*-image` toma `resolution` ("1K"/"2K"/"4K") y acepta 4:5.
 * - `openai/gpt-image-2` NO tiene `resolution` —usa `quality`— y su lista de
 *   aspectos **no incluye 4:5**. El vertical más cercano que sí acepta es 3:4,
 *   y como `conLogo` lleva la pieza a 1080×1350 igual, la diferencia se pierde
 *   en el recorte final.
 *
 * `quality` se deja en el default a propósito: medido el 14/8/2026, "high"
 * multiplica el costo por diez (US$ 0,023 → US$ 0,228) y quintuplica el tiempo,
 * sin mejorar la composición ni el texto en las pruebas que hicimos.
 */
function paramsDeTamano(modelo: string, sizeKind: SizeKind): Record<string, string> {
  if (modelo.startsWith("openai/")) {
    return {
      aspect_ratio: sizeKind === "portrait" ? "3:4" : GEMINI_ASPECTO[sizeKind],
    }
  }
  return {
    aspect_ratio: GEMINI_ASPECTO[sizeKind],
    resolution: GEMINI_RESOLUCION,
  }
}

async function generarConOpenRouter(
  prompt: string,
  sizeKind: SizeKind,
  modelo: string = OPENROUTER_MODEL
): Promise<string> {
  const marca = await referenciaDeMarca()

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelo,
      // Sin la referencia la pieza sale peor pero sale, igual que en el camino
      // directo: el bloque COPIA_LA_MARCA solo tiene sentido si la imagen viaja.
      prompt: marca ? COPIA_LA_MARCA + prompt : prompt,
      ...paramsDeTamano(modelo, sizeKind),
      n: 1,
      ...(marca
        ? {
            input_references: [
              {
                type: "image_url",
                image_url: { url: `data:${marca.mime_type};base64,${marca.data}` },
              },
            ],
          }
        : {}),
    }),
  })

  if (!res.ok) {
    // El cuerpo va entero al mensaje a propósito. El fallo más probable acá es
    // el 402 por crédito agotado, y "OpenRouter 402: Insufficient credits" se
    // resuelve solo; "no se pudo generar la imagen" manda a alguien a revisar
    // el prompt durante media hora.
    throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  const cuerpo = (await res.json()) as RespuestaOpenRouter
  const imagen = cuerpo.data?.[0]
  if (!imagen?.b64_json) {
    throw new Error("OpenRouter devolvió 200 sin imagen")
  }

  return `data:${imagen.media_type ?? "image/jpeg"};base64,${imagen.b64_json}`
}

// Los dos motores que el usuario puede elegir para el camino 2. "chatgpt" es
// gpt-image-2 por OpenRouter; "gemini" es Gemini 3 Pro Image directo a Google.
// No se exportan: Next.js solo admite exports de route (GET/POST/maxDuration…).
type ModeloCamino2 = "gemini" | "chatgpt"
const MODELO_CHATGPT = "openai/gpt-image-2"

/**
 * Por dónde sale el camino 2.
 *
 * Con una elección explícita del usuario, manda esa: "chatgpt" pega a OpenRouter
 * con gpt-image-2, "gemini" va directo a Google. Sin elección —la generación en
 * lote del calendario, los planes viejos— se mantiene el auto de siempre:
 * OpenRouter si hay clave, directo a Google si no.
 */
function generarCamino2(
  prompt: string,
  sizeKind: SizeKind,
  modelo?: ModeloCamino2
): Promise<string> {
  if (modelo === "chatgpt") return generarConOpenRouter(prompt, sizeKind, MODELO_CHATGPT)
  if (modelo === "gemini") return generarConGemini(prompt, sizeKind, true)
  return process.env.OPENROUTER_API_KEY
    ? generarConOpenRouter(prompt, sizeKind)
    : generarConGemini(prompt, sizeKind, true)
}

async function generarConGemini(
  prompt: string,
  sizeKind: SizeKind,
  conMarca = false
): Promise<string> {
  // El camino 2 lleva adelante la referencia de marca de Accedra; el path del
  // Content Studio manda solo el texto. Ya no hay plantillas de otras marcas: ese
  // era el camino 1, que se retiró.
  if (conMarca) {
    const marca = await referenciaDeMarca()
    if (marca) return await pedirImagen([marca, { type: "text", text: COPIA_LA_MARCA + prompt }], sizeKind)
  }
  return await pedirImagen([{ type: "text", text: prompt }], sizeKind)
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
 * La medida con la que sale cada pieza, en píxeles. La última palabra.
 *
 * Gemini recibe una relación de aspecto y una resolución nominal ("2K"), pero
 * eso no es un contrato: devuelve alrededor de esa medida, y una pieza que hubo
 * que rescatar de un marco sale más chica todavía. Lo que se publica tiene que
 * entrar exacto en el feed, así que el tamaño lo fija el código al final.
 *
 * 1080 es la medida cuadrada del feed y sirve para los dos canales: Instagram la
 * usa nativa y LinkedIn la admite (`sistema-visual.ts` ya eligió cuadrado para
 * los dos por eso mismo). El vertical 4:5 es 1080×1350, el de Instagram.
 *
 * Todas las piezas BAJAN hasta acá —la sana desde ~2048, la rescatada desde
 * ~1670— y bajar no cuesta nitidez. Subir sí, y por eso ninguna medida de esta
 * tabla puede ser mayor que lo que devuelve el generador.
 */
const MEDIDA_FINAL: Record<SizeKind, { ancho: number; alto: number }> = {
  square: { ancho: 1080, alto: 1080 },
  portrait: { ancho: 1080, alto: 1350 },
  landscape: { ancho: 1920, alto: 1080 },
}

/**
 * Le pega el logotipo oficial a la pieza que devolvió el generador, ya en la
 * medida final.
 *
 * Solo el camino 2: el sistema viejo pide el logo dentro del prompt y componerle
 * otro encima lo duplicaría.
 */
async function componerLogo(dataUrl: string, sizeKind: SizeKind): Promise<string> {
  const coincide = dataUrl.match(/^data:image\/\w+;base64,(.+)$/)
  if (!coincide) return dataUrl

  const conMarca = await conLogo(Buffer.from(coincide[1], "base64"), MEDIDA_FINAL[sizeKind])
  return `data:image/jpeg;base64,${conMarca.toString("base64")}`
}

/**
 * La misma medida final, para el camino 1.
 *
 * Ese camino no lleva logo compuesto —lo pide dentro del prompt— así que no pasa
 * por `conLogo` y se quedaba con el tamaño crudo del generador. El tamaño de lo
 * que se publica no debería depender de por qué camino se generó.
 */
async function aMedida(dataUrl: string, sizeKind: SizeKind): Promise<string> {
  const coincide = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
  if (!coincide) return dataUrl

  const { ancho, alto } = MEDIDA_FINAL[sizeKind]
  try {
    const ajustada = await sharp(Buffer.from(coincide[2], "base64"))
      .resize({ width: ancho, height: alto, fit: "cover", position: "centre" })
      .jpeg({ quality: 92 })
      .toBuffer()
    return `data:image/jpeg;base64,${ajustada.toString("base64")}`
  } catch (err) {
    // Una pieza con la medida equivocada se arregla; una pieza perdida no.
    console.error("[contenido/image] no se pudo llevar a medida", err)
    return dataUrl
  }
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
   * Kit sería mandarle al generador dos sistemas de identidad en el mismo pedido,
   * y de ahí no sale ninguno de los dos.
   *
   * El otro path (crudo === false) es el del Content Studio del admin: manda un
   * concepto suelto y se le pega el bloque de estilo del Brand Kit.
   */
  const crudo = raw.sistema === "feed"

  // El tope sube en crudo porque un template del feed ya son ~2.000 caracteres
  // antes de las variables; 3.500 le cortaba la cola justo donde van las
  // prohibiciones.
  const concept = typeof raw.prompt === "string" ? raw.prompt.trim().slice(0, crudo ? 8000 : 3500) : ""
  if (!concept) {
    return NextResponse.json({ error: "Prompt requerido" }, { status: 400 })
  }

  // Camino 2: qué motor eligió el usuario. Solo aplica en crudo; el path del
  // Studio va siempre por Gemini directo. Sin elección, queda el auto por env.
  const modeloCamino2: ModeloCamino2 | undefined =
    crudo && (raw.modelo === "gemini" || raw.modelo === "chatgpt") ? raw.modelo : undefined

  const sizeKind: SizeKind =
    raw.size === "portrait" || raw.size === "landscape" ? raw.size : "square"

  // Nota de continuidad de carrusel (mantiene las slides como un solo set). La
  // usa el Content Studio; el feed genera piezas sueltas.
  let seriesNote = ""
  if (raw.carousel && typeof raw.carousel === "object" && !Array.isArray(raw.carousel)) {
    const c = raw.carousel as Record<string, unknown>
    const index = typeof c.index === "number" ? c.index : null
    const total = typeof c.total === "number" ? c.total : null
    if (index && total) {
      seriesNote = `\n\nEsta es la slide ${index} de ${total} de un carrusel cohesivo: mantené EXACTAMENTE el mismo layout, fondo y sistema de estilo que el resto de las slides, variando solo el concepto de esta.`
    }
  }

  // El feed manda el prompt entero; el Studio pega el bloque de estilo del Brand.
  const finalPrompt = crudo ? concept : `${concept}${seriesNote}${STYLE_SUFFIX}`

  // El guard depende del motor: ChatGPT necesita OpenRouter, Gemini la clave de
  // Google, el camino 2 en auto sale por cualquiera; el Studio, Gemini directo.
  const faltaClave =
    modeloCamino2 === "chatgpt"
      ? !process.env.OPENROUTER_API_KEY
      : modeloCamino2 === "gemini"
        ? !process.env.GEMINI_API_KEY
        : crudo
          ? !process.env.OPENROUTER_API_KEY && !process.env.GEMINI_API_KEY
          : !process.env.GEMINI_API_KEY
  if (faltaClave) {
    const falta =
      modeloCamino2 === "chatgpt"
        ? "OPENROUTER_API_KEY (necesaria para ChatGPT)"
        : modeloCamino2 === "gemini"
          ? "GEMINI_API_KEY (necesaria para Gemini)"
          : crudo
            ? "OPENROUTER_API_KEY o GEMINI_API_KEY"
            : "GEMINI_API_KEY"
    return NextResponse.json({ error: `Falta ${falta}` }, { status: 500 })
  }

  try {
    let generada = crudo
      ? await generarCamino2(finalPrompt, sizeKind, modeloCamino2)
      : await generarConGemini(finalPrompt, sizeKind, false)

    // Un reintento y uno solo si la pieza vino enmarcada como mockup. Es un
    // fallo intermitente que no cede por prompt —le pegamos tres veces— y que
    // arruina la pieza entera, porque el logo compuesto cae fuera del arte.
    // Reintentar sale ~0,18 USD; publicar una pieza así sale bastante más caro.
    if (crudo) {
      const bytes = Buffer.from(generada.split(",")[1] ?? "", "base64")
      if (await vinoEnmarcada(bytes)) {
        console.warn("[contenido/image] pieza enmarcada, regenerando")
        generada = await generarCamino2(finalPrompt, sizeKind, modeloCamino2)
      }
    }

    const image = crudo
      ? await componerLogo(generada, sizeKind)
      : await aMedida(generada, sizeKind)
    // Qué generó de verdad esta pieza. Con dos motores posibles y hasta una
    // elección manual, decir siempre GEMINI_MODEL sería mentir en muchos casos.
    const modelo = !crudo
      ? GEMINI_MODEL
      : modeloCamino2 === "chatgpt"
        ? MODELO_CHATGPT
        : modeloCamino2 === "gemini"
          ? GEMINI_MODEL
          : process.env.OPENROUTER_API_KEY
            ? OPENROUTER_MODEL
            : GEMINI_MODEL
    return NextResponse.json({ image, model: modelo, prompt: finalPrompt })
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
