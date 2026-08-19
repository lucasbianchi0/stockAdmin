import { NextResponse } from "next/server"

import { normalizarVariables } from "@/lib/feed-variables"
import { placaDeVariables } from "@/lib/placa/de-variables"
import { renderizarPlaca } from "@/lib/placa/placa-tipografica"
import { templateFeedPorId } from "@/lib/templates-feed"

/**
 * Las tres variantes del formato de texto, renderizadas con datos fijos.
 *
 * Existe para poder MIRAR la composición sin generar un fondo: el fondo cuesta
 * veintitantos segundos y una llamada paga, y lo que hay que revisar acá es la
 * tipografía —dónde cae el titular, si el bloque cierra contra el 76%, cuánto
 * aire queda—. Sobre el navy plano eso se ve mejor que sobre una foto, porque no
 * hay nada que distraiga de la grilla.
 *
 * SOLO EN DESARROLLO. No lleva `exigirModulo` —justamente para poder abrirla sin
 * sesión— así que en producción devuelve 404 y no existe. Si algún día hace
 * falta en producción, lleva guard como todas las demás.
 *
 *   /api/contenido/placa/muestra?v=solo      · titular y nada más
 *   /api/contenido/placa/muestra?v=bajada    · titular + descripción
 *   /api/contenido/placa/muestra?v=bullets   · titular + 4 ítems
 *   /api/contenido/placa/muestra?v=centrado  · titular centrado arriba, foto abajo
 */

const MUESTRAS = {
  solo: {
    category: "FIRMA BIOMÉTRICA",
    headline: ["El papel es opcional.", "La validez legal, no."],
    destacado: "La validez legal, no.",
  },
  bajada: {
    category: "CIBERSEGURIDAD",
    headline: ["Tu firewall no ve", "al que ya está adentro."],
    destacado: "al que ya está adentro.",
    bajada:
      "El perímetro asume que el atacante viene de afuera. La mayoría entra con credenciales que alguien le dio.",
  },
  centrado: {
    headline: ["¿Qué hacen diferente", "las organizaciones que", "obtienen resultados con IA?"],
    destacado: "que obtienen resultados con IA?",
  },
  bullets: {
    category: "REDES CORPORATIVAS",
    headline: ["Tu red no se cayó.", "Se puso lenta. Es peor."],
    destacado: "Se puso lenta. Es peor.",
    servicios: ["Switching & Routing", "Wireless corporativo", "Seguridad de red", "Contingencia"],
  },
} as const

type Variante = keyof typeof MUESTRAS

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 })
  }

  const pedida = new URL(req.url).searchParams.get("v") ?? "solo"
  if (!(pedida in MUESTRAS)) {
    return NextResponse.json(
      { error: `Variantes: ${Object.keys(MUESTRAS).join(", ")}` },
      { status: 400 }
    )
  }

  // Cualquier template con foto sirve: lo único que se le pide es la familia, que
  // decide el ancho de la columna. La escena no se usa porque no hay fondo.
  const template = templateFeedPorId("feed-01-infraestructura")!
  const variables = normalizarVariables(MUESTRAS[pedida as Variante])
  const placa = placaDeVariables(
    variables,
    template,
    "square",
    pedida === "centrado" ? "centrado" : undefined
  )

  const jpeg = await renderizarPlaca(placa)

  return new NextResponse(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
  })
}
