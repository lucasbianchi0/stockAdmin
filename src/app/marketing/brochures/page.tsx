import { PageBody, PageHeader } from "@/components/ui/page-header"
import { BrochuresClient } from "@/components/marketing/brochures-client"

/**
 * El material que se le manda al cliente.
 *
 * La descripción de la cabecera fija para qué es esta pantalla: acá está la
 * versión vigente de cada PDF, y es la que se manda. Un brochure son tres cosas
 * —categoría, título y archivo— y la pantalla no muestra nada más, porque todo
 * lo demás se interponía entre la persona y el archivo que vino a buscar.
 */
export const metadata = { title: "Brochures · Accedra" }

export default function BrochuresPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Brochures"
        description="El material institucional en PDF, en su versión vigente. Cualquiera sube uno nuevo y cualquiera reemplaza el que quedó viejo."
        back={{ href: "/marketing", label: "Marketing" }}
      />
      <PageBody>
        <BrochuresClient />
      </PageBody>
    </main>
  )
}
