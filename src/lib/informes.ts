/**
 * Índice de informes publicados.
 *
 * Un informe es un PDF cerrado: se genera una vez, con el template y el prompt
 * de una versión concreta, y no se vuelve a tocar. Julio tiene que decir siempre
 * lo mismo aunque después mejoremos la rúbrica.
 *
 * Por eso acá NO hay métricas: sólo el mínimo para listarlos y abrirlos. Los
 * números viven adentro del PDF. Cualquier cifra duplicada en el código se
 * desincroniza con el informe el día que se regenere.
 *
 * Este índice es provisorio: cuando los PDF pasen a Supabase Storage, el listado
 * sale del bucket y este archivo desaparece.
 */

export type Semaforo = "verde" | "amarillo" | "rojo"

export type Informe = {
  /** Identificador y nombre del archivo en /public/informes. */
  slug: string
  tipo: "historico" | "mensual"
  /** Etiqueta visible: "Agosto 2026" o "2017 – 2026". */
  periodo: string
  /** Año al que pertenece, para agrupar el listado. */
  anio: number
  /** Mes 1-12. Sólo en los mensuales. */
  mes?: number
  /** Fecha de emisión, ISO. */
  emitido: string
  semaforo: Semaforo
  /** El titular del propio informe, copiado tal cual. */
  titular: string
  /** Versión del prompt con la que se generó. */
  promptVersion: string
}

export const INFORMES: Informe[] = [
  {
    slug: "historico-2017-2026",
    tipo: "historico",
    periodo: "Octubre 2017 – Agosto 2026",
    anio: 2026,
    emitido: "2026-08-07",
    semaforo: "rojo",
    titular:
      "En nueve años se invirtieron $2,2 millones y nueve de cada diez pesos fueron a búsquedas que nunca generaron una consulta.",
    promptVersion: "1.0.0",
  },
]

export const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

export const COLOR_SEMAFORO: Record<Semaforo, string> = {
  verde: "#10B981",
  amarillo: "#F59E0B",
  rojo: "#EF4444",
}

export const urlPdf = (slug: string) => `/informes/${slug}.pdf`

/** Meses de un año que todavía no tienen informe, para mostrar la serie completa. */
export function mesesPendientes(anio: number, hasta: number): number[] {
  const publicados = new Set(
    INFORMES.filter((i) => i.tipo === "mensual" && i.anio === anio).map((i) => i.mes),
  )
  return Array.from({ length: hasta }, (_, k) => k + 1).filter((m) => !publicados.has(m))
}
