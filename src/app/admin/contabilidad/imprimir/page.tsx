import { DiarioImpresion } from "@/components/admin/diario-impresion"
import { LibroDiarioImpresion } from "@/components/admin/libro-diario-impresion"

export const metadata = { title: "Libro diario · Imprimir" }

/**
 * `?modo=libro` es el formato del estudio para los libros rubricados; sin modo
 * (o `modo=mes`) quedan la hoja detallada por asiento y el resumen mensual.
 */
export default async function LibroDiarioImprimirPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string }>
}) {
  const { modo } = await searchParams
  return modo === "libro" ? <LibroDiarioImpresion /> : <DiarioImpresion />
}
