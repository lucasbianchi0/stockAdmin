import Anthropic from "@anthropic-ai/sdk"

import { TAMANO_MAX_MB, tipoAceptado } from "@/lib/admin/extraccion"

/**
 * Leer un documento adjunto y devolver datos estructurados.
 *
 * Es la parte de la carga inteligente que no depende de qué se esté cargando: el
 * archivo se valida, se manda como adjunto y la respuesta valida contra un
 * esquema. Lo que cambia entre una factura, una constancia de AFIP y el
 * comprobante de un gasto es el prompt y el esquema, no esto.
 *
 * Existe porque la alternativa —copiar el bloque de Anthropic en cada endpoint
 * que lea un archivo— garantiza que el día que cambie el modelo, o que haya que
 * manejar un `stop_reason` nuevo, tres de las cuatro copias se queden viejas.
 *
 * **Nada de lo que sale de acá se guarda solo.** Todos los lectores producen un
 * borrador que una persona confirma. La lectura acierta casi siempre, y "casi
 * siempre" no alcanza cuando el error aparece dos meses después en una
 * declaración jurada.
 */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type Lectura<T> = { datos: T } | { error: string }

/** El esquema JSON de salida. Se tipa como diccionario y no como `object`
 *  porque el SDK exige una firma de índice: sin ella, un `as const` —que es como
 *  se escriben los esquemas de este módulo— no encaja en el parámetro. */
type EsquemaJson = { [clave: string]: unknown }

export async function leerDocumento<T>(
  archivo: File,
  prompt: string,
  schema: EsquemaJson
): Promise<Lectura<T>> {
  if (!tipoAceptado(archivo.type)) {
    return {
      error: `Formato no soportado (${archivo.type || "desconocido"}). Adjuntá PDF, JPG, PNG o WEBP.`,
    }
  }
  if (archivo.size > TAMANO_MAX_MB * 1024 * 1024) {
    return { error: `El archivo pesa más de ${TAMANO_MAX_MB} MB` }
  }

  try {
    const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64")

    // El PDF va como `document` y una foto como `image`: son bloques distintos y
    // mandar uno donde va el otro es un 400.
    const adjunto =
      archivo.type === "application/pdf"
        ? ({
            type: "document" as const,
            source: {
              type: "base64" as const,
              media_type: "application/pdf" as const,
              data: base64,
            },
          })
        : ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: archivo.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: base64,
            },
          })

    const mensaje = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      // Structured outputs: la respuesta valida contra el esquema o no vuelve.
      // Sin esto habría que sacar el JSON de adentro del texto con una expresión
      // regular y rezar — que es exactamente como se cuelan los datos corruptos.
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: [adjunto, { type: "text", text: prompt }] }],
    })

    if (mensaje.stop_reason === "refusal") {
      return { error: "El modelo no pudo procesar este documento" }
    }

    const texto = mensaje.content.find((b) => b.type === "text")
    if (!texto || texto.type !== "text") {
      return { error: "El modelo no devolvió datos" }
    }

    return { datos: JSON.parse(texto.text) as T }
  } catch (e) {
    console.error("[lectura]", archivo.name, e)
    return { error: e instanceof Error ? e.message : "No se pudo leer el documento" }
  }
}

/** El único archivo de un formulario de carga inteligente, o el error de por qué
 *  no lo hay. Los tres endpoints que leen un documento hacen exactamente esto. */
export async function archivoDelForm(
  req: Request
): Promise<{ archivo: File } | { error: string }> {
  try {
    const form = await req.formData()
    const archivo = form.get("archivo")
    if (!(archivo instanceof File)) return { error: "No adjuntaste ningún archivo" }
    return { archivo }
  } catch {
    return { error: "No se pudo leer el formulario" }
  }
}
