import { PageBody, PageHeader } from "@/components/ui/page-header"
import { PlantillasClient } from "@/components/contenido/plantillas-client"
import { ProbadorTemplates } from "@/components/contenido/probador-templates"

export const metadata = { title: "Plantillas visuales · Accedra" }

export default function PlantillasPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Plantillas visuales"
        description="Los cinco formatos de pieza y las fotos de referencia. Probá un mismo contenido en los cinco para ver si tienen la misma personalidad."
        back={{ href: "/contenido/calendario", label: "Calendario" }}
      />
      <PageBody width="narrow" className="max-w-5xl">
        <ProbadorTemplates />

        <div className="mt-10 border-t border-line pt-8">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">
            Fotos de referencia
          </h2>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink-muted">
            El template manda la estructura; estas fotos mandan el acabado — qué luz, qué
            tratamiento, cuánto minimalismo. Nunca el color: ese es siempre el de Accedra.
          </p>
          <div className="mt-5">
            <PlantillasClient />
          </div>
        </div>
      </PageBody>
    </main>
  )
}
