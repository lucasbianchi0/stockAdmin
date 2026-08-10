import { EntidadesClient } from "@/components/admin/entidades-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Maestro de proveedores. Misma pantalla que clientes —comparten componente— con
 * dos diferencias: no hay vendedor asignado y el CUIT es único dentro de este
 * módulo, no contra clientes. Una empresa puede ser las dos cosas.
 */
export const metadata = { title: "Proveedores · Accedra" }

export default function ProveedoresPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Proveedores"
        description="La ficha de cada proveedor, nacional o del exterior"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <EntidadesClient tipo="proveedor" />
      </PageBody>
    </main>
  )
}
