import { EnlaceStudio } from "@/components/contenido/calendario-client"
import { PlanesClient } from "@/components/contenido/planes-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"
import { DIAS_PLAN } from "@/lib/calendario-context"

/**
 * El home del calendario: la lista de planes.
 *
 * Esta ruta antes saltaba directo al único plan que podía existir. Ahora los
 * planes conviven y el detalle vive en /contenido/calendario/[id]; el plan que
 * ya estaba cargado no se perdió, queda a un click desde acá.
 */
export const metadata = { title: "Calendario de contenido · Accedra" }

export default function CalendarioPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Calendario de contenido"
        description={`Planes de ${DIAS_PLAN} días para LinkedIn, Instagram y Facebook como un conjunto`}
        back={{ href: "/marketing", label: "Marketing" }}
        actions={<EnlaceStudio />}
      />
      <PageBody>
        <PlanesClient />
      </PageBody>
    </main>
  )
}
