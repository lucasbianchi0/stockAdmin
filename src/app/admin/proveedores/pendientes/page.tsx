import { Pendientes } from "@/components/admin/reportes-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

export const metadata = { title: "Pendientes de pago · Accedra" }

export default function PendientesPagoPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Pendientes de pago"
        description="Lo que falta pagar, factura por factura — en pesos y en dólares, exportable"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <Pendientes tipo="compra" />
      </PageBody>
    </main>
  )
}
