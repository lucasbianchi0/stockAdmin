import { MisProductosTable } from "@/components/mis-productos-table"
import { PageBody, PageHeader } from "@/components/ui/page-header"

export default function MisProductosPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Nuestros Productos"
        description="Productos seleccionados, precios mínimos y semáforo de publicación"
      />
      <PageBody>
        <MisProductosTable />
      </PageBody>
    </main>
  )
}
