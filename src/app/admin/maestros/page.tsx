import { PlanCuentasClient } from "@/components/admin/plan-cuentas-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Datos maestros — el primer ítem del menú del pliego.
 *
 * Hoy tiene una sola cosa adentro, el plan de cuentas, que es la que el
 * documento pide por nombre. Es la raíz de la que cuelga todo lo demás: cada
 * factura, cada recibo y cada movimiento terminan apuntando a una de estas
 * cuentas, y el balance es la suma de lo que pasó por cada una.
 */
export const metadata = { title: "Datos maestros · Accedra" }

export default function MaestrosPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Datos maestros"
        description="El plan de cuentas del estudio contable, y el Excel con el que se actualiza"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <PlanCuentasClient />
      </PageBody>
    </main>
  )
}
