import { CuentaCorrienteClient } from "@/components/admin/cuenta-corriente-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Cuenta corriente de un proveedor. Era la solapa «estado de cuenta» del módulo
 * de reportes; vive acá porque siempre se la mira desde un proveedor concreto.
 *
 * La ruta es estática y convive con `/admin/proveedores/[id]`: Next resuelve el
 * segmento literal antes que el dinámico, así que "cuenta-corriente" nunca se
 * lee como el id de una ficha.
 */
export const metadata = { title: "Cuenta corriente proveedor · Accedra" }

export default function CuentaCorrienteProveedorPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Cuenta corriente proveedor"
        description="Cada comprobante y cada pago del proveedor, con el saldo corrido"
        back={{ href: "/admin/proveedores", label: "Proveedores" }}
      />
      <PageBody>
        <CuentaCorrienteClient tipo="proveedor" />
      </PageBody>
    </main>
  )
}
