import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import {
  listarPendientesContables,
  type FiltroPendientes,
} from "@/lib/admin/pendientes-contables-server"

/**
 * Los documentos que el motor no pudo asentar.
 *
 * Es la lista de trabajo de la contabilidad. Cada fila acá es un documento que
 * está en los saldos pero **no en el mayor**, y por lo tanto un balance que no
 * cierra. Casi siempre la causa es la misma y se arregla en diez segundos: el
 * documento quedó sin cuenta contable imputada.
 *
 * Que esta lista exista es la contracara de haber decidido que un error del
 * motor no bloquee la carga de un documento. Si no se bloquea, tiene que verse.
 *
 * Los filtros son para los carteles de cada módulo: la pantalla de facturas de
 * compra pregunta sólo por lo suyo, y así el aviso que muestra habla de lo que
 * el usuario está mirando en vez de un total que mezcla circuitos.
 */
export const GET = ruta("pendientes contables GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const params = new URL(req.url).searchParams
  const origen = params.get("origen")
  const tipo = params.get("tipo")

  const filtro: FiltroPendientes = {}
  if (origen === "comprobante" || origen === "movimiento") filtro.origen = origen
  if (tipo === "compra" || tipo === "venta") filtro.tipo = tipo

  return listarPendientesContables(filtro)
})
