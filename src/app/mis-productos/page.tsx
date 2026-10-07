import { MisProductosTable } from "@/components/mis-productos-table"
import { PageBody, PageHeader } from "@/components/ui/page-header"

export default function MisProductosPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Nuestros Productos"
        description="Productos seleccionados, costos con convenio y precios mínimos"
      />
      <PageBody>
        <MisProductosTable />
      </PageBody>
    </main>
  )
}
