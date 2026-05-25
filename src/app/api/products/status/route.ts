import { buildState, enrichedCache } from "@/lib/products-cache"

export async function GET() {
  return Response.json({
    running: buildState.running,
    current: buildState.current,
    total: buildState.total,
    done: !buildState.running && enrichedCache !== null,
    names: buildState.names,
    lastSync: buildState.lastSync,
  })
}
