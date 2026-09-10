import { PageBody, PageHeader } from "@/components/ui/page-header"
import { PopupsClient } from "@/components/marketing/popups-client"

/**
 * Popups del sitio.
 *
 * Lo que se carga acá sale publicado en accedra.com.ar sin pasar por un deploy.
 * Es la única pantalla del backoffice que le escribe al sitio público, así que
 * la cabecera lo dice en voz alta: quien entra tiene que saber que lo que toca
 * lo ve cualquiera que entre al sitio.
 */
export const metadata = { title: "Popup del sitio · Accedra" }

export default function PopupPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Popup del sitio"
        description="El aviso que aparece sobre accedra.com.ar: un evento, una capacitación, una novedad. Se prende y se apaga desde acá, sin tocar el sitio."
        back={{ href: "/marketing", label: "Marketing" }}
      />
      <PageBody>
        <PopupsClient />
      </PageBody>
    </main>
  )
}
