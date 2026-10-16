import { Pendientes } from "@/components/admin/reportes-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

export const metadata = { title: "Pendientes de cobro · Accedra" }

export default function PendientesCobroPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Pendientes de cobro"
        description="Lo que falta cobrar, factura por factura — en pesos y en dólares, exportable"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <Pendientes tipo="venta" />
      </PageBody>
    </main>
  )
}
