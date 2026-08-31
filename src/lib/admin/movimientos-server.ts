import { supabase } from "@/lib/supabase"
import { cotizacionHasta } from "@/lib/admin/cotizaciones-server"
import { redondear, type Moneda } from "@/lib/admin/moneda"
import type {
  CategoriaGasto,
  Movimiento,
  OrigenMovimiento,
} from "@/lib/admin/movimientos"

export const SELECT_MOVIMIENTO = `
  *,
  cuenta:cuentas_financieras (id, nombre),
  contable:plan_cuentas (id, codigo, nombre)
`

type Fila = Record<string, unknown> & {
  cuenta?: { id: string; nombre: string } | null
  contable?: { id: string; codigo: string; nombre: string } | null
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v))

/** Para las columnas donde el nulo quiere decir "no se sabe" y no "cero". */
const numONull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v)

export function aMovimiento(fila: Fila): Movimiento {
  return {
    id: fila.id as string,
    cuentaId: fila.cuenta_id as string,
    cuentaNombre: fila.cuenta?.nombre ?? null,
    fecha: fila.fecha as string,
    tipo: fila.tipo as "ingreso" | "egreso",
    importe: num(fila.importe),
    moneda: fila.moneda as Moneda,
    tc: numONull(fila.tc),
    importeArs: numONull(fila.importe_ars),
    importeUsd: numONull(fila.importe_usd),
    importeOrigen: numONull(fila.importe_origen),
    monedaOrigen: (fila.moneda_origen as Moneda | null) ?? null,
    signo: num(fila.signo) === -1 ? -1 : 1,
    origen: fila.origen as OrigenMovimiento,
    pagoId: (fila.pago_id as string | null) ?? null,
    cuentaContableId: fila.contable?.id ?? null,
    cuentaContableNombre: fila.contable
      ? `${fila.contable.codigo} · ${fila.contable.nombre}`
      : null,
    referencia: (fila.referencia as string | null) ?? null,
    detalle: (fila.detalle as string | null) ?? null,
    categoria: (fila.categoria as CategoriaGasto | null) ?? null,
    conciliado: Boolean(fila.conciliado),
    createdAt: fila.created_at as string,
  }
}

/* ── Piezas compartidas entre el alta y la edición ────────────────────────── */

/**
 * Vive acá y no en la ruta del alta porque ahora hay dos escrituras —el POST y
 * el PATCH del extracto— y las dos tienen que resolver la moneda igual. Dos
 * copias de esta lógica es cómo un día se edita un gasto en dólares y queda
 * guardado con el importe sin convertir.
 */

/**
 * La moneda de cada cuenta financiera, leída de la base.
 *
 * No se confía en la que manda el navegador: un movimiento tiene que estar en la
 * moneda de SU cuenta —un Galicia en pesos no recibe dólares— y eso lo garantiza
 * un trigger. Preguntarle a la base antes de escribir convierte lo que haya que
 * convertir y evita que el trigger salte con un error que nadie entendería.
 */
export async function monedasDeCuentas(ids: string[]): Promise<Map<string, Moneda>> {
  const limpios = ids.filter((v) => v.length > 0)
  if (limpios.length === 0) return new Map()

  const { data } = await supabase
    .from("cuentas_financieras")
    .select("id, moneda")
    .in("id", limpios)

  return new Map((data ?? []).map((c) => [c.id as string, c.moneda as Moneda]))
}

export function numeroPositivo(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? redondear(n, 4) : null
}

export function textoCorto(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null
  const t = v.trim().slice(0, max)
  return t.length > 0 ? t : null
}

export function esFechaISO(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

/** Lo que hay que escribir en las columnas de plata de un movimiento. */
export type ImporteResuelto = {
  importe: number
  moneda: Moneda
  /** `null` cuando no hay cotización archivada para esa fecha. Quien escribe
   *  decide qué hacer: el alta deja que la base ponga su default, la edición no
   *  toca el TC que el movimiento ya tenía. */
  tc: number | null
  /** Lo cargado antes de convertir, cuando vino en otra moneda. */
  importeOrigen: number | null
  monedaOrigen: Moneda | null
}

/**
 * Convierte el importe cargado a la moneda de la cuenta y archiva de dónde salió.
 *
 * Un gasto en dólares pagado desde la cuenta en pesos se guarda en pesos —es lo
 * que movió el saldo— pero con `importe_origen` y `moneda_origen` puestos, que
 * es lo que después le permite al extracto explicar por qué el renglón dice un
 * número que no es redondo.
 */
export async function resolverImporte(opciones: {
  importe: number
  monedaCargada: Moneda
  monedaCuenta: Moneda
  tc: number | null
  fecha: string
}): Promise<ImporteResuelto | { error: string }> {
  const { importe, monedaCargada, monedaCuenta, fecha } = opciones
  const cruzada = monedaCargada !== monedaCuenta

  let tc = opciones.tc
  // Con las dos monedas en juego el TC no es un dato de valuación sino parte de
  // la operación: sin él no se sabe cuánto salió realmente de la cuenta.
  if (cruzada && tc === null) {
    return {
      error: `Cargaste el importe en ${monedaCargada} y la cuenta está en ${monedaCuenta}: falta el tipo de cambio.`,
    }
  }
  // Sin TC explícito se archiva el del día, para que el movimiento quede valuado
  // en las dos monedas sin que nadie tipee nada.
  if (tc === null) tc = await cotizacionHasta(fecha)

  // Con dólares en juego y sin ninguna cotización archivada, se pide en vez de
  // inventar: guardarlo con el TC por defecto de la base valuaría un dólar a un
  // peso, y ese número entra al asiento y a los reportes como si fuera cierto.
  if (tc === null && (monedaCargada === "USD" || monedaCuenta === "USD")) {
    return { error: "No hay cotización guardada para esa fecha: cargá el tipo de cambio." }
  }

  return {
    importe:
      cruzada && tc !== null
        ? monedaCargada === "USD"
          ? redondear(importe * tc)
          : redondear(importe / tc)
        : importe,
    moneda: monedaCuenta,
    tc,
    importeOrigen: cruzada ? importe : null,
    monedaOrigen: cruzada ? monedaCargada : null,
  }
}
