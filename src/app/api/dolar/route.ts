let cache: { venta: number; updatedAt: string; fetchedAt: number } | null = null
const TTL_MS = 60 * 60 * 1000

export async function GET() {
  try {
    if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
      return Response.json({ venta: cache.venta, updatedAt: cache.updatedAt, cached: true })
    }
    const res = await fetch("https://dolarapi.com/v1/dolares/oficial", {
      next: { revalidate: 3600 },
    })
    if (!res.ok) throw new Error(`dolarapi status ${res.status}`)
    const data = await res.json()
    cache = { venta: data.venta, updatedAt: data.fechaActualizacion, fetchedAt: Date.now() }
    return Response.json({ venta: data.venta, updatedAt: data.fechaActualizacion, cached: false })
  } catch (err) {
    console.error("[/api/dolar]", err)
    if (cache) {
      return Response.json({ venta: cache.venta, updatedAt: cache.updatedAt, cached: true, stale: true })
    }
    return Response.json({ error: "No se pudo obtener la cotización del dólar" }, { status: 500 })
  }
}
