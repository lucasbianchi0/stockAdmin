import { Suspense } from "react"

import { ContactosClient } from "@/components/marketing/contactos-client"
import { LoadingState } from "@/components/ui/states"

/**
 * La base de contactos de marketing. Lo que se decide trabajar se manda de acá
 * al CRM de Comercial.
 */
export const metadata = { title: "Contactos · Accedra" }

export default function ContactosPage() {
  return (
    <main className="flex min-h-full flex-col">
      {/* La cabecera la dibuja el cliente: sus botones abren el panel y el
          importador, que son estado de la pantalla. */}
      <Suspense fallback={<LoadingState label="Cargando contactos…" />}>
        <ContactosClient />
      </Suspense>
    </main>
  )
}
