import { HistorialClient } from "@/components/contenido/generador-historial"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/** Todo lo generado con los generadores de imagen y texto, y los templates del equipo. */
export const metadata = { title: "Historial y templates · Accedra" }

export default function HistorialPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Historial y templates"
        description="Todo lo que se generó, para buscarlo, descargarlo o seguir iterando, y los templates del feed"
        back={{ href: "/contenido/imagen", label: "Generar imagen" }}
      />
      <PageBody>
        <HistorialClient />
      </PageBody>
    </main>
  )
}
