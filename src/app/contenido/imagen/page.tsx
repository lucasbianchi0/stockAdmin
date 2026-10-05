import { GeneradorImagen } from "@/components/contenido/generador-imagen"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Generador de imágenes a pedido libre. Independiente del de textos y del banco
 * de piezas: acá no hay sistema visual del feed, solo lo que se pide.
 */
export const metadata = { title: "Generar imagen · Accedra" }

export default function GenerarImagenPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Generar imagen"
        description="Pedido libre, en cualquier formato, con referencias y variantes. Se descarga en PNG"
        back={{ href: "/contenido/generacion", label: "Generación de contenido" }}
      />
      <PageBody>
        <GeneradorImagen />
      </PageBody>
    </main>
  )
}
