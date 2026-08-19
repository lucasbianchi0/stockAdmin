import { PageBody, PageHeader } from "@/components/ui/page-header"
import { BrochuresClient } from "@/components/marketing/brochures-client"

/**
 * El material que se le manda al cliente.
 *
 * La descripción de la cabecera es la que fija para qué es esta pantalla: acá
 * está la versión vigente, y es la que se manda. Todo lo que hay adentro —el
 * número de versión, el contador de envíos, el "cuándo usar"— existe para
 * sostener esa frase.
 */
export const metadata = { title: "Brochures · Accedra" }

export default function BrochuresPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Brochures"
        description="Las propuestas y el material institucional en PDF, en su versión vigente. Cualquiera sube uno nuevo y cualquiera reemplaza el que quedó viejo."
        back={{ href: "/marketing", label: "Marketing" }}
      />
      <PageBody>
        <BrochuresClient />
      </PageBody>
    </main>
  )
}
