import { PageBody, PageHeader } from "@/components/ui/page-header"
import { EventosClient } from "@/components/marketing/eventos-client"

/**
 * Eventos del sitio y sus certificados.
 *
 * Como el popup, lo que se publica acá sale en accedra.com.ar sin un deploy: la
 * sección de eventos del sitio lee esta misma tabla.
 */
export const metadata = { title: "Eventos · Accedra" }

export default function EventosPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Eventos"
        description="Workshops, webinars y capacitaciones. Lo publicado sale en la sección de eventos de accedra.com.ar; cuando el evento pasa, desde la ficha se emiten los certificados de asistencia."
        back={{ href: "/marketing", label: "Marketing" }}
      />
      <PageBody>
        <EventosClient />
      </PageBody>
    </main>
  )
}
