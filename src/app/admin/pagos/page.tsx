import { PagosClient } from "@/components/admin/pagos-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Pagos a proveedores. Misma pantalla y mismo motor que cobros — comparten
 * tabla y componente — con el movimiento invertido: acá la plata sale.
 */
export const metadata = { title: "Pagos de facturas · Accedra" }

export default function PagosPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Pagos de facturas"
        description="Órdenes de pago con imputación, retención de ganancias y medio de pago"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <PagosClient tipo="pago" />
      </PageBody>
    </main>
  )
}
