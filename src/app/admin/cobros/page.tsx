import { PagosClient } from "@/components/admin/pagos-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Cobros de clientes. Cierra el circuito de ventas: sin esto las facturas
 * quedan pendientes para siempre y el saldo de las cuentas no se mueve.
 */
export const metadata = { title: "Cobros · Accedra" }

export default function CobrosPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Cobros"
        description="Recibos con imputación a facturas, retenciones y acreditación en la cuenta"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <PagosClient tipo="cobro" />
      </PageBody>
    </main>
  )
}
