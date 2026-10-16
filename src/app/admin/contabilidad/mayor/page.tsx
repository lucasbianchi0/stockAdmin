import { ContabilidadClient } from "@/components/admin/contabilidad-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

export const metadata = { title: "Mayores · Accedra" }

export default function MayoresPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Mayores"
        description="Todo lo que pasó por una cuenta, con el saldo corrido — en pesos"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <ContabilidadClient vista="mayor" />
      </PageBody>
    </main>
  )
}
