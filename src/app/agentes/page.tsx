import { PageBody, PageHeader } from "@/components/ui/page-header"
import { AgentesClient } from "@/components/agentes/agentes-client"

/**
 * Los agentes: los que trabajan solos, en horario, y dejan propuestas.
 *
 * No confundir con los asistentes (el chat), que contestan cuando les hablan.
 * Acá nada se publica ni se aplica sin que alguien lo apruebe.
 */
export const metadata = { title: "Agentes · Accedra" }

export default function AgentesPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Agentes"
        description="Trabajan solos una vez por semana y dejan acá lo que proponen. Nada se publica ni se aplica hasta que lo aprobás."
      />
      <PageBody width="narrow">
        <AgentesClient />
      </PageBody>
    </main>
  )
}
