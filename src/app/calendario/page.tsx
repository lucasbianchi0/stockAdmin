import { PageBody, PageHeader } from "@/components/ui/page-header"
import { CalendarioClient } from "@/components/calendario/calendario-client"

/**
 * El calendario del equipo.
 *
 * Personas, agentes y procesos en la misma grilla. La descripción fija la
 * idea: lo que planifica una persona y lo que corre una máquina se miran
 * juntos, y de las máquinas no se ve sólo lo que prometen sino si corrieron.
 */
export const metadata = { title: "Calendario · Accedra" }

export default function CalendarioPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Calendario"
        description="Lo que hace cada persona y lo que corren los agentes y procesos, en una sola grilla. De las máquinas se ve si de verdad corrieron; tu avatar filtra lo tuyo."
      />
      <PageBody>
        <CalendarioClient />
      </PageBody>
    </main>
  )
}
