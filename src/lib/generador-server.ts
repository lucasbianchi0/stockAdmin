/**
 * Generador de contenido con IA — los motores, las operaciones y el guardado.
 * Solo servidor.
 *
 * Usa los mismos motores que el banco (Gemini 3 Pro Image directo a Google y
 * gpt-image-2 por OpenRouter) pero sin nada del sistema visual del feed: ni la
 * referencia de marca adelante ni el logo compuesto a la fuerza. Acá el prompt
 * es del usuario y llega tal cual; la marca entra solo si la pide.
 *
 * Deliberadamente NO comparte código con `api/contenido/image`: esa ruta está
 * afinada pieza por pieza para el feed y cualquier cambio de este lado la
 * pondría en riesgo.
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"

import sharp from "sharp"

import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import {
  BUCKET_GENERADOR,
  archivoLogo,
  cajaLogo,
  type ConfigLogo,
  type ImagenGenerada,
  type MotorImagen,
  type OperacionImagen,
  type EntradaHistorial,
} from "@/lib/generador"
import { COMPOSICION, PALETA, TIPOGRAFIA } from "@/lib/brand-kit"
import type { VariablesFeed } from "@/lib/feed-variables"
import { placaDeVariables } from "@/lib/placa/de-variables"
import { generarFondo } from "@/lib/placa/fondo-server"
import { promptDeFondo } from "@/lib/placa/fondos"
import { renderizarPlaca } from "@/lib/placa/placa-tipografica"
import { MEDIDAS, type Tema } from "@/lib/placa/sistema"
import type { TemplateFeed } from "@/lib/templates-feed"

const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image"
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
const OPENROUTER_URL = "https://openrouter.ai/api/v1/images"
const MODELO_CHATGPT = "openai/gpt-image-2"

const FIRMA_SEGUNDOS = 60 * 60

export type Referencia = { mime: string; data: string }

/** Qué falta para poder usar un motor, o null si está listo. */
export function claveFaltante(motor: MotorImagen): string | null {
  if (motor === "chatgpt") return process.env.OPENROUTER_API_KEY ? null : "OPENROUTER_API_KEY"
  return process.env.GEMINI_API_KEY ? null : "GEMINI_API_KEY"
}

export const nombreModelo = (motor: MotorImagen) => (motor === "chatgpt" ? MODELO_CHATGPT : GEMINI_MODEL)

/**
 * El estilo de marca para pedidos libres.
 *
 * No es el `IMAGE_STYLE_SUFFIX` del Studio: ese prohíbe todo texto en la imagen
 * porque el copy se monta después, y acá alguien puede estar pidiendo justamente
 * una placa con texto. Lleva paleta, composición y tipografía, que es lo que
 * hace que una imagen "se vea Accedra", y deja el resto al pedido. El logo no se
 * pide al modelo —lo inventa—: se compone después desde el archivo oficial.
 */
export const ESTILO_MARCA = `

— Brand style (Accedra) —
Visual style: ${COMPOSICION.estilo}. References: ${COMPOSICION.referencias}.
Composition rules:
${COMPOSICION.reglas.map((r) => `- ${r}`).join("\n")}
Palette (avoid other saturated colours):
${PALETA.map((c) => `- ${c.nombre} ${c.hex}`).join("\n")}
Typography, only if the image contains text: headlines in ${TIPOGRAFIA.display.nombre} (bold, tight tracking, sentence case), any secondary text in ${TIPOGRAFIA.texto.nombre}. At most two weights.
Do not draw any logo or brand mark — the official logo is added afterwards.
Avoid AI clichés: glow, light trails, particles, floating holographic interfaces, circuit-board motifs, neon, padlock icons, binary code.`

/** Lo que se le agrega al prompt cuando hay referencias, para que sepa qué hacer con ellas. */
const NOTA_REFERENCIAS = (n: number) =>
  `\n\nThe ${n === 1 ? "attached image is a visual reference" : `${n} attached images are visual references`}. Use ${n === 1 ? "it" : "them"} as the instruction above asks; if it does not say how, take composition, style and mood from ${n === 1 ? "it" : "them"} without copying ${n === 1 ? "it" : "them"} literally.`

/** Para "modificar": la primera imagen es la que se edita, no una inspiración. */
const NOTA_EDICION = `Edit the FIRST attached image according to the instruction below. Keep everything the instruction does not mention — composition, subject, framing, colours, any text — as it is. Any other attached images are visual references.\n\nInstruction: `

const NOTA_ZONA = `The FIRST attached image is the original. The SECOND is the very same image with one area highlighted in translucent red. Return the full original image, identical, changing ONLY the highlighted area as the instruction says. The red highlight is just a marker: it must not appear in the result. Match lighting, perspective and grain so the edit is invisible. Any further attached images are visual references.\n\nInstruction for the highlighted area: `

const NOTA_ADAPTAR = `The attached image contains a photograph/design placed in the middle of a larger canvas, surrounded by flat neutral grey empty areas. Extend the picture into those grey areas so the whole canvas becomes ONE seamless image in this new format: continue the background, scenery, surfaces and lighting naturally. Keep the existing content exactly as it is, in the same place and size. No grey areas, borders or frames may remain.`

/* ── Motores ──────────────────────────────────────────────────────────────── */

type BloqueGemini = { type?: string; data?: string; mime_type?: string; text?: string }
type RespuestaGemini = {
  output_image?: { data?: string; mime_type?: string }
  steps?: Array<{ content?: BloqueGemini[]; model_output?: BloqueGemini[] }>
}

/** Ver `extraerImagen` en api/contenido/image: la imagen viene en el último step. */
function imagenDeGemini(data: RespuestaGemini): string | null {
  if (data.output_image?.data) return data.output_image.data
  for (const paso of data.steps ?? []) {
    for (const b of [...(paso.content ?? []), ...(paso.model_output ?? [])]) {
      if (b.type === "image" && b.data) return b.data
    }
  }
  return null
}

async function conGemini(prompt: string, refs: Referencia[], aspecto: string): Promise<Buffer> {
  const input = [
    ...refs.map((r) => ({ type: "image", mime_type: r.mime, data: r.data })),
    { type: "text", text: prompt },
  ]

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input,
      // 2K y no 4K aunque la medida pedida sea grande: una generación a 4K no
      // entra en los 60 s de la función. Lo que falta se escala con sharp.
      // JPEG porque es lo verificado contra la API; el PNG lo arma sharp.
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: aspecto, image_size: "2K" },
    }),
  })

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)

  const cuerpo = (await res.json()) as RespuestaGemini
  const b64 = imagenDeGemini(cuerpo)
  if (!b64) {
    // Casi siempre el modelo contestó con texto explicando por qué no generó.
    const texto = (cuerpo.steps ?? [])
      .flatMap((p) => [...(p.content ?? []), ...(p.model_output ?? [])])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join(" ")
      .slice(0, 400)
    throw new Error(texto ? `El modelo no devolvió imagen: ${texto}` : "El modelo no devolvió imagen")
  }
  return Buffer.from(b64, "base64")
}

async function conOpenRouter(prompt: string, refs: Referencia[], aspecto: string): Promise<Buffer> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO_CHATGPT,
      prompt,
      // gpt-image-2 no acepta `resolution` (es un 400): solo la relación.
      aspect_ratio: aspecto,
      n: 1,
      ...(refs.length
        ? {
            input_references: refs.map((r) => ({
              type: "image_url",
              image_url: { url: `data:${r.mime};base64,${r.data}` },
            })),
          }
        : {}),
    }),
  })

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)

  const cuerpo = (await res.json()) as { data?: Array<{ b64_json?: string }> }
  const b64 = cuerpo.data?.[0]?.b64_json
  if (!b64) throw new Error("OpenRouter devolvió 200 sin imagen")
  return Buffer.from(b64, "base64")
}

/** La imagen cruda del motor elegido, en la relación de aspecto más cercana. */
function alModelo(motor: MotorImagen, prompt: string, refs: Referencia[], aspecto: string) {
  return motor === "chatgpt" ? conOpenRouter(prompt, refs, aspecto) : conGemini(prompt, refs, aspecto)
}

/**
 * Una imagen propia lista para mandarle al modelo: JPEG y a 1536 px como máximo.
 *
 * Mandarla en PNG y a tamaño completo cortaba el pedido: un lienzo de Story
 * (1080×1920) pesa varios MB en base64 y OpenRouter cerraba la conexión ("other
 * side closed"). El modelo no ve más detalle que esto, y el resultado final se
 * compone sobre el original en alta, así que no se pierde nada.
 */
async function aRef(buf: Buffer): Promise<Referencia> {
  const liviana = await sharp(buf)
    .resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90 })
    .toBuffer()
  return { mime: "image/jpeg", data: liviana.toString("base64") }
}

/* ── Operaciones ──────────────────────────────────────────────────────────── */

type Base = { motor: MotorImagen; aspecto: string; ancho: number; alto: number }

/**
 * Generar desde cero o modificar la imagen entera.
 *
 * `cover`: llena la medida y recorta lo que sobra de la relación aproximada, que
 * siempre es poco y de los bordes.
 */
export async function generarImagen(
  o: Base & { prompt: string; referencias: Referencia[]; editar: boolean }
): Promise<Buffer> {
  const prompt = o.editar
    ? NOTA_EDICION + o.prompt
    : o.referencias.length
      ? o.prompt + NOTA_REFERENCIAS(o.referencias.length)
      : o.prompt

  const cruda = await alModelo(o.motor, prompt, o.referencias, o.aspecto)
  return sharp(cruda)
    .resize({ width: o.ancho, height: o.alto, fit: "cover", position: "attention", kernel: "lanczos3" })
    .png({ compressionLevel: 8 })
    .toBuffer()
}

/**
 * Editar solo una zona.
 *
 * Los modelos no reciben máscaras de verdad, así que la zona viaja marcada en
 * rojo sobre una copia. Y como igual pueden retocar algo de afuera, el resultado
 * se compone de vuelta sobre el original usando la máscara con el borde
 * difuminado: lo que no se pintó queda idéntico, píxel por píxel.
 */
export async function editarZona(
  o: Base & { prompt: string; original: Buffer; mascara: Buffer; referencias: Referencia[] }
): Promise<Buffer> {
  const { ancho: W, alto: H } = o

  // La máscara en escala de grises a la medida de la imagen: blanco = editar.
  const mascara = await sharp(o.mascara)
    .resize({ width: W, height: H, fit: "fill" })
    .flatten({ background: "#000000" })
    .greyscale()
    .toColourspace("b-w")
    .raw()
    .toBuffer()

  // `extractChannel(0)` al final no es decorativo: sharp interpreta un raw de un
  // canal como sRGB y `linear` lo devuelve con tres. Leído como uno, el canal
  // alfa salía corrido y la imagen se llenaba de rayas horizontales.
  const comoAlfa = (opacidad: number, blur = 0) =>
    sharp(mascara, { raw: { width: W, height: H, channels: 1 } })
      .linear(opacidad, 0)
      .blur(blur > 0.3 ? blur : undefined)
      .extractChannel(0)
      .raw()
      .toBuffer()

  const rojo = await sharp({ create: { width: W, height: H, channels: 3, background: "#ff1f1f" } })
    .joinChannel(await comoAlfa(0.55), { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer()

  const marcada = await sharp(o.original).composite([{ input: rojo }]).png().toBuffer()

  const cruda = await alModelo(
    o.motor,
    NOTA_ZONA + o.prompt,
    [await aRef(o.original), await aRef(marcada), ...o.referencias],
    o.aspecto
  )

  // `fill` y no `cover`: la relación ya es la del original, y recortar correría
  // la edición respecto de la máscara.
  const editada = await sharp(cruda).resize({ width: W, height: H, fit: "fill" }).removeAlpha().toBuffer()

  const borde = Math.max(2, Math.min(W, H) * 0.012)
  const editadaConAlfa = await sharp(editada)
    .joinChannel(await comoAlfa(1, borde), { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer()

  return sharp(o.original).composite([{ input: editadaConAlfa }]).png({ compressionLevel: 8 }).toBuffer()
}

/**
 * Llevar una imagen a otro formato extendiéndola (outpainting).
 *
 * La original se apoya entera en el centro del lienzo nuevo, el modelo completa
 * los costados y al final la original se vuelve a pegar encima con el borde
 * difuminado, así el contenido que ya estaba aprobado no cambia ni un píxel.
 */
export async function adaptarFormato(
  o: Base & { original: Buffer; prompt: string }
): Promise<Buffer> {
  const { ancho: W, alto: H } = o
  const meta = await sharp(o.original).metadata()
  const escala = Math.min(W / meta.width!, H / meta.height!)
  const w = Math.round(meta.width! * escala)
  const h = Math.round(meta.height! * escala)
  const left = Math.round((W - w) / 2)
  const top = Math.round((H - h) / 2)

  const centro = await sharp(o.original).resize({ width: w, height: h }).png().toBuffer()
  const lienzo = await sharp({ create: { width: W, height: H, channels: 3, background: "#808080" } })
    .composite([{ input: centro, left, top }])
    .png()
    .toBuffer()

  const prompt = o.prompt ? `${NOTA_ADAPTAR}\n\nAdditional instruction: ${o.prompt}` : NOTA_ADAPTAR
  const cruda = await alModelo(o.motor, prompt, [await aRef(lienzo)], o.aspecto)
  const extendida = await sharp(cruda).resize({ width: W, height: H, fit: "fill" }).removeAlpha().png().toBuffer()

  // La original encima, con un fundido de unos píxeles para que no se note la costura.
  const fundido = Math.max(4, Math.round(Math.min(w, h) * 0.02))
  // Dos pasos: sharp aplica `composite` al final del pipeline, así que un blur
  // en la misma cadena difuminaría el lienzo negro antes de pegarle el blanco.
  const rectangulo = await sharp({
    create: { width: w, height: h, channels: 3, background: "#000000" },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: Math.max(1, w - fundido * 2),
            height: Math.max(1, h - fundido * 2),
            channels: 3,
            background: "#ffffff",
          },
        })
          .png()
          .toBuffer(),
        left: fundido,
        top: fundido,
      },
    ])
    .png()
    .toBuffer()
  const alfa = await sharp(rectangulo).blur(fundido / 2).extractChannel(0).raw().toBuffer()

  const centroConAlfa = await sharp(centro)
    .removeAlpha()
    .joinChannel(alfa, { raw: { width: w, height: h, channels: 1 } })
    .png()
    .toBuffer()

  return sharp(extendida).composite([{ input: centroConAlfa, left, top }]).png({ compressionLevel: 8 }).toBuffer()
}

/**
 * Una pieza con un template del feed, por el mismo camino que el banco.
 *
 * Es la ruta `api/contenido/placa` sin el slot: el modelo genera solo el fondo y
 * el código compone titular, rótulo, bajada y logo. La diferencia es de dónde
 * salen las variables —acá las escribe la persona, allá las deriva un modelo
 * de texto del posteo— y que el fondo puede ser una foto propia en vez de uno
 * generado.
 */
export async function generarConFeed(o: {
  template: TemplateFeed
  variables: VariablesFeed
  escena: string | null
  tema: Tema
  formato: "square" | "portrait"
  foto: Buffer | null
}): Promise<Buffer> {
  let fondo: string
  if (o.foto) {
    const { ancho, alto } = MEDIDAS[o.formato]
    const ajustada = await sharp(o.foto)
      .resize({ width: ancho, height: alto, fit: "cover", position: "attention" })
      .jpeg({ quality: 92 })
      .toBuffer()
    fondo = `data:image/jpeg;base64,${ajustada.toString("base64")}`
  } else {
    // Sin escena escrita, cae a la escena de respaldo del template: la misma que
    // usan las piezas del banco que no traen brief de arte.
    const prompt = promptDeFondo(o.escena, o.template.familia, o.template.id, undefined, o.tema)
    if (!prompt) throw new Error("Este template necesita que describas la escena del fondo")
    fondo = await generarFondo(prompt, o.formato, o.tema)
  }

  const placa = placaDeVariables(o.variables, o.template, o.formato, undefined, o.tema)
  const jpeg = await renderizarPlaca({ ...placa, fondo })
  return sharp(jpeg).png({ compressionLevel: 8 }).toBuffer()
}

/**
 * Compone el logo oficial sobre una imagen ya en medida.
 *
 * Con tono "auto" mira el brillo de la zona donde va a caer: sobre fondo claro
 * va el navy, sobre oscuro el blanco. Es la misma regla de uso del Brand Kit.
 */
export async function componerLogo(png: Buffer, config: ConfigLogo): Promise<Buffer> {
  const { width, height } = await sharp(png).metadata()
  if (!width || !height) return png
  const caja = cajaLogo(width, height, config)

  let tono = config.tono
  if (tono === "auto") {
    const { channels } = await sharp(png)
      .extract({
        left: Math.max(0, caja.left),
        top: Math.max(0, caja.top),
        width: Math.min(caja.w, width - Math.max(0, caja.left)),
        height: Math.min(caja.h, height - Math.max(0, caja.top)),
      })
      .stats()
    const [r, g, b] = channels.map((c) => c.mean)
    tono = 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? "navy" : "blanco"
  }

  const svg = await readFile(join(process.cwd(), "public", archivoLogo(config.familia, tono)))
  const logo = await sharp(svg, { density: 300 })
    .resize({ width: caja.w, height: caja.h, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  return sharp(png)
    .composite([{ input: logo, left: caja.left, top: caja.top }])
    .png({ compressionLevel: 8 })
    .toBuffer()
}

/* ── Guardado ─────────────────────────────────────────────────────────────── */

export async function usuarioActual(): Promise<string | null> {
  const cliente = await createSupabaseServer()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  return user?.id ?? null
}

/** La imagen de una fila del historial, para operar sobre ella. */
export async function imagenDelHistorial(
  id: string
): Promise<{ buffer: Buffer; ancho: number; alto: number; prompt: string } | null> {
  const { data: fila } = await supabase
    .from("generador_historial")
    .select("storage_path, ancho, alto, prompt")
    .eq("id", id)
    .eq("tipo", "imagen")
    .maybeSingle()
  if (!fila?.storage_path) return null

  const { data, error } = await supabase.storage.from(BUCKET_GENERADOR).download(fila.storage_path)
  if (error || !data) return null

  return {
    buffer: Buffer.from(await data.arrayBuffer()),
    ancho: Number(fila.ancho),
    alto: Number(fila.alto),
    prompt: String(fila.prompt),
  }
}

export const comoReferencia = (buf: Buffer) => aRef(buf)

export async function guardarImagen(opts: {
  png: Buffer
  prompt: string
  parametros: Record<string, unknown>
  ancho: number
  alto: number
  modelo: string | null
  grupoId: string | null
  origenId: string | null
}): Promise<ImagenGenerada> {
  await supabase.storage.createBucket(BUCKET_GENERADOR, { public: false }).catch(() => {})

  const ahora = new Date()
  const ruta = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.png`

  const { error: errSubida } = await supabase.storage
    .from(BUCKET_GENERADOR)
    .upload(ruta, opts.png, { contentType: "image/png", upsert: false })
  if (errSubida) throw new Error(`No se pudo guardar la imagen: ${errSubida.message}`)

  // La miniatura es lo que cargan las grillas. Sin ella, cada celda bajaba el
  // PNG entero (1–3 MB) y el historial tardaba segundos en aparecer. No es
  // crítica: si falla, la grilla usa la imagen completa.
  try {
    const mini = await sharp(opts.png).resize({ width: 480, height: 480, fit: "inside" }).jpeg({ quality: 78 }).toBuffer()
    await supabase.storage.from(BUCKET_GENERADOR).upload(rutaMiniatura(ruta), mini, { contentType: "image/jpeg", upsert: true })
  } catch (err) {
    console.error("[generador miniatura]", err)
  }

  const { data, error } = await supabase
    .from("generador_historial")
    .insert({
      tipo: "imagen",
      prompt: opts.prompt,
      parametros: opts.parametros,
      storage_path: ruta,
      mime_type: "image/png",
      ancho: opts.ancho,
      alto: opts.alto,
      modelo: opts.modelo,
      grupo_id: opts.grupoId,
      origen_id: opts.origenId,
      created_by: await usuarioActual(),
    })
    .select()
    .single()

  if (error || !data) {
    // Sin fila el archivo queda inalcanzable: se borra.
    await supabase.storage.from(BUCKET_GENERADOR).remove([ruta, rutaMiniatura(ruta)])
    throw new Error(`No se pudo registrar la imagen: ${error?.message ?? "sin fila"}`)
  }

  return aImagen(data)
}

/** Dónde vive la miniatura de una imagen: al lado, con otra extensión. */
export const rutaMiniatura = (ruta: string) => ruta.replace(/\.png$/, ".mini.jpg")

export async function aImagen(fila: Record<string, unknown>): Promise<ImagenGenerada> {
  return (await aImagenes([fila]))[0]
}

/** Varias filas de imagen, con todas las URLs firmadas en una sola llamada a Storage. */
export async function aImagenes(filas: Record<string, unknown>[]): Promise<ImagenGenerada[]> {
  if (filas.length === 0) return []
  const rutas = filas.map((f) => String(f.storage_path))
  const { data } = await supabase.storage
    .from(BUCKET_GENERADOR)
    .createSignedUrls([...rutas, ...rutas.map(rutaMiniatura)], FIRMA_SEGUNDOS)
  // Una miniatura que no existe (filas viejas) vuelve con error y sin URL: la
  // grilla cae a la imagen completa.
  const urls = new Map((data ?? []).filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl]))
  return filas.map((f) => {
    const ruta = String(f.storage_path)
    const url = urls.get(ruta) ?? null
    return mapear(f, url, urls.get(rutaMiniatura(ruta)) ?? url)
  })
}

function mapear(fila: Record<string, unknown>, url: string | null, miniatura: string | null): ImagenGenerada {
  const parametros = (fila.parametros as Record<string, unknown> | null) ?? {}
  // Las filas anteriores a las operaciones solo tenían `modificacion`.
  const operacion = (parametros.operacion as OperacionImagen | undefined) ??
    (parametros.modificacion ? "modificar" : "generar")

  return {
    id: String(fila.id),
    url,
    miniatura,
    prompt: String(fila.prompt),
    operacion,
    ancho: Number(fila.ancho),
    alto: Number(fila.alto),
    modelo: (fila.modelo as string | null) ?? null,
    grupoId: (fila.grupo_id as string | null) ?? null,
    origenId: (fila.origen_id as string | null) ?? null,
    createdAt: String(fila.created_at),
  }
}

/* ── Historial ────────────────────────────────────────────────────────────── */

/** Filas del historial (de cualquier tipo) con la forma que usa la pantalla. */
export async function aEntradas(filas: Record<string, unknown>[]): Promise<EntradaHistorial[]> {
  const imagenes = new Map(
    (await aImagenes(filas.filter((f) => f.tipo === "imagen"))).map((i) => [i.id, i])
  )
  return filas.map((f): EntradaHistorial => {
    const parametros = (f.parametros as Record<string, unknown> | null) ?? {}
    if (f.tipo === "imagen") return { tipo: "imagen", parametros, ...imagenes.get(String(f.id))! }
    return {
      tipo: "texto",
      parametros,
      id: String(f.id),
      prompt: String(f.prompt),
      texto: String(f.texto ?? ""),
      tipoTexto: String(parametros.tipo ?? "libre"),
      modelo: (f.modelo as string | null) ?? null,
      createdAt: String(f.created_at),
    }
  })
}
