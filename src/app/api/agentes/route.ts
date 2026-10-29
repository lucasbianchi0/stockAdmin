import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { estadoDeLosAgentes } from "@/lib/agentes-server"

/** Los cuatro agentes: si corrieron y lo último que entregaron. */
export const GET = ruta("agentes GET", async () => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  return NextResponse.json({ agentes: await estadoDeLosAgentes() })
})
