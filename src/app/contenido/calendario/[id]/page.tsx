import { EnlaceStudio, PlanClient } from "@/components/contenido/calendario-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * El detalle de un plan — la pantalla que antes era todo el calendario.
 *
 * Es la misma de siempre: las publicaciones del plan, con sus tres opciones, la
 * elegida marcada y el contenido generado. Lo que cambió es que ahora es UN plan
 * entre varios, así que el "volver" lleva a la lista en vez de a Marketing.
 *
 * El título lo pone el cliente cuando termina de cargar: ponerlo acá obligaría a
 * pedir el plan dos veces, una en el servidor para la cabecera y otra en el
 * navegador para la pantalla.
 */
export const metadata = { title: "Plan de contenido · Accedra" }

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Plan de contenido"
        description="Las publicaciones del plan, con su formato y su contenido"
        back={{ href: "/contenido/calendario", label: "Calendario" }}
        actions={<EnlaceStudio />}
      />
      <PageBody>
        <PlanClient planId={id} />
      </PageBody>
    </main>
  )
}
