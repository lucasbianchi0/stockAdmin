import { ContentStudioClient } from "@/components/admin/content-studio-client"

export default function ContenidoPage() {
  return (
    <main className="flex flex-col min-h-full">
      <div className="sticky top-0 z-10 px-6 pt-5 pb-4 bg-background/95 backdrop-blur-sm border-b">
        <h1 className="text-lg font-bold tracking-tight">Creación de contenido</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Generá ideas, copy e imágenes para redes con IA — contexto de Accedra ya cargado
        </p>
      </div>
      <div className="px-6 py-6">
        <ContentStudioClient />
      </div>
    </main>
  )
}
