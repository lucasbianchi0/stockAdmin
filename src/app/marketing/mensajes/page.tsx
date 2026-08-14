import { PageBody, PageHeader } from "@/components/ui/page-header"
import { MensajesClient } from "@/components/marketing/mensajes-client"

/**
 * El repertorio de mensajes del equipo.
 *
 * La descripción de la cabecera es la que fija para qué es esta pantalla: no es
 * un archivo de textos lindos, es lo que se copia y se manda hoy. Todo lo que
 * hay adentro —el contador de usos, el "cuándo usar", los huecos a completar—
 * existe para sostener esa frase.
 */
export const metadata = { title: "Plantillas de mensajes · Accedra" }

export default function MensajesPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Plantillas de mensajes"
        description="Lo que el equipo escribe todos los días, escrito una sola vez y bien. Cualquiera puede crear y corregir; el crédito queda a nombre de quien la escribió."
        back={{ href: "/marketing", label: "Marketing" }}
      />
      <PageBody>
        <MensajesClient />
      </PageBody>
    </main>
  )
}
