import type { Moneda } from "@/lib/admin/moneda"
import { CATEGORIA_LABEL, type CategoriaGasto, type OrigenMovimiento } from "@/lib/admin/movimientos"

/**
 * El extracto de una cuenta — vocabulario compartido por la API y la pantalla.
 *
 * El formato es el del resumen que manda el banco, que es el que pidieron:
 *
 *     FECHA · CONCEPTO · DÉBITOS · CRÉDITOS · SALDO · DETALLE
 *
 * Tiene dos diferencias de fondo con el listado de movimientos que ya existía, y
 * las dos vienen de la misma idea — un extracto no es una tabla de movimientos:
 *
 *  1. **Va del más viejo al más nuevo.** Es al revés que todas las listas del
 *     módulo, a propósito: la columna de saldo es un acumulado, y un acumulado
 *     leído de abajo hacia arriba no significa nada.
 *  2. **Débitos y créditos van en columnas separadas**, no en una sola con
 *     signo. Es lo que permite sumar cada columna y comparar contra el total del
 *     resumen bancario, que es para lo que se usa.
 */

export type FilaExtracto = {
  id: string
  fecha: string
  /** Qué clase de operación fue, en el lenguaje del extracto bancario. */
  concepto: string
  detalle: string | null
  referencia: string | null
  /** Lo que salió. Cero cuando la fila es un crédito. */
  debito: number
  /** Lo que entró. */
  credito: number
  /** El acumulado hasta esta fila inclusive, arrancando del saldo del período. */
  saldo: number
  origen: OrigenMovimiento
  conciliado: boolean
  cuentaContableNombre: string | null
  /** Cuando el documento venía en otra moneda: cuánto era antes de convertir. */
  importeOrigen: number | null
  monedaOrigen: Moneda | null
  /** El recibo o la orden de pago de la que salió, para poder ir a verla. */
  pagoId: string | null
}

export type CabeceraExtracto = {
  id: string
  nombre: string
  tipo: "caja" | "banco" | "billetera"
  moneda: Moneda
  banco: string | null
  numeroCuenta: string | null
  cbu: string | null
  alias: string | null
  /** El saldo de hoy de la cuenta entera, sin importar el período mirado. */
  saldoActual: number
}

export type ResumenPeriodo = {
  desde: string | null
  hasta: string | null
  /** Lo que había antes del primer movimiento del período. */
  saldoInicial: number
  debitos: number
  creditos: number
  saldoFinal: number
  cantidad: number
  sinConciliar: number
  /** El extracto se cortó por el tope. Un total parcial presentado como
   *  completo es peor que no tenerlo, así que la pantalla lo avisa. */
  truncado: boolean
}

export type Extracto = {
  cuenta: CabeceraExtracto
  periodo: ResumenPeriodo
  filas: FilaExtracto[]
}

/**
 * El concepto de cada fila, en mayúsculas como en el resumen del banco.
 *
 * En un extracto real el concepto lo pone el banco ("TRF INMED PROVEEDORES",
 * "COM GESTIÓN TRANSFERENCIA"). Acá se arma con lo que el sistema sabe: de dónde
 * vino el movimiento y, si fue un gasto, de qué tipo.
 */
export function conceptoDe(
  origen: OrigenMovimiento,
  categoria: CategoriaGasto | null,
  /** Hacia dónde fue la plata. Solo cambia el rótulo de los movimientos sueltos:
   *  un ingreso sin categoría no es un "GASTO", y llamarlo así en el extracto
   *  hace que la fila de un rescate de fondos se lea como un egreso justo en la
   *  columna donde figura como crédito. */
  tipo: "ingreso" | "egreso" = "egreso"
): string {
  switch (origen) {
    case "cobro":
      return "COBRO"
    case "pago":
      return "PAGO A PROVEEDOR"
    case "transferencia":
      return "TRANSFERENCIA"
    case "gasto":
      if (categoria) return CATEGORIA_LABEL[categoria].toUpperCase()
      return tipo === "ingreso" ? "ACREDITACIÓN" : "GASTO"
    case "manual":
      return "AJUSTE"
  }
}

/* ── Períodos ─────────────────────────────────────────────────────────────── */

export const PERIODOS = ["mes", "mes-anterior", "trimestre", "ano", "todo"] as const
export type Periodo = (typeof PERIODOS)[number]

export const PERIODO_LABEL: Record<Periodo, string> = {
  mes: "Este mes",
  "mes-anterior": "Mes pasado",
  trimestre: "Últimos 90 días",
  ano: "Este año",
  todo: "Todo",
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`

/** Las fechas de cada preset. `null` en los dos extremos es "sin límite". */
export function rangoDe(periodo: Periodo, hoy = new Date()): {
  desde: string | null
  hasta: string | null
} {
  const a = hoy.getFullYear()
  const m = hoy.getMonth()

  switch (periodo) {
    case "mes":
      return { desde: iso(new Date(a, m, 1)), hasta: iso(new Date(a, m + 1, 0)) }
    case "mes-anterior":
      return { desde: iso(new Date(a, m - 1, 1)), hasta: iso(new Date(a, m, 0)) }
    case "trimestre":
      return { desde: iso(new Date(a, m, hoy.getDate() - 90)), hasta: iso(hoy) }
    case "ano":
      return { desde: iso(new Date(a, 0, 1)), hasta: iso(new Date(a, 11, 31)) }
    case "todo":
      return { desde: null, hasta: null }
  }
}
