import { exigirModulo } from "@/lib/guard-api"
import { buildState, enrichedCache } from "@/lib/products-cache"

export async function GET() {
  const sinPermiso = await exigirModulo("productos")
  if (sinPermiso) return sinPermiso

  return Response.json({
    running: buildState.running,
    current: buildState.current,
    total: buildState.total,
    done: !buildState.running && enrichedCache !== null,
    names: buildState.names,
    lastSync: buildState.lastSync,
  })
}
