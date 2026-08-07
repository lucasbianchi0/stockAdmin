import { exigirModulo } from "@/lib/guard-api"
import { resetEnrichment } from "@/lib/products-cache"

export async function POST() {
  const sinPermiso = await exigirModulo("productos")
  if (sinPermiso) return sinPermiso

  resetEnrichment()
  return Response.json({ ok: true, message: "sync triggered" })
}
