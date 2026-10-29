import { queryOptions } from "@tanstack/react-query"

import { claveDe, pedirJson } from "@/lib/admin/query"
import { URL_EQUIPO, urlDeFicha, type ClaveAgente, type DetalleAgente, type ResumenAgente } from "@/lib/agentes"

export { URL_EQUIPO, urlDeFicha }

/**
 * Las consultas de la pantalla de agentes, en un solo lugar: la tarjeta precarga
 * la ficha al pasar el mouse con la misma clave y la misma función que usa la
 * ficha, así al entrar ya está en la caché.
 */
export const consultaDelEquipo = () =>
  queryOptions({
    queryKey: claveDe("marketing", URL_EQUIPO),
    queryFn: ({ signal }) => pedirJson<{ equipo: ResumenAgente[] }>(URL_EQUIPO, { signal }),
  })

export const consultaDeFicha = (clave: ClaveAgente) =>
  queryOptions({
    queryKey: claveDe("marketing", urlDeFicha(clave)),
    queryFn: ({ signal }) => pedirJson<{ agente: DetalleAgente }>(urlDeFicha(clave), { signal }),
  })
