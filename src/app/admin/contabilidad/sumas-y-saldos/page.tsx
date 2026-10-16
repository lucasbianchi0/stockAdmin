import { ContabilidadClient } from "@/components/admin/contabilidad-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

export const metadata = { title: "Sumas y saldos · Accedra" }

export default function SumasYSaldosPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Sumas y saldos"
        description="El estado de todas las cuentas y si la partida doble cuadra — en pesos"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <ContabilidadClient vista="saldos" />
      </PageBody>
    </main>
  )
}
