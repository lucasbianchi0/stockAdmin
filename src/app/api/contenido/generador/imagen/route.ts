import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import {
  MAX_REFERENCIAS,
  aspectoMasCercano,
  configLogo,
  medidaValida,
  type MotorImagen,
  type OperacionImagen,
} from "@/lib/generador"
import { normalizarVariables } from "@/lib/feed-variables"
import { hayMotor } from "@/lib/placa/fondo-server"
import { MEDIDAS, esTema } from "@/lib/placa/sistema"
import { templateFeedPorId } from "@/lib/templates-feed"
import {
  ESTILO_MARCA,
  aImagenes,
  adaptarFormato,
  claveFaltante,
  comoReferencia,
  componerLogo,
  editarZona,
  generarConFeed,
  generarImagen,
  guardarImagen,
  imagenDelHistorial,
  nombreModelo,
  type Referencia,
} from "@/lib/generador-server"

/**
 * Una imagen por pedido, no las variantes juntas.
 *
 * El cliente dispara una petición por variante en paralelo. Juntas no entrarían:
 * cada generación tarda ~30 s y la función tiene 60, y la respuesta con cuatro
 * PNG pasaría el tope de 4,5 MB de Vercel. Separadas, cada variante que sale se
 * muestra apenas llega y una que falla no se lleva a las otras.
 */
export const maxDuration = 60

const UUID = /^[0-9a-f-]{36}$/i
const OPERACIONES: OperacionImagen[] = ["generar", "feed", "modificar", "zona", "adaptar", "logo"]
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/

/* ── GET · recientes ──────────────────────────────────────────────────────── */

export const GET = ruta("generador imagen GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const limite = Math.min(60, Math.max(1, Number(new URL(req.url).searchParams.get("limite")) || 24))

  const { data, error } = await supabase
    .from("generador_historial")
    .select("*")
    .eq("tipo", "imagen")
    .order("created_at", { ascending: false })
    .limit(limite)

  if (error) {
    console.error("[generador imagen GET]", error)
    return NextResponse.json({ error: "No se pudo cargar el historial" }, { status: 500 })
  }

  return NextResponse.json({ imagenes: await aImagenes(data ?? []) })
})

/* ── POST · generar u operar sobre una imagen ─────────────────────────────── */

export const POST = ruta("generador imagen POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let raw: Record<string, unknown>
  try {
    raw = (await req.json()) ?? {}
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const operacion = OPERACIONES.find((o) => o === raw.operacion) ?? "generar"
  if (operacion === "feed") return conTemplateFeed(raw)
  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim().slice(0, 6000) : ""
  const marca = raw.marca === true
  const logo = configLogo(raw.logo)
  const grupoId = typeof raw.grupoId === "string" && UUID.test(raw.grupoId) ? raw.grupoId : null
  const origenId = typeof raw.origenId === "string" && UUID.test(raw.origenId) ? raw.origenId : null
  const motor: MotorImagen = raw.motor === "gemini" ? "gemini" : "chatgpt"

  // Todo lo que no es "generar" trabaja sobre una imagen del historial.
  const original = origenId ? await imagenDelHistorial(origenId) : null
  if (operacion !== "generar" && !original) {
    return NextResponse.json({ error: "No se encontró la imagen de origen" }, { status: 404 })
  }

  if ((operacion === "generar" || operacion === "modificar" || operacion === "zona") && !prompt) {
    return NextResponse.json(
      { error: operacion === "generar" ? "Escribí qué imagen necesitás" : "Escribí qué querés cambiar" },
      { status: 400 }
    )
  }
  if (operacion === "logo" && !logo) {
    return NextResponse.json({ error: "Elegí cómo va el logo" }, { status: 400 })
  }

  // La medida: la pedida al generar o adaptar; la del original en el resto.
  const ancho = operacion === "generar" || operacion === "adaptar" ? raw.ancho : original!.ancho
  const alto = operacion === "generar" || operacion === "adaptar" ? raw.alto : original!.alto
  if (!medidaValida(ancho) || !medidaValida(alto)) {
    return NextResponse.json({ error: "Medida inválida: entre 64 y 4096 px por lado" }, { status: 400 })
  }

  const usaIA = operacion !== "logo"
  if (usaIA) {
    const falta = claveFaltante(motor)
    if (falta) return NextResponse.json({ error: `Falta ${falta}` }, { status: 500 })
  }

  // Las referencias llegan como data URL, ya achicadas en el navegador.
  const referencias: Referencia[] = (Array.isArray(raw.referencias) ? raw.referencias : [])
    .slice(0, MAX_REFERENCIAS)
    .map((r) => (typeof r === "string" ? r.match(DATA_URL) : null))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map(([, mime, data]) => ({ mime, data }))

  const mascara =
    typeof raw.mascara === "string" ? raw.mascara.match(DATA_URL)?.[2] : undefined
  if (operacion === "zona" && !mascara) {
    return NextResponse.json({ error: "Pintá la zona que querés editar" }, { status: 400 })
  }

  const aspecto = aspectoMasCercano(ancho, alto, motor)
  const promptFinal = marca && usaIA ? prompt + ESTILO_MARCA : prompt

  try {
    let png: Buffer
    switch (operacion) {
      case "generar":
        png = await generarImagen({ motor, aspecto, ancho, alto, prompt: promptFinal, referencias, editar: false })
        break
      case "modificar":
        png = await generarImagen({
          motor,
          aspecto,
          ancho,
          alto,
          prompt: promptFinal,
          referencias: [await comoReferencia(original!.buffer), ...referencias],
          editar: true,
        })
        break
      case "zona":
        png = await editarZona({
          motor,
          aspecto,
          ancho,
          alto,
          prompt: promptFinal,
          original: original!.buffer,
          mascara: Buffer.from(mascara!, "base64"),
          referencias,
        })
        break
      case "adaptar":
        png = await adaptarFormato({ motor, aspecto, ancho, alto, original: original!.buffer, prompt: promptFinal })
        break
      case "logo":
        png = original!.buffer
        break
    }

    // El logo se compone desde el archivo oficial, nunca lo dibuja el modelo.
    if (logo) png = await componerLogo(png, logo)

    const imagen = await guardarImagen({
      png,
      // Se guarda lo que escribió la persona, no el prompt armado: es lo que
      // tiene que reaparecer si se reabre desde el historial. Una operación sin
      // instrucción hereda el pedido del original, para que se pueda buscar.
      prompt: prompt || original?.prompt || "",
      parametros: {
        operacion,
        motor: usaIA ? motor : null,
        aspecto: usaIA ? aspecto : null,
        marca,
        logo,
        referencias: referencias.length,
        instruccion: operacion !== "generar" ? prompt || null : null,
      },
      ancho,
      alto,
      modelo: usaIA ? nombreModelo(motor) : null,
      grupoId,
      origenId,
    })

    return NextResponse.json({ imagen }, { status: 201 })
  } catch (err) {
    // El mensaje real viaja al cliente: "OpenRouter 402: Insufficient credits"
    // se resuelve solo; "no se pudo generar" manda a revisar el prompt.
    console.error("[generador imagen]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo generar la imagen" },
      { status: 502 }
    )
  }
})

/* ── Con un template del feed ─────────────────────────────────────────────── */

async function conTemplateFeed(raw: Record<string, unknown>) {
  const template = templateFeedPorId(typeof raw.templateFeed === "string" ? raw.templateFeed : null)
  if (!template) return NextResponse.json({ error: "Elegí un template" }, { status: 400 })

  const variables = normalizarVariables(raw.variables)
  if (variables.headline.length === 0) {
    return NextResponse.json({ error: "Escribí el titular" }, { status: 400 })
  }

  const formato = raw.formato === "portrait" ? "portrait" : "square"
  const tema = esTema(raw.tema) ? raw.tema : "oscuro"
  const escena = typeof raw.escena === "string" ? raw.escena.trim().slice(0, 1500) || null : null
  const foto = typeof raw.foto === "string" ? raw.foto.match(DATA_URL)?.[2] : undefined
  if (!foto && !hayMotor()) {
    return NextResponse.json({ error: "Falta OPENROUTER_API_KEY o GEMINI_API_KEY" }, { status: 500 })
  }

  const grupoId = typeof raw.grupoId === "string" && UUID.test(raw.grupoId) ? raw.grupoId : null
  const { ancho, alto } = MEDIDAS[formato]

  try {
    const png = await generarConFeed({
      template,
      variables,
      escena,
      tema,
      formato,
      foto: foto ? Buffer.from(foto, "base64") : null,
    })

    const imagen = await guardarImagen({
      png,
      // El titular es lo que identifica la pieza en el historial y en la búsqueda.
      prompt: variables.headline.join(" "),
      parametros: {
        operacion: "feed",
        template: template.id,
        templateNombre: template.nombre,
        variables,
        escena,
        tema,
        formato,
        fondo: foto ? "foto" : "generado",
      },
      ancho,
      alto,
      modelo: foto ? "placa · foto propia + texto compuesto" : "placa · fondo generado + texto compuesto",
      grupoId,
      origenId: null,
    })

    return NextResponse.json({ imagen }, { status: 201 })
  } catch (err) {
    console.error("[generador imagen feed]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo componer la pieza" },
      { status: 502 }
    )
  }
}
