import { cache } from "react"
import { notFound } from "next/navigation"

import { VersionDetalle } from "@/components/marketing/versiones-ads"
import { PageHeader } from "@/components/ui/page-header"
import { versionDeAds } from "@/lib/marketing/ads-versiones"

/**
 * El detalle de una versión de Ads: qué se cambió, por qué, con qué dato y qué
 * esperamos. La URL usa la etiqueta (`/marketing/versiones/v2.3`) para que se
 * pueda pasar el link de una versión puntual.
 */

const leer = cache(async (param: string) => versionDeAds(decodeURIComponent(param).replace(/^v/i, "")))

export async function generateMetadata({ params }: { params: Promise<{ numero: string }> }) {
  const v = await leer((await params).numero)
  return { title: v ? `v${v.numero} · Versiones de Ads · Accedra` : "Versiones de Ads · Accedra" }
}

export const dynamic = "force-dynamic"

export default async function VersionAdsPage({ params }: { params: Promise<{ numero: string }> }) {
  const v = await leer((await params).numero)
  if (!v) notFound()

  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title={`Versión ${v.numero}`}
        description={v.titulo}
        back={{ href: "/marketing/versiones", label: "Versiones de Ads" }}
      />
      <VersionDetalle v={v} />
    </main>
  )
}
