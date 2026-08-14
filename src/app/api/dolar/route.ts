import { exigirAlgunModulo } from "@/lib/guard-api"
import { guardarCotizacion } from "@/lib/admin/cotizaciones-server"

let cache: { venta: number; updatedAt: string; fetchedAt: number } | null = null
const TTL_MS = 60 * 60 * 1000

/** Hoy en la zona horaria de Buenos Aires, que es la que define de qué día es la
 *  cotización. Con UTC, todo lo consultado después de las 21 h se archivaría con
 *  la fecha de mañana. */
function hoyEnArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export async function GET() {
  // Dólar oficial venta (Banco Nación). Lo consumen dos módulos: productos, para
  // armar precios, y administración, para valuar comprobantes bimonetarios. Es
  // el mismo número a propósito — si cada uno tuviera el suyo, la factura de un
  // cliente no cerraría contra la cotización con la que se le vendió.
  const sinPermiso = await exigirAlgunModulo(["productos", "administracion"])
  if (sinPermiso) return sinPermiso

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

    // Se archiva la cotización del día. Es lo que arma el histórico con el uso
    // normal del sistema: sin él, una factura cargada con fecha de la semana
    // pasada no se puede valuar en dólares nunca más. No se espera el resultado
    // —si la escritura falla, la pantalla igual tiene que recibir su número.
    void guardarCotizacion(hoyEnArgentina(), Number(data.venta), Number(data.compra))

    return Response.json({ venta: data.venta, updatedAt: data.fechaActualizacion, cached: false })
  } catch (err) {
    console.error("[/api/dolar]", err)
    if (cache) {
      return Response.json({ venta: cache.venta, updatedAt: cache.updatedAt, cached: true, stale: true })
    }
    return Response.json({ error: "No se pudo obtener la cotización del dólar" }, { status: 500 })
  }
}
