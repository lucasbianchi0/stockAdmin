import { notFound } from "next/navigation"

import { ExtractoClient } from "@/components/admin/extracto-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"
import { supabase } from "@/lib/supabase"

/**
 * El extracto de una cuenta.
 *
 * El nombre de la cuenta se lee en el servidor para que el encabezado y el
 * título de la pestaña salgan bien en el primer render: entrar al Galicia y ver
 * "Cargando…" en el título mientras el cliente resuelve el fetch es un parpadeo
 * evitable.
 */

async function cuentaDe(id: string) {
  const { data } = await supabase
    .from("cuentas_financieras")
    .select("id, nombre, tipo, moneda, banco, numero_cuenta, cbu, alias")
    .eq("id", id)
    .maybeSingle()
  return data
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cuenta = await cuentaDe(id)
  return { title: cuenta ? `${cuenta.nombre} · Accedra` : "Cuenta · Accedra" }
}

export default async function ExtractoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cuenta = await cuentaDe(id)
  if (!cuenta) notFound()

  const datos = [cuenta.banco, cuenta.numero_cuenta, cuenta.cbu, cuenta.alias]
    .filter(Boolean)
    .join(" · ")

  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title={cuenta.nombre}
        description={
          datos || `Movimientos y saldo corrido de la cuenta en ${cuenta.moneda}`
        }
        back={{ href: "/admin/cuentas", label: "Caja y bancos" }}
      />
      <PageBody>
        <ExtractoClient cuentaId={id} />
      </PageBody>
    </main>
  )
}
