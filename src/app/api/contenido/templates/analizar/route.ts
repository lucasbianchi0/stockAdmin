import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { esMimeValido, PLANTILLA_MAX_BYTES } from "@/lib/plantillas"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const maxDuration = 60

/**
 * Lee la ESTRUCTURA de una pieza ajena y la devuelve como receta reutilizable.
 *
 * Lo único que se puede tomar de la pieza de otra marca es cómo está armada:
 * dónde va el sujeto, qué proporción ocupa cada bloque, qué tipo de fondo. El
 * color, el logo y el contenido son de esa marca — copiarlos sería publicar su
 * pieza pintada de otro color.
 *
 * Las medidas van en PORCENTAJES del alto y del ancho, nunca en píxeles: la
 * misma receta tiene que servir en 1:1, en 4:5 y en 16:9, y una medida absoluta
 * se rompe apenas cambia el formato.
 */
export async function POST(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Se esperaba un formulario" }, { status: 400 })
  }

  const archivo = form.get("archivo")
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })
  }
  if (!esMimeValido(archivo.type)) {
    return NextResponse.json({ error: "Tiene que ser JPG, PNG o WebP" }, { status: 400 })
  }
  if (archivo.size > PLANTILLA_MAX_BYTES) {
    return NextResponse.json({ error: "El archivo supera los 5 MB" }, { status: 400 })
  }

  const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64")

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: archivo.type as "image/jpeg", data: base64 },
            },
            {
              type: "text",
              text: `Sos director de arte. Leé ÚNICAMENTE LA ESTRUCTURA de esta pieza gráfica para poder reproducirla con otra marca y otro contenido.

DESCRIBÍ:
- El tipo de fondo: sólido, con textura, degradado suave, fotografía a sangre, o una combinación. Si hay una forma que divide el fondo (una onda, una diagonal, una banda), decí dónde corta en porcentaje del alto.
- Cada bloque de la pieza, en orden de arriba hacia abajo: qué es (titular, bajada, cifra, foto, botón, recuadro, retrato circular), dónde está (alineación y posición) y QUÉ PORCENTAJE del alto y del ancho ocupa.
- La jerarquía tipográfica: cuántos tamaños distintos hay y la proporción entre ellos (ej: "el titular es el triple que la bajada").
- Cuánto espacio vacío queda y dónde.
- Si hay un sujeto fotográfico recortado (PNG sin fondo) o la foto va dentro de un marco.

NO menciones NUNCA:
- Colores, ni por nombre ni por código. Ninguno.
- Logos, marcas, nombres de empresa, hashtags, URLs.
- El contenido concreto del texto ni de la foto.
- Idioma, país, ni nada de la marca original.

Las medidas SIEMPRE en porcentaje del alto o del ancho de la pieza. Nunca en píxeles.

Devolvé SOLO un JSON, sin markdown:
{
  "nombre": "Nombre corto y descriptivo de la estructura, máx 5 palabras",
  "cuandoUsar": "Para qué tipo de mensaje sirve esta estructura. 1 o 2 frases. Nada de la marca original",
  "composicion": "La receta completa, en frases cortas separadas por saltos de línea. Es lo que va a leer un generador de imágenes"
}`,
            },
          ],
        },
      ],
    })

    const texto = msg.content[0].type === "text" ? msg.content[0].text : ""
    const json = texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1)
    const leido = JSON.parse(json) as Record<string, unknown>

    const composicion = typeof leido.composicion === "string" ? leido.composicion.trim() : ""
    if (!composicion) throw new Error("Sin composición")

    return NextResponse.json({
      nombre: typeof leido.nombre === "string" ? leido.nombre.slice(0, 120) : "Estructura sin nombre",
      cuandoUsar: typeof leido.cuandoUsar === "string" ? leido.cuandoUsar.slice(0, 500) : "",
      composicion: composicion.slice(0, 3000),
    })
  } catch (err) {
    console.error("[templates analizar]", err)
    return NextResponse.json(
      { error: "No se pudo leer la estructura de la imagen" },
      { status: 500 }
    )
  }
}
