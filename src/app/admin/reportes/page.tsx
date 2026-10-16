import { redirect } from "next/navigation"

/**
 * Reportes ya no es una pantalla: sus dos pestañas pasaron a su módulo —2.5
 * Pendientes de pago en Proveedores y 3.5 Pendientes de cobro en Clientes—, como
 * pide el árbol del contador. La ruta queda como redirección porque la usan el
 * asistente y algún enlace guardado, incluido el `?solapa=` de antes.
 */
export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ solapa?: string }>
}) {
  const { solapa } = await searchParams
  redirect(solapa === "pagar" ? "/admin/proveedores/pendientes" : "/admin/clientes/pendientes")
}
