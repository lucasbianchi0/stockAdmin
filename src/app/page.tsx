import { ProductTable } from "@/components/product-table"

export default function Home() {
  return (
    <main className="flex flex-col min-h-full">
      <div className="sticky top-0 z-10 px-6 pt-5 pb-4 bg-background/95 backdrop-blur-sm border-b">
        <h1 className="text-lg font-bold tracking-tight">Inventario</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Gestión de productos, stock y precios</p>
      </div>
      <div className="px-6 py-5">
        <ProductTable />
      </div>
    </main>
  )
}
