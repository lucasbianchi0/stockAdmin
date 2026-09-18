import { PageBody, PageHeader } from "@/components/ui/page-header"
import { NotasClient } from "@/components/marketing/notas-client"

/**
 * Las notas del sitio: el hub de contenido de accedra.com.ar/recursos.
 *
 * Como el popup y los eventos, lo que se publica acá sale en el sitio sin un
 * deploy: /recursos lee esta misma tabla.
 */
export const metadata = { title: "Notas · Accedra" }

export default function NotasPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Notas"
        description="Guías y notas para las búsquedas informativas: las que hoy el sitio no compite y las que cita una IA cuando le preguntan por el tema. Lo publicado sale en accedra.com.ar/recursos."
        back={{ href: "/marketing", label: "Marketing" }}
      />
      <PageBody>
        <NotasClient />
      </PageBody>
    </main>
  )
}
