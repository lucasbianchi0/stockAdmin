import { BancoClient, EnlaceAgenda } from "@/components/contenido/banco-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"
import { PIEZAS_POR_LOTE } from "@/lib/banco-context"

/**
 * Generación de contenido: el banco de piezas.
 *
 * Es la primera mitad del flujo. Acá se produce y se revisa; la fecha se decide
 * en la segunda, cuando la pieza ya convenció. Separarlas es todo el punto: el
 * calendario deja de ser el lugar donde se descubre que una pieza no servía.
 */
export const metadata = { title: "Generación de contenido · Accedra" }

export default function GeneracionPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Generación de contenido"
        description={`Lotes de ${PIEZAS_POR_LOTE} piezas con su imagen y su copy. Se revisan acá y se programan después`}
        back={{ href: "/marketing", label: "Marketing" }}
        actions={<EnlaceAgenda />}
      />
      <PageBody>
        <BancoClient />
      </PageBody>
    </main>
  )
}
