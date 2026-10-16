import { ContabilidadClient } from "@/components/admin/contabilidad-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

export const metadata = { title: "Sin asentar · Accedra" }

export default function SinAsentarPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Sin asentar"
        description="Documentos que están en los saldos pero todavía no en el mayor"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <ContabilidadClient vista="pendientes" />
      </PageBody>
    </main>
  )
}
