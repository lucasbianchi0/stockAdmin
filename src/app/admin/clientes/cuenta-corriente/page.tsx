import { CuentaCorrienteClient } from "@/components/admin/cuenta-corriente-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/** Cuenta corriente de un cliente. La gemela de la de proveedores. */
export const metadata = { title: "Cuenta corriente cliente · Accedra" }

export default function CuentaCorrienteClientePage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Cuenta corriente cliente"
        description="Cada factura y cada cobro del cliente, con el saldo corrido"
        back={{ href: "/admin/clientes", label: "Clientes" }}
      />
      <PageBody>
        <CuentaCorrienteClient tipo="cliente" />
      </PageBody>
    </main>
  )
}
