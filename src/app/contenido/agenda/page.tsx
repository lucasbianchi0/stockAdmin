import { AgendaClient, EnlaceBanco } from "@/components/contenido/agenda-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Calendario de contenido: qué se publica y qué día.
 *
 * La segunda mitad del flujo. Sólo entran piezas que ya están completas y
 * aprobadas, así que abrir un día del calendario no es empezar a trabajar: es
 * copiar el texto y bajar la imagen.
 */
export const metadata = { title: "Calendario de contenido · Accedra" }

export default function AgendaPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Calendario de contenido"
        description="Lo que ya está programado, listo para copiar y publicar"
        back={{ href: "/marketing", label: "Marketing" }}
        actions={<EnlaceBanco />}
      />
      <PageBody>
        <AgendaClient />
      </PageBody>
    </main>
  )
}
