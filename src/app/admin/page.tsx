import { redirect } from "next/navigation"

/**
 * Administración no tiene pantalla de inicio propia.
 *
 * Acá vivía el tablero de pendientes; se sacó por ahora. La ruta queda como
 * redirección en vez de borrarse para que los links viejos a /admin —favoritos,
 * historial— caigan en la primera sección en lugar de un 404.
 *
 * Cae en compras y no en clientes porque es donde arranca el trabajo del día:
 * llegan las facturas de los proveedores y se cargan. De ahí sale todo lo demás.
 */
export default function AdminPage() {
  redirect("/admin/compras")
}
