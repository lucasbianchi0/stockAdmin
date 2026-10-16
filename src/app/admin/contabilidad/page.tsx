import { ContabilidadClient } from "@/components/admin/contabilidad-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * 5.2 Libro diario. Se queda en `/admin/contabilidad` y no en una subruta para
 * que los enlaces de antes —el buscador, el impacto de cada documento— sigan
 * cayendo en el mismo lugar.
 *
 * Nada de esto se carga a mano: los asientos los genera la base al guardar cada
 * factura, recibo y movimiento. Esta pantalla es solo la lectura.
 */
export const metadata = { title: "Libro diario · Accedra" }

export default function LibroDiarioPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Libro diario"
        description="Cada asiento como lo generó el sistema, o resumido por mes para copiar al libro — en pesos"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <ContabilidadClient vista="diario" />
      </PageBody>
    </main>
  )
}
