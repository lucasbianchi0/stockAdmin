import { MisProductosTable } from "@/components/mis-productos-table"

export default function MisProductosPage() {
  return (
    <main className="flex flex-col min-h-full">
      <div className="sticky top-0 z-10 px-6 pt-5 pb-4 bg-background/95 backdrop-blur-sm border-b">
        <h1 className="text-lg font-bold tracking-tight">Nuestros Productos</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Productos seleccionados, precios mínimos y semáforo de publicación
        </p>
      </div>
      <div className="px-6 py-5">
        <MisProductosTable />
      </div>
    </main>
  )
}
