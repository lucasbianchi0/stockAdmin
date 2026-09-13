/**
 * Las funciones de la base → lo que consume la pantalla de Resultados.
 *
 * Solo servidor: importa el cliente con service key. La aritmética del embudo no
 * está acá sino en `resultados_sitio` y `resultados_leads`
 * (supabase/migrations/20260913_05_resultados.sql). Este archivo traduce y nada
 * más — si un número no cierra, se audita corriendo la función en SQL, no
 * leyendo TypeScript.
 */

import { supabase } from "@/lib/supabase"
import { campanaDeClics } from "@/lib/marketing/ads-server"
import type { Campana, Conversiones, Lead, Sitio, Totales } from "@/lib/marketing/resultados"

/** El embudo, la serie y las tablas del período. */
export async function sitioDelPeriodo(desde: string, hasta: string): Promise<Sitio> {
  const { data, error } = await supabase.rpc("resultados_sitio", {
    p_desde: desde,
    p_hasta: hasta,
  })

  if (error) throw new Error(`resultados_sitio: ${error.message}`)
  return data as Sitio
}

/**
 * Sólo los totales, para la comparación contra el período anterior.
 *
 * Descarta el resto de lo que devuelve la función. Podría hacerse una consulta
 * más chica, pero serían dos definiciones del mismo cálculo y el día que una
 * cambie nadie va a acordarse de la otra — que es exactamente cómo aparece un
 * "vs mes anterior" que no coincide con el mes anterior cuando lo mirás.
 */
export async function totalesDelPeriodo(desde: string, hasta: string): Promise<Totales | null> {
  try {
    const sitio = await sitioDelPeriodo(desde, hasta)
    return sitio.totales
  } catch (e) {
    // La comparación es un adorno útil, no el dato. Si falla, la pantalla se
    // dibuja igual sin las flechitas.
    console.error("[resultados anterior]", e)
    return null
  }
}

/** La bandeja completa del período, del más nuevo al más viejo. */
export async function leadsDelPeriodo(desde: string, hasta: string): Promise<Lead[]> {
  const { data, error } = await supabase.rpc("resultados_leads", {
    p_desde: desde,
    p_hasta: hasta,
  })

  if (error) throw new Error(`resultados_leads: ${error.message}`)
  return (data ?? []) as Lead[]
}

/**
 * Le pega a cada campaña sus leads.
 *
 * ── LA LIMITACION, DICHA EN VOZ ALTA ──
 *
 * Sólo se pueden atribuir a una campaña puntual los leads que traen
 * `utm_campaign`. Con el etiquetado automático de Google —que es el que está
 * puesto— lo que llega es `gclid` y no UTMs, así que hoy esta columna va a dar
 * cero casi siempre aunque el lead sí venga de Ads.
 *
 * El total de leads de Ads, ese sí es exacto: sale de contar los que tienen
 * `gclid`, y es el número que muestra el embudo. Lo que falta es repartirlo
 * entre campañas, y para eso hay dos caminos: agregar UTMs a las URLs finales de
 * los anuncios (cinco minutos, y el gclid sigue funcionando igual), o resolver
 * cada gclid contra `click_view` de la API (sólo 90 días y una consulta por día).
 * El primero es el que corresponde.
 */
export function pegarLeads(campanas: Campana[], leads: Lead[]): Campana[] {
  const porCampana = new Map<string, number>()
  for (const l of leads) {
    if (l.equipo || !l.campana) continue
    const clave = l.campana.trim().toLowerCase()
    porCampana.set(clave, (porCampana.get(clave) ?? 0) + 1)
  }

  return campanas.map((c) => ({
    ...c,
    leads: porCampana.get(c.nombre.trim().toLowerCase()) ?? 0,
  }))
}

/**
 * Le pone a cada lead de Ads la campaña y el grupo que lo trajeron.
 *
 * Reemplaza al `utm_campaign` que hoy no llega: con el etiquetado automático de
 * Google lo que viaja es el `gclid`, no los UTMs. Se resuelve contra
 * `click_view`, que es de sólo lectura y no obliga a tocar ningún anuncio en
 * producción — ver el comentario largo en `campanaDeClics`.
 *
 * Nunca lanza: si Google no contesta, los leads vuelven como estaban. Saber de
 * qué campaña vino un lead es valioso, pero no vale romper la bandeja entera.
 */
export async function resolverCampanas(leads: Lead[]): Promise<Lead[]> {
  const paraResolver = leads
    .filter((l) => l.gclid && !l.campana)
    .map((l) => ({ gclid: l.gclid as string, fecha: l.created_at }))

  if (paraResolver.length === 0) return leads

  try {
    const mapa = await campanaDeClics(paraResolver)
    if (mapa.size === 0) return leads

    return leads.map((l) => {
      const r = l.gclid ? mapa.get(l.gclid) : undefined
      return r ? { ...l, campana: l.campana ?? r.campana, grupo: r.grupo } : l
    })
  } catch (e) {
    console.error("[resolverCampanas]", e)
    return leads
  }
}

/**
 * La cola de conversiones pendientes de informarle a Google.
 *
 * Un lead entra en la cola si tiene `gclid`, no es del equipo y todavía no se
 * subió. El filtro del equipo es el que importa: subir una prueba nuestra le
 * enseña a Smart Bidding a comprar clics que nunca fueron clientes, y una vez
 * que Google la acepta no se puede deshacer.
 */
export function contarConversiones(leads: Lead[]): Conversiones {
  const cola = leads.filter((l) => l.gclid && !l.equipo && !l.subida_en)
  return {
    pendientes: cola.length,
    ganados: cola.filter((l) => l.estado === "ganado").length,
    subidas: leads.filter((l) => l.subida_en).length,
  }
}
