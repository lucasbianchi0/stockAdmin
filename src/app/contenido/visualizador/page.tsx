import { VisualizadorInstagram } from "@/components/contenido/visualizador-instagram"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * El perfil de Instagram simulado, suelto del banco y del calendario: para
 * probar cómo queda una grilla con imágenes cualesquiera antes de cargarlas.
 */
export const metadata = { title: "Visualizador de Instagram · Accedra" }

export default function VisualizadorPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Visualizador de Instagram"
        description="Subí imágenes, ordenalas y mirá cómo queda el perfil. No se guarda nada en la base"
        back={{ href: "/contenido/generacion", label: "Generación de contenido" }}
      />
      <PageBody>
        <VisualizadorInstagram />
      </PageBody>
    </main>
  )
}
