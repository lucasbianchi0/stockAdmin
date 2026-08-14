import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { slugsArchivados } from "@/lib/templates-server"

/**
 * Los slugs archivados, nada más.
 *
 * Las recetas ya viajan en el bundle del cliente, así que mandar los templates
 * enteros sería repetirlos: con la lista de los que están fuera de circulación
 * alcanza para que la pantalla filtre sola.
 */
export async function GET() {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  return NextResponse.json({ archivados: [...(await slugsArchivados())] })
}
