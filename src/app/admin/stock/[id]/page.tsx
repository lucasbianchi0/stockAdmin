import { StockFichaClient } from "@/components/admin/stock-ficha-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"
import { SoloAdministradores, esAdmin } from "@/lib/admin/solo-admin"
import { supabase } from "@/lib/supabase"

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const { data } = await supabase.from("stock_items").select("nombre").eq("id", id).maybeSingle()
  return { title: `${data?.nombre ?? "Ítem"} · Stock · Accedra` }
}

export default async function FichaStockPage({ params }: Props) {
  const { id } = await params
  const admin = await esAdmin()
  const { data } = admin
    ? await supabase.from("stock_items").select("nombre, codigo, lleva_serie").eq("id", id).maybeSingle()
    : { data: null }

  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title={data?.nombre ?? "Stock"}
        description={
          data
            ? [data.codigo, data.lleva_serie ? "Con número de serie por unidad" : "Se controla por cantidad"]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        back={{ href: "/admin/stock", label: "Stock" }}
      />
      <PageBody>{admin ? <StockFichaClient id={id} /> : <SoloAdministradores />}</PageBody>
    </main>
  )
}
