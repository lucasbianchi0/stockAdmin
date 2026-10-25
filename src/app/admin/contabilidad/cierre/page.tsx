import { CierrePeriodosClient } from "@/components/admin/cierre-periodos-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

export const metadata = { title: "Cierre de períodos · Accedra" }

export default function CierrePeriodosPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Cierre de períodos"
        description="Bloquear los meses ya cerrados para que nadie cargue ni modifique nada hacia atrás"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <CierrePeriodosClient />
      </PageBody>
    </main>
  )
}
