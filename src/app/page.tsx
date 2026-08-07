import { ProductTable } from "@/components/product-table"
import { PageBody, PageHeader } from "@/components/ui/page-header"

export default function Home() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Inventario"
        description="Catálogo completo de Distecna: stock, precios e impuestos"
      />
      <PageBody>
        <ProductTable />
      </PageBody>
    </main>
  )
}
