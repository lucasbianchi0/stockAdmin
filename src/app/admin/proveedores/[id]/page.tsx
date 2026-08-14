import { notFound } from "next/navigation"

import { FichaEntidadClient } from "@/components/admin/ficha-entidad-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"
import { supabase } from "@/lib/supabase"

/**
 * La ficha de un proveedor: todo lo suyo en un lugar.
 *
 * La razón social se lee en el servidor para que el encabezado y el título de la
 * pestaña salgan bien en el primer render, en vez de parpadear un "Cargando…".
 */

async function proveedorDe(id: string) {
  const { data } = await supabase
    .from("proveedores")
    .select("id, razon_social, activo")
    .eq("id", id)
    .maybeSingle()
  return data
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await proveedorDe(id)
  return { title: c ? `${c.razon_social} · Accedra` : "Proveedor · Accedra" }
}

export default async function ProveedorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const proveedor = await proveedorDe(id)
  if (!proveedor) notFound()

  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title={proveedor.razon_social}
        description="Facturas de compra, pagos, estado de cuenta y datos de la ficha"
        back={{ href: "/admin/proveedores", label: "Proveedors" }}
      />
      <PageBody>
        <FichaEntidadClient tipo="proveedor" entidadId={id} />
      </PageBody>
    </main>
  )
}
