import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { firmaPng } from "@/lib/firma-correo-png"
import {
  FIRMA_DEFAULT,
  MODELOS,
  TONOS,
  type DatosFirma,
  type ModeloFirma,
  type Tono,
} from "@/lib/firma-correo"

import { NextResponse } from "next/server"

/**
 * La firma como PNG, para los lugares donde no entra HTML.
 *
 * WhatsApp, una diapositiva, un PDF, el pie de una propuesta. La firma de mail
 * sigue siendo el HTML que da el botón de Copiar: ahí la imagen sería peor, ver
 * el comentario de `firma-correo-png.tsx`.
 *
 * Es POST y no GET con los datos en la query por lo de siempre: el nombre, el
 * mail y el teléfono de una persona no van en una URL, que queda escrita en los
 * logs del servidor y en el historial del navegador.
 */

/** Se dibuja de cero cada vez, pero la fuente y los logos se leen del disco. */
export const maxDuration = 30

function texto(v: unknown) {
  return typeof v === "string" ? v : ""
}

/**
 * Qué modelos y tonos se aceptan sale de `MODELOS` y `TONOS`, no de una lista
 * escrita acá.
 *
 * La versión anterior comparaba contra los dos ids que existían el día que se
 * escribió la ruta, y el día que se agregó un modelo nuevo el PNG empezó a
 * devolver 400 sin que nada más fallara: la firma se veía bien en la previa y
 * solo el botón de bajar la imagen estaba roto. Derivarlo de la lista hace que
 * el próximo modelo funcione sin tocar este archivo.
 */
const esModelo = (v: unknown): v is ModeloFirma => MODELOS.some((m) => m.id === v)
const esTono = (v: unknown): v is Tono => TONOS.some((t) => t.id === v)

/** Lo que llega del cliente son datos, y ninguno es de fiar hasta acá. */
function limpiar(crudo: unknown): DatosFirma {
  const d = (crudo ?? {}) as Record<string, unknown>
  const campos = Object.keys(FIRMA_DEFAULT) as (keyof DatosFirma)[]
  const salida = {} as DatosFirma
  for (const k of campos) salida[k] = texto(d[k]).slice(0, 120)
  return salida
}

export const POST = ruta("firma-png POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
  }

  const { datos, modelo, tono } = (cuerpo ?? {}) as Record<string, unknown>
  if (!esModelo(modelo)) {
    return NextResponse.json({ error: "Modelo desconocido" }, { status: 400 })
  }
  if (!esTono(tono)) {
    return NextResponse.json({ error: "Tono desconocido" }, { status: 400 })
  }

  const png = await firmaPng(limpiar(datos), modelo, tono)

  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "content-length": String(png.byteLength),
      // Lleva los datos de una persona: no lo cachea nadie en el camino.
      "cache-control": "private, no-store",
    },
  })
})
