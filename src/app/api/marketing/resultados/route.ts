import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { campanasEnVivo } from "@/lib/marketing/ads-server"
import {
  leadsDelPeriodo,
  pegarLeads,
  sitioDelPeriodo,
  totalesDelPeriodo,
} from "@/lib/marketing/resultados-server"
import {
  PERIODOS,
  rangoAnterior,
  rangoDe,
  type Periodo,
  type Resultados,
} from "@/lib/marketing/resultados"

/**
 * Todo lo que dibuja el panel de Resultados, en un solo pedido.
 *
 * ── POR QUE UNA SOLA RUTA Y NO CUATRO ──
 *
 * Las cuatro pestañas son vistas del mismo período y tienen que hablar del mismo
 * instante. Con cuatro endpoints, un lead que entra entre el segundo y el
 * tercero hace que el total del embudo no coincida con la lista de abajo, y
 * nadie va a sospechar de una carrera: van a sospechar de la aritmética. Además,
 * cambiar de pestaña sería una espera cada vez por datos que ya estaban.
 *
 * ── POR QUE GOOGLE ADS NO PUEDE ROMPER ESTO ──
 *
 * Es la única fuente que está afuera, y se cae: el token de OAuth se vence cada
 * siete días mientras la app siga sin publicar. El embudo del sitio y la bandeja
 * de leads no dependen de Google para nada, así que el fallo viaja como dato
 * dentro de `ads` y las otras tres pestañas siguen andando.
 */
export const GET = ruta("resultados GET", async (req) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const url = new URL(req.url)
  const pedido = url.searchParams.get("periodo") ?? "30d"
  const periodo = (PERIODOS as readonly string[]).includes(pedido) ? (pedido as Periodo) : "30d"

  const { desde, hasta } = rangoDe(periodo)
  const previo = rangoAnterior(periodo)

  // En paralelo: el sitio y los leads salen de la misma base, Ads de afuera.
  // Encadenarlos sumaría el peor caso de Google al tiempo de carga de todo.
  const [sitio, leads, adsCruda, anterior] = await Promise.all([
    sitioDelPeriodo(desde, hasta),
    leadsDelPeriodo(desde, hasta),
    campanasEnVivo(desde, hasta),
    totalesDelPeriodo(previo.desde, previo.hasta),
  ])

  const campanas = pegarLeads(adsCruda.campanas, leads)
  const ads = { ...adsCruda, campanas } as Resultados["ads"]

  const cuerpo: Resultados = { sitio, anterior, leads, ads }

  return NextResponse.json(cuerpo, {
    // El panel no es tiempo real y los datos de Google se mueven despacio. Un
    // minuto de caché evita que abrir y cerrar pestañas dispare una consulta a
    // la API por cada clic.
    headers: { "Cache-Control": "private, max-age=60" },
  })
})
