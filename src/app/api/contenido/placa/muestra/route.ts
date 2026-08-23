import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { NextResponse } from "next/server"

import { normalizarVariables } from "@/lib/feed-variables"
import { placaDeVariables } from "@/lib/placa/de-variables"
import { revisarPlaca } from "@/lib/placa/invariantes"
import { esTema, type Tema } from "@/lib/placa/sistema"
import { promptDeFondo } from "@/lib/placa/fondos"
import { generarFondo, hayMotor } from "@/lib/placa/fondo-server"
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
 *   /api/contenido/placa/muestra?v=defecto   · la pieza rota que motivó las garantías
 *
 * Con `?tema=claro` se ve la misma pieza en el tema claro, con `?fondo=1` se
 * genera el fondo de verdad —lo demás sale sobre el color plano— y con
 * `?t=feed-05-reunion` se cambia el template, que es lo que decide la familia
 * y —desde que el rótulo dejó de ser opcional— el rubro con el que se rellena.
 * La revisión de la placa viaja en la cabecera `X-Placa-Fallas`: vacía quiere
 * decir que la pieza está en sistema.
 */

export const maxDuration = 60

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
    // El botón solo lo dibuja el tema claro; en oscuro el CTA no se usa en
    // ninguno de los cuatro layouts.
    cta: "AUDITÁ TU RED",
  },
  centrado: {
    headline: ["¿Qué hacen diferente", "las organizaciones que", "obtienen resultados con IA?"],
    destacado: "que obtienen resultados con IA?",
  },
  /*
   * La pieza que motivó todo esto, reproducida tal como llegaba.
   *
   * Titular largo y de tres oraciones, sin rubro y sin destacado: los tres
   * huecos que antes salían impresos —titular colgado en "Un", nada arriba,
   * nada en azul— y que ahora tienen que llenarse solos.
   */
  defecto: {
    headline: ["4.400 pantallas de firma. 400 sucursales. Un solo circuito."],
    bajada:
      "Banco Provincia digitalizó el circuito de firma en cada sucursal del país. Relevamiento, integración y soporte incluidos.",
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
  const template =
    templateFeedPorId(new URL(req.url).searchParams.get("t")) ??
    templateFeedPorId("feed-01-infraestructura")!
  const variables = normalizarVariables(MUESTRAS[pedida as Variante])
  const pedidoTema = new URL(req.url).searchParams.get("tema")
  const tema: Tema = esTema(pedidoTema) ? pedidoTema : "oscuro"

  const placa = {
    ...placaDeVariables(
      variables,
      template,
      "square",
      pedida === "centrado" ? "centrado" : undefined
    ),
    tema,
  }

  /*
   * El fondo generado, solo si se pide.
   *
   * Por defecto la muestra sale sobre el color plano: lo que se revisa acá es la
   * tipografía —dónde cae el titular, si el bloque cierra, cuánto aire queda— y
   * eso se ve mejor sin una foto atrás. Con `?fondo=1` se paga la generación y
   * se ve la pieza como sale de verdad, que es lo que hace falta para juzgar un
   * tema nuevo: el velo y el contraste del texto sobre la foto no se pueden
   * evaluar sobre un color liso.
   */
  let fondo: string | undefined

  /*
   * `?fondo=2` compone una imagen guardada en disco, sin generar nada.
   *
   * Es la herramienta que resolvió el partido al medio de las piezas claras.
   * Mientras el fondo se generaba en cada intento no había forma de saber si el
   * corte lo traía la foto o lo hacía el renderer, y cada prueba costaba una
   * llamada paga y veintitantos segundos. Con un archivo fijo la respuesta salió
   * en una: la misma foto entera salía partida al componerla, así que el
   * problema no estaba en el generador.
   *
   * El archivo NO viaja en el repo —está en `.gitignore`—: es una generación
   * cualquiera guardada a mano y pesa un mega. Se deja una y sirve para siempre.
   */
  const q = new URL(req.url).searchParams
  if (q.get("fondo") === "2") {
    const ruta = join(process.cwd(), "fixtures/fondo-claro.png")
    const local = await readFile(ruta).catch(() => null)
    if (!local) {
      return NextResponse.json(
        { error: `Falta ${ruta}. Guardá ahí cualquier fondo generado y volvé a pedir.` },
        { status: 404 }
      )
    }
    fondo = `data:image/png;base64,${local.toString("base64")}`
  } else if (q.get("fondo") === "1") {
    if (!hayMotor()) {
      return NextResponse.json(
        { error: "Falta OPENROUTER_API_KEY o GEMINI_API_KEY" },
        { status: 500 }
      )
    }
    const prompt = promptDeFondo(null, template.familia, template.id, placa.layout, tema)
    if (prompt) fondo = await generarFondo(prompt, "square", tema)
  }

  const fallas = revisarPlaca(placa)
  const jpeg = await renderizarPlaca({ ...placa, fondo })

  return new NextResponse(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store",
      "X-Placa-Fallas": fallas.map((f) => f.codigo).join(",") || "ninguna",
      "X-Placa-Eyebrow": placa.eyebrow ?? "",
      "X-Placa-Destacado": placa.destacado ?? "",
      "X-Placa-Titular": placa.titular.join(" "),
      "X-Placa-Tema": tema,
    },
  })
}
