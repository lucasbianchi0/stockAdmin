import { redirect } from "next/navigation"

/**
 * Administración no tiene pantalla de inicio propia.
 *
 * Acá vivía el tablero de pendientes; se sacó por ahora. La ruta queda como
 * redirección en vez de borrarse para que los links viejos a /admin —favoritos,
 * historial— caigan en la primera sección en lugar de un 404.
 */
export default function AdminPage() {
  redirect("/admin/clientes")
}
