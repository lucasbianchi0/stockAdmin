import { notFound } from "next/navigation"

import { CertificadosImpresion } from "@/components/marketing/certificados-impresion"
import { NOMBRE_EJEMPLO, marcasDelCertificado } from "@/lib/marketing/eventos"
import { leerEventoCompleto, leerMarcas } from "@/lib/marketing/eventos-server"

export const metadata = { title: "Certificados · Accedra" }
export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ a?: string; muestra?: string }>
}

/**
 * Las hojas para imprimir o guardar como PDF: una por asistente.
 *
 * Se dibuja en el servidor con lo que está GUARDADO, no con lo que hay en el
 * editor. Es a propósito: lo que se imprime tiene que ser lo que quedó
 * registrado, y el editor no deja imprimir con cambios sin guardar.
 *
 *   ?a=id1,id2   → sólo esos asistentes
 *   ?muestra=1   → una hoja con un nombre de ejemplo, para aprobar el diseño
 *
 * El acceso lo corta el middleware (prefijo /marketing). El app-shell no dibuja
 * la sidebar en esta ruta: ver app-shell.tsx.
 */
export default async function CertificadosPage({ params, searchParams }: Props) {
  const { id } = await params
  const { a, muestra } = await searchParams

  const [completo, marcas] = await Promise.all([leerEventoCompleto(id), leerMarcas()])
  if (!completo) notFound()

  const { evento, asistentes } = completo
  const cfg = evento.certificado

  const porId = new Map(marcas.map((m) => [m.id, m]))
  const ids = marcasDelCertificado(cfg, evento.marcaIds)
  const marcasCert = ids.map((x) => porId.get(x)).filter((m) => m !== undefined)

  const pedidos = a ? new Set(a.split(",")) : null
  const hojas = muestra
    ? [{ id: "muestra", nombre: NOMBRE_EJEMPLO, codigo: "ACC-00-MUESTRA", horas: null }]
    : asistentes
        .filter((x) => !pedidos || pedidos.has(x.id))
        .map((x) => ({ id: x.id, nombre: x.nombre, codigo: x.codigo, horas: x.horas }))

  return (
    <CertificadosImpresion
      eventoId={evento.id}
      titulo={evento.titulo}
      evento={{
        titulo: evento.titulo,
        tipo: evento.tipo,
        modalidad: evento.modalidad,
        inicio: evento.inicio,
        lugar: evento.lugar,
      }}
      config={cfg}
      marcas={marcasCert}
      hojas={hojas}
    />
  )
}
