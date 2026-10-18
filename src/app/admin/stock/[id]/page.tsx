import { cache } from "react"
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"

import { StockFichaClient } from "@/components/admin/stock-ficha-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"
import { SoloAdministradores, esAdmin } from "@/lib/admin/solo-admin"
import { DESTINO_LABEL, UNIDAD_INFO } from "@/lib/admin/stock"
import { leerFicha } from "@/lib/admin/stock-server"

type Props = { params: Promise<{ id: string }> }

/**
 * La ficha se lee una sola vez por pedido —el título de la pestaña y la página
 * comparten esta lectura— y viaja con el HTML a la caché del navegador.
 */
const ficha = cache((id: string) => leerFicha(id).catch(() => null))

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  return { title: `${(await ficha(id))?.item.nombre ?? "Ítem"} · Stock · Accedra` }
}

export default async function FichaStockPage({ params }: Props) {
  const { id } = await params
  const [admin, datos] = await Promise.all([esAdmin(), ficha(id)])
  const item = admin ? datos?.item : null
  const cacheCliente = new QueryClient()
  // La misma clave que `claves.url(...)` en StockFichaClient.
  if (admin && datos) cacheCliente.setQueryData(["admin", "url", `/api/admin/stock/${id}`], datos)

  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title={item?.nombre ?? "Stock"}
        description={
          item
            ? [
                item.codigo,
                DESTINO_LABEL[item.destino],
                item.llevaSerie ? "Con número de serie por unidad" : `Se mide en ${UNIDAD_INFO[item.unidad].varios}`,
              ]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        back={{ href: "/admin/stock", label: "Stock" }}
      />
      <PageBody>
        {admin ? (
          <HydrationBoundary state={dehydrate(cacheCliente)}>
            <StockFichaClient id={id} />
          </HydrationBoundary>
        ) : (
          <SoloAdministradores />
        )}
      </PageBody>
    </main>
  )
}
