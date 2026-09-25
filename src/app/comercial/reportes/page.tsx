import { ReportesComercialClient } from "@/components/comercial/reportes-comercial-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Lo presupuestado, con su costo y su renta. Se arma solo de los presupuestos
 * cargados: no hay nada que completar a mano acá.
 */
export const metadata = { title: "Reportes comerciales · Accedra" }

export default function ReportesComercialPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Reportes"
        description="Lo presupuestado por cliente, con costo, renta y porcentaje"
        back={{ href: "/comercial/presupuestos", label: "Comercial" }}
      />
      <PageBody>
        <ReportesComercialClient />
      </PageBody>
    </main>
  )
}
