import { PageBody, PageHeader } from "@/components/ui/page-header"
import { TableroClient } from "@/components/tickets/tablero-client"

/**
 * La ticketera del equipo.
 *
 * La descripción de la cabecera es la que fija para qué es esta pantalla: es el
 * tablero de todos, no la lista de tareas de cada uno. Todo lo que hay adentro
 * —que se vean los tickets de los demás, que el filtro por persona sea un
 * avatar y no un menú, que edite cualquiera— existe para sostener esa frase.
 */
export const metadata = { title: "Ticketera · Accedra" }

export default function TicketsPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Ticketera"
        description="Lo que el equipo tiene entre manos, en un tablero solo. Cualquiera anota, asigna y mueve; se ven los tickets de todos, y el avatar de arriba filtra los de cada uno."
      />
      <PageBody>
        <TableroClient />
      </PageBody>
    </main>
  )
}
