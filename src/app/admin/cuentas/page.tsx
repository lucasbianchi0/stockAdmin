import { CuentasClient } from "@/components/admin/cuentas-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Caja y bancos: el libro mayor del dinero. Los movimientos de cobros y pagos
 * llegan solos desde sus recibos; acá se cargan los que no tienen comprobante
 * —gastos, transferencias, ajustes— y se concilia contra el extracto.
 */
export const metadata = { title: "Caja y bancos · Accedra" }

export default function CuentasPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Caja y bancos"
        description="Saldos y movimientos de cada cuenta, con gastos, transferencias y conciliación"
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        <CuentasClient />
      </PageBody>
    </main>
  )
}
