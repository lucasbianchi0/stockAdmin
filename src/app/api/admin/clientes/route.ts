import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import {
  CONFIG_CLIENTES,
  crearEntidad,
  listarEntidades,
} from "@/lib/admin/entidades-handlers"

/**
 * Clientes es la misma pantalla que proveedores, así que es el mismo handler con
 * otra configuración.
 *
 * Esta ruta tenía su propia copia del listado y del alta —quedó de cuando
 * clientes fue lo primero que se construyó, antes de que existiera proveedores—
 * y esa copia era exactamente el problema que `entidades-handlers` vino a
 * resolver: el día que el listado aprendió a traer el saldo pendiente, solo se
 * enteró la mitad que sí lo usaba.
 */

export const GET = ruta("clientes GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return listarEntidades(CONFIG_CLIENTES, req)
})

export const POST = ruta("clientes POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return crearEntidad(CONFIG_CLIENTES, req)
})
