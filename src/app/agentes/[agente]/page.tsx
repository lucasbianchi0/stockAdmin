import { notFound } from "next/navigation"

import { FichaDeAgente } from "@/components/agentes/ficha"
import { AGENTES, claveDeSlug } from "@/lib/agentes"

/** La ficha de un agente: quién es, qué entregó, qué aprobaste y cuándo corrió. */
export async function generateMetadata({ params }: { params: Promise<{ agente: string }> }) {
  const clave = claveDeSlug((await params).agente)
  return { title: clave ? `${AGENTES[clave].apodo} · Agentes · Accedra` : "Agentes · Accedra" }
}

export default async function AgentePage({ params }: { params: Promise<{ agente: string }> }) {
  const clave = claveDeSlug((await params).agente)
  if (!clave) notFound()

  return <FichaDeAgente clave={clave} />
}
