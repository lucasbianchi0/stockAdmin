import { PromptsClient } from "@/components/contenido/prompts-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Los prompts de la generación de contenido.
 *
 * Muestra en modo lectura los que usa el sistema (plan, contenido, feed,
 * regenerar) y deja crear los propios, que quedan a nombre de quien los creó.
 */
export const metadata = { title: "Prompts de contenido · Accedra" }

export default function PromptsPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Prompts de contenido"
        description="Los prompts que usa la generación, y los que crea el equipo"
        back={{ href: "/contenido/calendario", label: "Calendario" }}
      />
      <PageBody>
        <PromptsClient />
      </PageBody>
    </main>
  )
}
