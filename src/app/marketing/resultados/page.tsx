import { PageBody, PageHeader } from "@/components/ui/page-header"
import { ResultadosClient } from "@/components/marketing/resultados-client"

/**
 * Resultados — campañas, sitio y leads en una sola pantalla.
 *
 * Es la pregunta que hasta ahora había que responder abriendo tres lugares
 * distintos: de cada peso invertido, cuánta gente llegó, qué miró y quién
 * terminó escribiendo. Los tres datos ya vivían en esta misma base —el sitio
 * escribe `sessions`, `events` y `leads` acá al lado—; lo que faltaba era
 * calcularlos juntos.
 *
 * A diferencia de Informes, que es un PDF cerrado por mes, esta pantalla se
 * mueve: mira el período que se le pida y se actualiza sola. Informes sigue
 * siendo lo que se manda a una reunión; esto es lo que se abre para trabajar.
 */
export const metadata = { title: "Resultados · Accedra" }

export default function ResultadosPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Resultados"
        description="De cada peso invertido a la consulta que entró: campañas de Google, recorrido en el sitio y la bandeja de leads, todo del mismo período."
        back={{ href: "/marketing", label: "Marketing" }}
      />
      <PageBody>
        <ResultadosClient />
      </PageBody>
    </main>
  )
}
