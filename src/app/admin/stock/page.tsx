import { StockClient } from "@/components/admin/stock-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"
import { SoloAdministradores, esAdmin } from "@/lib/admin/solo-admin"

/**
 * Stock: control de cantidades, en dólares a precio de compra. No toca la
 * contabilidad —lo que la toca es la factura—. Sólo lo ven los administradores.
 */
export const metadata = { title: "Stock · Accedra" }

export default async function StockPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Stock"
        description="Cuánto hay de cada cosa y cuánto costó, en dólares a precio de compra. Sólo controla cantidades: no genera asientos."
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>{(await esAdmin()) ? <StockClient /> : <SoloAdministradores />}</PageBody>
    </main>
  )
}
