import { ComprobantesClient } from "@/components/admin/comprobantes-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Facturas de compra. Misma pantalla y mismo motor que ventas — comparten tabla
 * y componente — con el signo invertido: acá el saldo es lo que debemos.
 */
export const metadata = { title: "Facturas de compras · Accedra" }

export default function ComprasPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Facturas de compras"
        description="Comprobantes recibidos de proveedores, con percepciones y saldo pendiente"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <ComprobantesClient tipo="compra" />
      </PageBody>
    </main>
  )
}
