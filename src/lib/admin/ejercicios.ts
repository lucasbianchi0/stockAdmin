/**
 * Ejercicios contables: cada uno con su inicio, su fin y su estado.
 *
 * El de Accedra va del 1/9 al 31/8 (confirmado por el contador el 15/10/2026).
 * Cada ejercicio guarda sus propias fechas, así que cambiar la fecha de cierre
 * de uno no altera a los anteriores.
 */

export type Ejercicio = {
  id: number
  nombre: string
  inicio: string
  fin: string
  estado: "abierto" | "cerrado"
  asientos: number
  enCurso: boolean
}

export type Proyeccion = {
  antes: Ejercicio[]
  despues: Ejercicio[]
  /** Los días que pasan de un ejercicio al otro; sus asientos cambian de ejercicio. */
  tramoQueCambia: { desde: string; hasta: string; de: string; a: string } | null
}

const dia = 86_400_000
const mover = (iso: string, dias: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + dias * dia).toISOString().slice(0, 10)

/** "2026/27", o "2026" si empieza y termina el mismo año. Espeja `ejercicio_nombre`. */
export function nombreEjercicio(inicio: string, fin: string): string {
  const a = inicio.slice(0, 4)
  const b = fin.slice(0, 4)
  return a === b ? b : `${a}/${b.slice(2)}`
}

/**
 * Cómo quedarían los ejercicios si se mueve el inicio o el fin de uno.
 * Repite las reglas de `ejercicio_cambiar_inicio` / `_fin` de la base para poder
 * mostrar el resultado antes de hacerlo; la base vuelve a validar al confirmar.
 */
export function proyectarCambio(
  ejercicios: Ejercicio[],
  id: number,
  campo: "inicio" | "fin",
  fecha: string
): Proyeccion | { error: string } {
  const e = ejercicios.find((x) => x.id === id)
  if (!e) return { error: "Ese ejercicio no existe" }
  if (e.estado === "cerrado") return { error: "El ejercicio está cerrado: sus fechas ya no se mueven" }

  const despues = ejercicios.map((x) => ({ ...x }))
  const actual = despues.find((x) => x.id === id)!
  let tramo: Proyeccion["tramoQueCambia"] = null

  if (campo === "inicio") {
    if (fecha === e.inicio) return { error: "Es la misma fecha que ya tiene" }
    if (fecha > e.fin) return { error: "El inicio no puede ser posterior al cierre" }
    const anterior = despues.find((x) => x.fin === mover(e.inicio, -1))
    if (!anterior && fecha > e.inicio) {
      return { error: "Es el primer ejercicio cargado: si empieza más tarde, los días de antes quedan sin ejercicio" }
    }
    const nombreAnterior = anterior?.nombre ?? "ningún ejercicio"
    if (anterior) {
      if (anterior.estado === "cerrado") {
        return { error: `El ejercicio ${anterior.nombre} está cerrado: no se puede mover su cierre` }
      }
      if (fecha <= anterior.inicio) return { error: `El ejercicio ${anterior.nombre} quedaría sin días` }
      anterior.fin = mover(fecha, -1)
      anterior.nombre = nombreEjercicio(anterior.inicio, anterior.fin)
    }
    actual.inicio = fecha
    actual.nombre = nombreEjercicio(actual.inicio, actual.fin)
    tramo =
      fecha > e.inicio
        ? { desde: e.inicio, hasta: mover(fecha, -1), de: e.nombre, a: anterior?.nombre ?? nombreAnterior }
        : { desde: fecha, hasta: mover(e.inicio, -1), de: nombreAnterior, a: actual.nombre }
  } else {
    if (fecha === e.fin) return { error: "Es la misma fecha que ya tiene" }
    if (fecha < e.inicio) return { error: "El cierre no puede ser anterior al inicio" }
    const siguiente = despues.find((x) => x.inicio === mover(e.fin, 1))
    if (!siguiente && fecha < e.fin) {
      return { error: "Es el último ejercicio cargado: si cierra antes, los días de después quedan sin ejercicio" }
    }
    const nombreSiguiente = siguiente?.nombre ?? "ningún ejercicio"
    if (siguiente) {
      if (siguiente.estado === "cerrado") return { error: `El ejercicio ${siguiente.nombre} está cerrado` }
      if (fecha >= siguiente.fin) return { error: `El ejercicio ${siguiente.nombre} quedaría sin días` }
      siguiente.inicio = mover(fecha, 1)
      siguiente.nombre = nombreEjercicio(siguiente.inicio, siguiente.fin)
    }
    actual.fin = fecha
    actual.nombre = nombreEjercicio(actual.inicio, actual.fin)
    tramo =
      fecha < e.fin
        ? { desde: mover(fecha, 1), hasta: e.fin, de: e.nombre, a: siguiente?.nombre ?? nombreSiguiente }
        : { desde: mover(e.fin, 1), hasta: fecha, de: nombreSiguiente, a: actual.nombre }
  }

  return { antes: ejercicios, despues, tramoQueCambia: tramo }
}

/** `2026-09-01` → `1/9/2026`. */
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${Number(d)}/${Number(m)}/${a}`
}
