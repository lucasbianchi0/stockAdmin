import { EntidadesClient } from "@/components/admin/entidades-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Maestro de clientes. Primera pantalla del circuito de ventas: sin una ficha
 * acá no se puede cargar una factura, y por eso va antes que todo lo demás.
 */
export const metadata = { title: "Clientes · Accedra" }

export default function ClientesPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Clientes"
        description="La ficha de cada cliente. Solo la razón social es obligatoria."
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <EntidadesClient tipo="cliente" />
      </PageBody>
    </main>
  )
}
