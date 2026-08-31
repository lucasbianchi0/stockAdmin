import { CargaComprobanteClient } from "@/components/admin/carga-comprobante-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Alta de facturas de compra. La pantalla es el formulario: se entra a cargar
 * la factura que acaba de llegar, con la carga inteligente al lado por si viene
 * en PDF. Lo ya cargado se revisa en `/admin/compras/listado`.
 */
export const metadata = { title: "Facturas de compras · Accedra" }

export default function ComprasPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Facturas de compras"
        description="Cargá el comprobante recibido del proveedor, a mano o desde el PDF"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <CargaComprobanteClient tipo="compra" />
      </PageBody>
    </main>
  )
}
