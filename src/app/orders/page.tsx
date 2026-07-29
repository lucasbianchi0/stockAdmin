import { OrdersTable } from "@/components/orders-table"

export default function OrdersPage() {
  return (
    <main className="flex flex-col min-h-full">
      <div className="sticky top-0 z-10 px-6 pt-5 pb-4 bg-background/95 backdrop-blur-sm border-b">
        <h1 className="text-lg font-bold tracking-tight">Pedidos</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Pedidos generados a Distecna desde Nuestros Productos
        </p>
      </div>
      <div className="px-6 py-5">
        <OrdersTable />
      </div>
    </main>
  )
}
