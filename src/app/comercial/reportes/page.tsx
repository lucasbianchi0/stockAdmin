import { ReportesComercialClient } from "@/components/comercial/reportes-comercial-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"
import { accesoDeUsuario } from "@/lib/permisos"
import { createSupabaseServer } from "@/lib/supabase-server"

/**
 * Lo presupuestado, con su costo y su renta. Se arma solo de los presupuestos
 * cargados: no hay nada que completar a mano acá.
 */
export const metadata = { title: "Reportes comerciales · Accedra" }

export default async function ReportesComercialPage() {
  // Las facturas viven en Administración: sólo se enlazan para quien puede
  // abrirlas. Al resto un enlace lo mandaría a una pantalla sin acceso.
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const acceso = accesoDeUsuario(user)
  const veFacturas = acceso.admin || acceso.modulos.includes("administracion")

  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Reportes"
        description="Lo presupuestado por cliente, con costo, renta y porcentaje"
        back={{ href: "/comercial/presupuestos", label: "Comercial" }}
      />
      <PageBody>
        <ReportesComercialClient veFacturas={veFacturas} />
      </PageBody>
    </main>
  )
}
