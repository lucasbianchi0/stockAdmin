import { ComprobantesClient } from "@/components/admin/comprobantes-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Facturas de venta. El sistema registra lo que ya se emitió en AFIP: no numera
 * ni factura, porque dos sistemas peleándose por el correlativo es un problema
 * que no vale la pena tener.
 */
export const metadata = { title: "Facturas de venta · Accedra" }

export default function VentasPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Facturas de venta"
        description="Comprobantes emitidos, en pesos y en dólares, con su vencimiento y su saldo"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <ComprobantesClient tipo="venta" />
      </PageBody>
    </main>
  )
}
