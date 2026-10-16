import { AsientosManualesClient } from "@/components/admin/asientos-manuales-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

export const metadata = { title: "Ajuste por inflación · Accedra" }

export default function AjusteInflacionPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Ajuste por inflación"
        description="El asiento de ajuste que calcula el estudio, cargado tal como lo mandan"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <AsientosManualesClient tipos={["ajuste_inflacion"]} />
      </PageBody>
    </main>
  )
}
