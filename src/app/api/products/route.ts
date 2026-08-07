import { exigirModulo } from "@/lib/guard-api"
import { getProducts, buildState } from "@/lib/products-cache"

export async function GET() {
  const sinPermiso = await exigirModulo("productos")
  if (sinPermiso) return sinPermiso

  try {
    const products = await getProducts()
    return Response.json({
      products,
      enriched: true,
      syncing: buildState.running,
      lastSync: buildState.lastSync,
    })
  } catch (err) {
    console.error("[/api/products]", err)
    return Response.json({ error: "Error loading products" }, { status: 500 })
  }
}
