import { notFound } from "next/navigation"

import { FichaEntidadClient } from "@/components/admin/ficha-entidad-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"
import { supabase } from "@/lib/supabase"

/**
 * La ficha de un cliente: todo lo suyo en un lugar.
 *
 * La razón social se lee en el servidor para que el encabezado y el título de la
 * pestaña salgan bien en el primer render, en vez de parpadear un "Cargando…".
 */

async function clienteDe(id: string) {
  const { data } = await supabase
    .from("clientes")
    .select("id, razon_social, activo")
    .eq("id", id)
    .maybeSingle()
  return data
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await clienteDe(id)
  return { title: c ? `${c.razon_social} · Accedra` : "Cliente · Accedra" }
}

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cliente = await clienteDe(id)
  if (!cliente) notFound()

  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title={cliente.razon_social}
        description="Facturas, cobros, estado de cuenta y datos de la ficha"
        back={{ href: "/admin/clientes", label: "Clientes" }}
      />
      <PageBody>
        <FichaEntidadClient tipo="cliente" entidadId={id} />
      </PageBody>
    </main>
  )
}
