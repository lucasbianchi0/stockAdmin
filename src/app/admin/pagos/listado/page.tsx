import { PagosClient } from "@/components/admin/pagos-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/** Los pagos ya registrados. Ver el porqué de la separación en el listado de compras. */
export const metadata = { title: "Pagos registrados · Accedra" }

export default function PagosListadoPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Pagos registrados"
        description="Órdenes de pago con imputación, retención de ganancias y medio de pago"
        back={{ href: "/admin/pagos", label: "Pagos de facturas" }}
      />
      <PageBody>
        <PagosClient tipo="pago" />
      </PageBody>
    </main>
  )
}
