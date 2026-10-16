import { AsientosManualesClient } from "@/components/admin/asientos-manuales-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

export const metadata = { title: "Apertura y cierre · Accedra" }

export default function AperturaCierrePage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Apertura y cierre"
        description="El asiento de apertura que pasa el estudio y el cierre que propone el sistema"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <AsientosManualesClient tipos={["apertura", "cierre"]} />
      </PageBody>
    </main>
  )
}
