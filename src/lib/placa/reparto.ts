/**
 * Cómo se reparten los cuatro formatos en un plan.
 *
 * El modelo PROPONE el formato de cada pieza mirando lo que tiene que decir —una
 * lista de capacidades pide bullets, una pregunta de apertura pide centrado— y
 * este módulo lo IMPONE. Los dos pasos hacen falta: sin la propuesta, el formato
 * no tiene nada que ver con el contenido; sin la imposición, el modelo devuelve
 * nueve piezas del mismo formato y se queda tranquilo.
 *
 * Es la misma división que ya usa `generarPlan` con las fechas y los canales: se
 * le pide al modelo que cumpla y después se verifica en el servidor, porque un
 * plan de quince días con once placas idénticas no se descubre leyendo el JSON,
 * se descubre cuando ya está publicado.
 */

export const LAYOUTS = ["solo", "bajada", "bullets", "centrado"] as const
export type LayoutPlaca = (typeof LAYOUTS)[number]

export function esLayout(v: unknown): v is LayoutPlaca {
  return typeof v === "string" && (LAYOUTS as readonly string[]).includes(v)
}

/**
 * El peso de cada formato en el plan. No son cantidades: son proporciones que se
 * escalan a la cantidad de piezas.
 *
 * `solo` pesa menos porque es el más austero —titular y nada más— y en dosis
 * altas el feed queda vacío. `centrado` pesa igual que los otros dos aunque
 * rompa la grilla de la columna: es justamente lo que da el respiro visual.
 */
const MEZCLA: Record<LayoutPlaca, number> = {
  bullets: 3,
  bajada: 3,
  centrado: 3,
  solo: 2,
}

/**
 * Cuántas iguales seguidas se toleran. Dos.
 *
 * Con tres ya se lee como "el sistema se colgó en un formato", que es
 * exactamente la queja. Y prohibir hasta las de a dos daría un zigzag mecánico,
 * que se nota igual de artificial.
 */
const MAX_SEGUIDAS = 2

/** El cupo de cada formato para N piezas, repartiendo el resto por peso. */
function cupos(total: number): Record<LayoutPlaca, number> {
  const suma = LAYOUTS.reduce((t, l) => t + MEZCLA[l], 0)
  const base = {} as Record<LayoutPlaca, number>
  let asignado = 0

  for (const l of LAYOUTS) {
    base[l] = Math.floor((total * MEZCLA[l]) / suma)
    asignado += base[l]
  }

  // Lo que sobra por el redondeo va a los de mayor peso, en orden fijo: el
  // reparto tiene que ser el mismo cada vez que se corre sobre el mismo plan.
  const orden = [...LAYOUTS].sort((a, b) => MEZCLA[b] - MEZCLA[a] || a.localeCompare(b))
  for (let i = 0; asignado < total; i++, asignado++) {
    base[orden[i % orden.length]]++
  }

  return base
}

/**
 * El formato definitivo de cada pieza, en orden de calendario.
 *
 * Respeta lo que propuso el modelo siempre que quede cupo y no arme una racha.
 * Cuando no puede, elige el formato con más cupo libre que no rompa la racha —
 * no uno al azar: así el que venía relegado se recupera y el reparto converge.
 */
export function repartirLayouts(propuestas: (LayoutPlaca | null)[]): LayoutPlaca[] {
  const total = propuestas.length
  if (total === 0) return []

  const libre = cupos(total)
  const salida: LayoutPlaca[] = []

  const armaRacha = (l: LayoutPlaca) =>
    salida.length >= MAX_SEGUIDAS &&
    salida.slice(-MAX_SEGUIDAS).every((anterior) => anterior === l)

  for (const propuesta of propuestas) {
    let elegido: LayoutPlaca | null = null

    if (propuesta && libre[propuesta] > 0 && !armaRacha(propuesta)) {
      elegido = propuesta
    } else {
      // El de más cupo libre que no arme racha. El desempate por nombre, y no
      // por el orden de LAYOUTS, para que no dependa de cómo quedó esa lista.
      const candidatos = LAYOUTS.filter((l) => libre[l] > 0 && !armaRacha(l)).sort(
        (a, b) => libre[b] - libre[a] || a.localeCompare(b)
      )
      elegido = candidatos[0] ?? LAYOUTS.filter((l) => !armaRacha(l))[0] ?? "bajada"
    }

    salida.push(elegido)
    if (libre[elegido] > 0) libre[elegido]--
  }

  return salida
}
