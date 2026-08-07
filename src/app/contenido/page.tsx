import { ContentStudioClient } from "@/components/admin/content-studio-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"

export default function ContenidoPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Creación de contenido"
        description="Generá ideas, copy e imágenes para redes con IA — contexto de Accedra ya cargado"
      />
      <PageBody>
        <ContentStudioClient />
      </PageBody>
    </main>
  )
}
