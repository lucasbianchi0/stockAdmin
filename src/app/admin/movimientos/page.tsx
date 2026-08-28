import { MovimientosClient } from "@/components/admin/movimientos-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Otros movimientos — el 2.3.B del pliego, adentro del módulo de proveedores.
 *
 * Va al lado de los pagos de facturas y no adentro de Caja y bancos porque es
 * ahí donde lo puso el organigrama, y el organigrama tiene razón: las dos son la
 * misma pregunta —«¿qué plata salió?»— con y sin factura de por medio. Quien
 * paga los sueldos y quien paga a los proveedores es la misma persona en el
 * mismo rato.
 */
export const metadata = { title: "Otros movimientos · Accedra" }

export default function MovimientosPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Otros movimientos"
        description="Todo movimiento de dinero que no pasa por una factura, en cualquier cuenta"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <MovimientosClient />
      </PageBody>
    </main>
  )
}
