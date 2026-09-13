import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { campanasEnVivo } from "@/lib/marketing/ads-server"
import {
  contarConversiones,
  leadsDelPeriodo,
  pegarLeads,
  resolverCampanas,
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
  const [sitio, leadsCrudos, adsCruda, anterior] = await Promise.all([
    sitioDelPeriodo(desde, hasta),
    leadsDelPeriodo(desde, hasta),
    campanasEnVivo(desde, hasta),
    totalesDelPeriodo(previo.desde, previo.hasta),
  ])

  // Va después del Promise.all y no adentro: necesita los leads ya traídos para
  // saber qué gclids resolver. Es una segunda vuelta a Google, pero sólo sobre
  // los días que efectivamente tienen un lead de Ads — casi siempre, ninguno.
  const leads = await resolverCampanas(leadsCrudos)

  const campanas = pegarLeads(adsCruda.campanas, leads)
  const ads = { ...adsCruda, campanas } as Resultados["ads"]

  const cuerpo: Resultados = {
    sitio,
    anterior,
    leads,
    ads,
    conversiones: contarConversiones(leads),
  }

  return NextResponse.json(cuerpo, {
    // Sin caché de HTTP, a propósito.
    //
    // Antes acá había `private, max-age=60` para no dispararle una consulta a
    // Google en cada clic. El problema es que `fetch` respeta esa cabecera, así
    // que el botón "Actualizar" —cuyo único trabajo es traer lo último AHORA—
    // podía devolver la misma respuesta guardada: el spinner giraba y no
    // cambiaba nada.
    //
    // El freno sigue existiendo, pero del lado del cliente: react-query tiene
    // `staleTime` de un minuto y no vuelve a pedir si los datos están frescos.
    // La diferencia es que ahí sí se distingue "volví a la pestaña" de "apreté
    // actualizar", y sólo el segundo fuerza el pedido.
    headers: { "Cache-Control": "no-store" },
  })
})
