/**
 * Los estados de un pedido a Distecna.
 *
 * Distecna no los informa por API, así que los lleva quien hizo el pedido. Van
 * en el orden en que se recorren; "cancelado" puede llegar desde cualquiera.
 *
 * "error" no está en la lista que se elige a mano: lo pone el sistema cuando
 * Distecna rechaza el alta, y ese pedido nunca existió del otro lado.
 */
export const ESTADOS_PEDIDO = ["enviado", "confirmado", "entregado", "cancelado"] as const
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number] | "error"

export const ESTADO_PEDIDO_LABEL: Record<EstadoPedido, string> = {
  enviado: "Enviado",
  confirmado: "Confirmado",
  entregado: "Entregado",
  cancelado: "Cancelado",
  error: "Error",
}

export function esEstadoElegible(v: unknown): v is (typeof ESTADOS_PEDIDO)[number] {
  return ESTADOS_PEDIDO.includes(v as (typeof ESTADOS_PEDIDO)[number])
}
