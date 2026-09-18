import { PageBody, PageHeader } from "@/components/ui/page-header"
import { NotaEditor } from "@/components/marketing/nota-editor"

export const metadata = { title: "Nota · Accedra" }

type Props = { params: Promise<{ id: string }> }

/** `/marketing/notas/nueva` es el alta; con un id, la ficha. */
export default async function NotaPage({ params }: Props) {
  const { id } = await params
  const nueva = id === "nueva"

  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title={nueva ? "Nueva nota" : "Nota"}
        description="El texto, lo que lee Google y lo que cita una IA, en un solo lugar."
        back={{ href: "/marketing/notas", label: "Notas" }}
      />
      <PageBody>
        <NotaEditor id={nueva ? null : id} />
      </PageBody>
    </main>
  )
}
