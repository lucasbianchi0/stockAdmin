import { ComprobantesClient } from "@/components/admin/comprobantes-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Las facturas de venta ya emitidas. Vive acá y no en `/admin/ventas` porque
 * esa pantalla pasó a ser el alta: son dos trabajos distintos —registrar una
 * factura nueva, revisar y confirmar las que están— y compartían una pantalla
 * en la que el primero pagaba el precio del segundo.
 */
export const metadata = { title: "Facturas de ventas emitidas · Accedra" }

export default function VentasListadoPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Facturas de ventas emitidas"
        description="Comprobantes emitidos, en pesos y en dólares, con su vencimiento y su saldo"
        back={{ href: "/admin/ventas", label: "Facturas de ventas" }}
      />
      <PageBody>
        <ComprobantesClient tipo="venta" />
      </PageBody>
    </main>
  )
}
