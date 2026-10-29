import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"

import { PageBody, PageHeader } from "@/components/ui/page-header"
import { Equipo } from "@/components/agentes/equipo"
import { URL_EQUIPO } from "@/lib/agentes"
import { resumenDelEquipo } from "@/lib/agentes-server"
import { sesionConModulo } from "@/lib/sesion-server"

/**
 * El equipo de agentes: los que trabajan solos, en horario, y dejan propuestas.
 *
 * No confundir con los asistentes (el chat), que contestan cuando les hablan.
 * Acá nada se publica ni se aplica sin que alguien lo apruebe.
 *
 * El equipo viene leído desde acá y se le pasa a la caché del navegador: la
 * pantalla abre con las tarjetas, sin el spinner ni un segundo pedido a la API.
 */
export const metadata = { title: "Agentes · Accedra" }

export default async function AgentesPage() {
  const cache = new QueryClient()
  const s = await sesionConModulo(["marketing"])
  if (!("respuesta" in s)) {
    const equipo = await resumenDelEquipo().catch(() => null)
    // La misma clave que `consultaDelEquipo()` del cliente.
    if (equipo) cache.setQueryData(["marketing", "url", URL_EQUIPO], { equipo })
  }

  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Equipo de agentes"
        description="Trabajan solos una vez por semana y te dejan propuestas. Nada se publica ni se aplica hasta que lo aprobás."
      />
      <PageBody>
        <HydrationBoundary state={dehydrate(cache)}>
          <Equipo />
        </HydrationBoundary>
      </PageBody>
    </main>
  )
}
