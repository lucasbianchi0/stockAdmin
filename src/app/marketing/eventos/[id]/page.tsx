import { PageBody, PageHeader } from "@/components/ui/page-header"
import { EventoEditor } from "@/components/marketing/evento-editor"

export const metadata = { title: "Evento · Accedra" }

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

/** `/marketing/eventos/nuevo` es el alta; con un id, la ficha. `?tab=` abre
 *  directo en el certificado o en los asistentes: es a donde lleva la lista. */
export default async function EventoPage({ params, searchParams }: Props) {
  const { id } = await params
  const { tab } = await searchParams
  const nuevo = id === "nuevo"

  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title={nuevo ? "Nuevo evento" : "Evento"}
        description="La ficha pública, el diseño del certificado y la lista de asistentes, en un solo lugar."
        back={{ href: "/marketing/eventos", label: "Eventos" }}
      />
      <PageBody>
        <EventoEditor id={nuevo ? null : id} tabInicial={tab === "certificado" || tab === "asistentes" ? tab : "evento"} />
      </PageBody>
    </main>
  )
}
