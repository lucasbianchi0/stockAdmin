import { PresupuestosClient } from "@/components/comercial/presupuestos-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Presupuestos. La pantalla principal de Comercial: acá se entra a ver cómo
 * viene lo cotizado y a armar lo que sigue.
 */
export const metadata = { title: "Presupuestos · Accedra" }

export default function PresupuestosPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Presupuestos"
        description="Lo cotizado, con su planilla de costos y la propuesta que recibe el cliente"
      />
      <PageBody>
        <PresupuestosClient />
      </PageBody>
    </main>
  )
}
