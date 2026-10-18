import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"

import { StockClient } from "@/components/admin/stock-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"
import { SoloAdministradores, esAdmin } from "@/lib/admin/solo-admin"
import { leerItems } from "@/lib/admin/stock-server"

/**
 * Stock: control de cantidades, en dólares a precio de compra. No toca la
 * contabilidad —lo que la toca es la factura—. Sólo lo ven los administradores.
 *
 * El listado viene leído desde acá y se le pasa a la caché del navegador: la
 * pantalla abre con los datos, sin el spinner ni un segundo pedido a la API.
 */
export const metadata = { title: "Stock · Accedra" }

export default async function StockPage() {
  const [admin, items] = await Promise.all([esAdmin(), leerItems().catch(() => null)])
  const cache = new QueryClient()
  // La misma clave que `claves.url("/api/admin/stock")` del cliente.
  if (admin && items) cache.setQueryData(["admin", "url", "/api/admin/stock"], { items })

  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Stock"
        description="Lo que hay para vender y los materiales de trabajo: cuánto hay de cada cosa y cuánto costó. Sólo controla cantidades: no genera asientos."
        back={{ href: "/admin", label: "Administración" }}
      />
      <PageBody>
        {admin ? (
          <HydrationBoundary state={dehydrate(cache)}>
            <StockClient />
          </HydrationBoundary>
        ) : (
          <SoloAdministradores />
        )}
      </PageBody>
    </main>
  )
}
