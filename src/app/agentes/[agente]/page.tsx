import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"
import { notFound } from "next/navigation"

import { FichaDeAgente } from "@/components/agentes/ficha"
import { AGENTES, claveDeSlug, urlDeFicha } from "@/lib/agentes"
import { detalleDeAgente } from "@/lib/agentes-server"
import { sesionConModulo } from "@/lib/sesion-server"

/** La ficha de un agente: quién es, qué entregó, qué aprobaste y cuándo corrió. */
export async function generateMetadata({ params }: { params: Promise<{ agente: string }> }) {
  const clave = claveDeSlug((await params).agente)
  return { title: clave ? `${AGENTES[clave].apodo} · Agentes · Accedra` : "Agentes · Accedra" }
}

/**
 * La bandeja viene leída desde acá, como el equipo: abre con las propuestas.
 * Si la tarjeta ya la precargó al pasar el mouse, la caché del navegador
 * se queda con la más nueva de las dos.
 */
export default async function AgentePage({ params }: { params: Promise<{ agente: string }> }) {
  const clave = claveDeSlug((await params).agente)
  if (!clave) notFound()

  const cache = new QueryClient()
  const s = await sesionConModulo(["marketing"])
  if (!("respuesta" in s)) {
    const agente = await detalleDeAgente(clave).catch(() => null)
    // La misma clave que `consultaDeFicha()` del cliente.
    if (agente) cache.setQueryData(["marketing", "url", urlDeFicha(clave)], { agente })
  }

  return (
    <HydrationBoundary state={dehydrate(cache)}>
      <FichaDeAgente clave={clave} />
    </HydrationBoundary>
  )
}
