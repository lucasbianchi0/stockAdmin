import { ContabilidadClient } from "@/components/admin/contabilidad-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Libro diario, mayor, sumas y saldos y los documentos que quedaron sin asentar.
 *
 * Nada de esto se carga a mano: los asientos los genera la base al guardar cada
 * factura, recibo y movimiento. Esta pantalla es solo la lectura.
 */
export const metadata = { title: "Contabilidad · Accedra" }

export default function ContabilidadPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Contabilidad"
        description="Los asientos que genera el sistema — diario, mayor y sumas y saldos, en pesos"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <ContabilidadClient />
      </PageBody>
    </main>
  )
}
