import { OrdersTable } from "@/components/orders-table"
import { PageBody, PageHeader } from "@/components/ui/page-header"

export default function OrdersPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Pedidos"
        description="Pedidos generados a Distecna desde Nuestros Productos"
      />
      <PageBody>
        <OrdersTable />
      </PageBody>
    </main>
  )
}
