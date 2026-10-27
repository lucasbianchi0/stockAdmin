import { PagoVisaClient } from "@/components/admin/pago-visa-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Pago de tarjetas VISA (pedido del estudio, 26/10/2026): las facturas de
 * compra marcadas VISA se cancelan juntas cuando el banco debita el resumen.
 */
export const metadata = { title: "Pago de tarjetas VISA · Accedra" }

export default function PagoVisaPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Pago de tarjetas VISA"
        description="Las facturas cargadas como VISA, para cancelarlas con el débito del resumen"
        back={{ href: "/admin/pagos", label: "Pago de facturas" }}
      />
      <PageBody>
        <PagoVisaClient />
      </PageBody>
    </main>
  )
}
