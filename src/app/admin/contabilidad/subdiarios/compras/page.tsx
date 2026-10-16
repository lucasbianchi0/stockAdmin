import { SubdiarioClient } from "@/components/admin/subdiario-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

export const metadata = { title: "Subdiario IVA Compras · Accedra" }

export default function SubdiarioComprasPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Subdiario IVA Compras"
        description="Las facturas de compra del período con su IVA crédito por alícuota — en pesos, para copiar al libro"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <SubdiarioClient tipo="compra" />
      </PageBody>
    </main>
  )
}
