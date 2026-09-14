import { redirect } from "next/navigation"

/**
 * Marketing ya no tiene panel: las áreas están en la sidebar y la grilla de
 * cards repetía el mismo menú. La ruta queda como redirección porque todavía la
 * usan los botones de volver de Contenido y algún enlace guardado.
 */
export default function MarketingPage() {
  redirect("/marketing/informes")
}
