import { CargaReciboClient } from "@/components/admin/carga-recibo-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Alta de pagos a proveedores. Igual que compras: la pantalla es el formulario
 * de la orden de pago, y lo ya registrado se mira en `/admin/pagos/listado`.
 */
export const metadata = { title: "Pagos de facturas · Accedra" }

export default function PagosPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Pagos de facturas"
        description="Elegí qué comprobantes cancela el pago, con retenciones y medio de pago"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <CargaReciboClient tipo="pago" />
      </PageBody>
    </main>
  )
}
