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
        {/* `key` para que el editor se remonte al pasar de un presupuesto a
            otro. Sin esto, el flag que evita que un refetch pise lo tipeado
            sobrevive al cambio de id y el formulario muestra los datos del
            anterior. Se llega yendo y viniendo con el botón del navegador. */}
        <PresupuestoEditor key={id} id={id} />
      </PageBody>
    </main>
  )
}
