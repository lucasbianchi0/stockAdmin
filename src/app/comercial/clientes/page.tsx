import { EntidadesClient } from "@/components/admin/entidades-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Clientes, desde Comercial.
 *
 * Es la MISMA pantalla y la misma tabla que `/admin/clientes`, con otro
 * encabezado. No es una copia ni una sincronización: un cliente creado acá
 * aparece en Administración en el mismo instante, y una razón social corregida
 * allá vale acá, porque nunca hubo dos.
 *
 * Reusar el componente y no escribir uno propio es lo que sostiene esa promesa:
 * el día que el formulario gane un campo, lo gana en los dos lados o en
 * ninguno.
 */
export const metadata = { title: "Clientes · Accedra" }

export default function ClientesComercialPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Clientes"
        description="La misma ficha que usa Administración. Solo la razón social es obligatoria."
        back={{ href: "/comercial/presupuestos", label: "Comercial" }}
      />
      <PageBody>
        {/* Sin enlace a la ficha: vive en Administración y la gente de Comercial
            no tiene ese módulo. El click abre el panel lateral, que trae los
            mismos datos del cliente sin salir de acá. */}
        <EntidadesClient tipo="cliente" conFicha={false} />
      </PageBody>
    </main>
  )
}
