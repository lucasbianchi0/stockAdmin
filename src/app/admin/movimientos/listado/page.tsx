import { MovimientosClient } from "@/components/admin/movimientos-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Los movimientos sin factura ya cargados, cruzando todas las cuentas. Es lo
 * único que el extracto de Caja y bancos no contesta, porque el extracto es de
 * una cuenta por vez.
 */
export const metadata = { title: "Movimientos cargados · Accedra" }

export default function MovimientosListadoPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Movimientos cargados"
        description="Todo lo que se movió sin factura, en todas las cuentas"
        back={{ href: "/admin/movimientos", label: "Otros movimientos" }}
      />
      <PageBody>
        <MovimientosClient />
      </PageBody>
    </main>
  )
}
