import { CargaReciboClient } from "@/components/admin/carga-recibo-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Alta de cobros de clientes. Cierra el circuito de ventas: sin esto las
 * facturas quedan pendientes para siempre y el saldo de las cuentas no se
 * mueve. Lo ya registrado se mira en `/admin/cobros/listado`.
 */
export const metadata = { title: "Cobros de facturas · Accedra" }

export default function CobrosPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Cobros de facturas"
        description="Elegí qué facturas cancela el recibo, con retenciones y acreditación"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <CargaReciboClient tipo="cobro" />
      </PageBody>
    </main>
  )
}
