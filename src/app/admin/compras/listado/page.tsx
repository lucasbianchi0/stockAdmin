import { ComprobantesClient } from "@/components/admin/comprobantes-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Las facturas de compra ya cargadas. Vive acá y no en `/admin/compras` porque
 * esa pantalla pasó a ser el alta: son dos trabajos distintos —cargar una
 * factura nueva, revisar y confirmar las que están— y compartían una pantalla
 * en la que el primero pagaba el precio del segundo.
 */
export const metadata = { title: "Facturas de compras cargadas · Accedra" }

export default function ComprasListadoPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Facturas de compras cargadas"
        description="Comprobantes recibidos de proveedores, con percepciones y saldo pendiente"
        back={{ href: "/admin/compras", label: "Facturas de compras" }}
      />
      <PageBody>
        <ComprobantesClient tipo="compra" />
      </PageBody>
    </main>
  )
}
