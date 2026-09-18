import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { contarUso } from "@/lib/rate-limit"
import { createSupabaseServer } from "@/lib/supabase-server"
import { supabase } from "@/lib/supabase"
import { LIMITES } from "@/lib/marketing/notas"
import { faqsDe, fuentesDe } from "@/lib/marketing/notas-server"
import { ESQUEMA_REVISION, armarPedido, revisionDe } from "@/lib/marketing/notas-revision"

/**
 * Revisión de una nota con IA, antes de publicarla.
 *
 * Es opcional: se dispara con un botón del editor y no corre al guardar. Lee la
 * nota que está en pantalla —no la guardada— porque lo que se quiere revisar es
 * justamente el borrador.
 *
 * SE PAGA POR TOKEN, ASÍ QUE TIENE TECHO
 *
 * Diez revisiones por persona por día y una cada quince segundos. Una nota se
 * revisa una o dos veces, no veinte: el límite existe para que un botón que se
 * clickea sin pensar no se lleve el presupuesto del mes. Sin contador no se
 * llama al modelo (`fallaCerrado`, el default): en algo que se paga por uso,
 * dejar pasar sin poder contar es quedarse sin techo.
 */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const LIMITE_DIA = 10
const LIMITE_RAFAGA_SEGUNDOS = 15

/** El cuerpo entero de una nota larga son unos 15k tokens. Se corta bastante
 *  antes del tope de la columna: lo que decide la revisión está en la primera
 *  mitad, y el costo crece con cada carácter. */
const CUERPO_MAX = 24000

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max).trim() : ""
}

export const POST = ruta("notas revision", async (req: Request) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Falta configurar ANTHROPIC_API_KEY" }, { status: 503 })
  }

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()
  const quien = user?.id ?? "anonimo"

  const [rafaga, dia] = await Promise.all([
    contarUso(`nota-revision:${quien}`, 1, LIMITE_RAFAGA_SEGUNDOS),
    contarUso(`nota-revision-dia:${quien}`, LIMITE_DIA, 86400),
  ])
  if (rafaga === "excedido") {
    return NextResponse.json({ error: "Esperá unos segundos antes de pedir otra revisión." }, { status: 429 })
  }
  if (dia === "excedido") {
    return NextResponse.json(
      { error: `Llegaste a las ${LIMITE_DIA} revisiones de hoy. Mañana se renueva.` },
      { status: 429 }
    )
  }
  if (rafaga === "sin-contador" || dia === "sin-contador") {
    return NextResponse.json({ error: "No se pudo verificar el cupo de revisiones. Probá de nuevo." }, { status: 503 })
  }

  let cuerpo: Record<string, unknown>
  try {
    cuerpo = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
  }

  const nota = {
    titulo: texto(cuerpo.titulo, LIMITES.titulo),
    tituloSeo: texto(cuerpo.tituloSeo, LIMITES.tituloSeo),
    resumen: texto(cuerpo.resumen, LIMITES.resumen),
    respuesta: texto(cuerpo.respuesta, LIMITES.respuesta),
    cuerpo: texto(cuerpo.cuerpo, CUERPO_MAX),
    categoria: typeof cuerpo.categoria === "string" ? cuerpo.categoria : null,
    tags: Array.isArray(cuerpo.tags) ? cuerpo.tags.map(String).slice(0, LIMITES.tags) : [],
    autor: texto(cuerpo.autor, LIMITES.autor),
    faqs: faqsDe(cuerpo.faqs),
    fuentes: fuentesDe(cuerpo.fuentes),
  }

  if (!nota.titulo || !nota.cuerpo) {
    return NextResponse.json({ error: "Escribí el título y el cuerpo antes de pedir la revisión." }, { status: 400 })
  }

  // Los títulos de las demás notas publicadas: es contra ellas que se chequea
  // la canibalización, y salen de la base y no del cliente para que la lista
  // sea la real y no la que el navegador tenga cargada.
  const { data: publicadas } = await supabase
    .from("notas")
    .select("titulo, slug")
    .eq("publicado", true)
    .neq("slug", typeof cuerpo.slug === "string" ? cuerpo.slug : "")
    .limit(60)

  const otras = (publicadas ?? []).map((n) => String(n.titulo))

  try {
    const respuesta = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 8000,
      // La revisión es un juicio con criterio, no una extracción: conviene que
      // piense. `medium` es el punto donde deja de encontrar cosas nuevas en un
      // texto de 1.500 palabras.
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: ESQUEMA_REVISION as unknown as Record<string, unknown> },
      },
      messages: [{ role: "user", content: armarPedido(nota, otras) }],
    })

    if (respuesta.stop_reason === "refusal") {
      console.error("[notas revision] refusal", respuesta.stop_details)
      return NextResponse.json({ error: "El revisor no pudo procesar esta nota." }, { status: 502 })
    }

    const bloque = respuesta.content.find((b) => b.type === "text")
    if (!bloque || bloque.type !== "text") {
      return NextResponse.json({ error: "La revisión llegó vacía. Probá de nuevo." }, { status: 502 })
    }

    let crudo: unknown
    try {
      crudo = JSON.parse(bloque.text)
    } catch {
      console.error("[notas revision] json inválido", bloque.text.slice(0, 400))
      return NextResponse.json({ error: "La revisión llegó mal formada. Probá de nuevo." }, { status: 502 })
    }

    const revision = revisionDe(crudo)
    if (!revision) return NextResponse.json({ error: "La revisión llegó vacía. Probá de nuevo." }, { status: 502 })

    return NextResponse.json({ revision })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "El servicio está saturado. Probá en un minuto." }, { status: 429 })
    }
    if (e instanceof Anthropic.APIError) {
      console.error("[notas revision] api", e.status, e.message)
      return NextResponse.json({ error: "No se pudo revisar la nota ahora." }, { status: 502 })
    }
    throw e
  }
})
