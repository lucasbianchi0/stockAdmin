export const BUCKET_PIEZAS = "piezas"

/**
 * Una pieza generada, guardada.
 *
 * El `prompt` no es un dato de auditoría: es lo que hace comparable el
 * historial. Los templates se van a seguir editando, así que dos piezas del
 * mismo template en fechas distintas salieron de recetas distintas — sin el
 * prompt guardado no hay forma de saber qué cambió entre una y otra.
 */
export type PiezaGenerada = {
  id: string
  templateId: string
  templateNombre: string | null
  titular: string
  etiqueta: string | null
  sujeto: string | null
  prompt: string
  modelo: string | null
  /** Qué tanda la generó. Todas las piezas de una tanda comparten número. */
  loteNumero: number | null
  createdAt: string
  /** URL firmada, temporal. */
  url: string | null
}
