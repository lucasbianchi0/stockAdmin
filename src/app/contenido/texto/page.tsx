import { GeneradorTexto } from "@/components/contenido/generador-texto"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/** Generador de textos a pedido libre. Independiente del de imágenes. */
export const metadata = { title: "Generar texto · Accedra" }

export default function GenerarTextoPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Generar texto"
        description="Posts, emails, newsletters, artículos, títulos, CTAs y guiones. Se ajusta, se copia y se descarga"
        back={{ href: "/contenido/generacion", label: "Generación de contenido" }}
      />
      <PageBody>
        <GeneradorTexto />
      </PageBody>
    </main>
  )
}
