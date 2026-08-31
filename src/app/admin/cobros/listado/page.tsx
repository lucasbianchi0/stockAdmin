import { PagosClient } from "@/components/admin/pagos-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/** Los cobros ya registrados. Ver el porqué de la separación en el listado de ventas. */
export const metadata = { title: "Cobros registrados · Accedra" }

export default function CobrosListadoPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Cobros registrados"
        description="Recibos con imputación a facturas, retenciones y acreditación en la cuenta"
        back={{ href: "/admin/cobros", label: "Cobros de facturas" }}
      />
      <PageBody>
        <PagosClient tipo="cobro" />
      </PageBody>
    </main>
  )
}
