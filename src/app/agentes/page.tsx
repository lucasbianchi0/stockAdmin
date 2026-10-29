import { PageBody, PageHeader } from "@/components/ui/page-header"
import { Equipo } from "@/components/agentes/equipo"

/**
 * El equipo de agentes: los que trabajan solos, en horario, y dejan propuestas.
 *
 * No confundir con los asistentes (el chat), que contestan cuando les hablan.
 * Acá nada se publica ni se aplica sin que alguien lo apruebe.
 */
export const metadata = { title: "Agentes · Accedra" }

export default function AgentesPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Equipo de agentes"
        description="Trabajan solos una vez por semana y te dejan propuestas. Nada se publica ni se aplica hasta que lo aprobás."
      />
      <PageBody>
        <Equipo />
      </PageBody>
    </main>
  )
}
