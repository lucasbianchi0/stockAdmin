import { Suspense } from "react"

import { CrmClient } from "@/components/comercial/crm-client"
import { LoadingState } from "@/components/ui/states"

/**
 * El CRM: el seguimiento de los contactos que cada uno trabaja, de a una
 * persona por vez.
 */
export const metadata = { title: "CRM · Accedra" }

export default function CrmPage() {
  return (
    <main className="flex min-h-full flex-col">
      {/* La cabecera la dibuja el cliente: el título dice de quién es el CRM y
          lleva el selector del equipo. */}
      <Suspense fallback={<LoadingState label="Cargando el CRM…" />}>
        <CrmClient />
      </Suspense>
    </main>
  )
}
