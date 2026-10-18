import { NextResponse } from "next/server"

import { exigirAdmin } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { buscarCatalogo } from "@/lib/admin/stock-server"

/** Productos del catálogo de Distecna para dar de alta un ítem: nombre y descripción, sin precio. */
export const GET = ruta("stock catalogo GET", async (req: Request) => {
  const { error } = await exigirAdmin()
  if (error) return error
  const q = new URL(req.url).searchParams.get("q") ?? ""
  return NextResponse.json({ productos: await buscarCatalogo(q) })
})
