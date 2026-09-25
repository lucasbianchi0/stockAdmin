import { PresupuestoEditor } from "@/components/comercial/presupuesto-editor"
import { PageBody, PageHeader } from "@/components/ui/page-header"

export const metadata = { title: "Presupuesto · Accedra" }

export default async function PresupuestoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Presupuesto"
        description="La planilla de costos. Lo que el cliente recibe sale de acá, sin los costos."
        back={{ href: "/comercial/presupuestos", label: "Presupuestos" }}
      />
      <PageBody>
        <PresupuestoEditor id={id} />
      </PageBody>
    </main>
  )
}
