import { SubdiarioClient } from "@/components/admin/subdiario-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

export const metadata = { title: "Subdiario IVA Ventas · Accedra" }

export default function SubdiarioVentasPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Subdiario IVA Ventas"
        description="Las facturas de venta del período con su IVA débito por alícuota — en pesos, para copiar al libro"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <SubdiarioClient tipo="venta" />
      </PageBody>
    </main>
  )
}
