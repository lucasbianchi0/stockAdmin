import { ReportesClient } from "@/components/admin/reportes-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Los cuatro reportes operativos del pliego, en una pantalla con pestañas:
 * pendientes de cobro, pendientes de pago, saldos por cuenta y estado de cuenta.
 */
export const metadata = { title: "Reportes · Accedra" }

export default function ReportesPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Reportes"
        description="Pendientes, saldos y estados de cuenta — en pesos y en dólares, exportables"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <ReportesClient />
      </PageBody>
    </main>
  )
}
