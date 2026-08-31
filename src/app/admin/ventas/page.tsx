import { CargaComprobanteClient } from "@/components/admin/carga-comprobante-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Alta de facturas de venta. La pantalla es el formulario, igual que en
 * compras; lo ya emitido se revisa en `/admin/ventas/listado`.
 *
 * El sistema registra lo que ya se emitió en AFIP: no numera ni factura, porque
 * dos sistemas peleándose por el correlativo es un problema que no vale la pena
 * tener.
 */
export const metadata = { title: "Facturas de ventas · Accedra" }

export default function VentasPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Facturas de ventas"
        description="Registrá el comprobante que ya se emitió, a mano o desde el PDF"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <CargaComprobanteClient tipo="venta" />
      </PageBody>
    </main>
  )
}
