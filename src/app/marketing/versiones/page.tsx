import { VersionesAds } from "@/components/marketing/versiones-ads"
import { PageHeader } from "@/components/ui/page-header"
import { versionesDeAds } from "@/lib/marketing/ads-versiones"

/**
 * Versiones de Ads — el changelog de la cuenta de Google Ads.
 *
 * Se lee en el servidor: no hay nada que filtrar ni editar en pantalla, y así
 * sale entero en el primer render. Las versiones se cargan en `ads_versiones`
 * en el momento de cada cambio.
 */
export const metadata = { title: "Versiones de Ads · Accedra" }
export const dynamic = "force-dynamic"

export default async function VersionesAdsPage() {
  const r = await versionesDeAds()

  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Versiones de Ads"
        description="Qué se cambió en las campañas de Google, por qué y con qué dato se decidió."
        back={{ href: "/marketing/resultados", label: "Resultados" }}
      />
      {r.ok ? (
        <VersionesAds versiones={r.versiones} />
      ) : (
        <p className="mx-auto mt-10 max-w-md text-center text-[13px] text-danger-text">
          No se pudieron leer las versiones: {r.error}
        </p>
      )}
    </main>
  )
}
