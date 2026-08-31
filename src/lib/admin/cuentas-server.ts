import { esMoneda, redondear } from "@/lib/admin/moneda"
import type { CuentaFinancieraDetalle } from "@/lib/admin/cobros"

/**
 * Las cuentas financieras del lado del servidor: qué columnas se leen y qué
 * llega a valer un campo que mandó el navegador.
 *
 * Vive aparte de la ruta porque el alta y la edición validan lo mismo, y la
 * única forma de que no se separen es que sea una sola función. Es el mismo
 * criterio que `movimientos-server`.
 */

export const SELECT_CUENTA = `
  id, nombre, tipo, moneda, banco, numero_cuenta, cbu, alias,
  cuenta_contable_id, saldo_inicial, fecha_saldo_inicial, activo, orden,
  contable:plan_cuentas (id, codigo, nombre)
`

type Contable = { id: string; codigo: string; nombre: string }

/** PostgREST devuelve el join como objeto o como array de uno según cómo infiera
 *  la relación; se acepta cualquiera de las dos y se normaliza acá. */
type Fila = Record<string, unknown> & { contable?: Contable | Contable[] | null }

const unContable = (v: Fila["contable"]): Contable | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

export function aCuentaDetalle(fila: Fila, tieneMovimientos: boolean): CuentaFinancieraDetalle {
  const contable = unContable(fila.contable)

  return {
    id: fila.id as string,
    nombre: fila.nombre as string,
    tipo: fila.tipo as CuentaFinancieraDetalle["tipo"],
    moneda: fila.moneda as CuentaFinancieraDetalle["moneda"],
    banco: (fila.banco as string | null) ?? null,
    numeroCuenta: (fila.numero_cuenta as string | null) ?? null,
    cbu: (fila.cbu as string | null) ?? null,
    alias: (fila.alias as string | null) ?? null,
    cuentaContableId: contable?.id ?? null,
    cuentaContableNombre: contable ? `${contable.codigo} · ${contable.nombre}` : null,
    saldoInicial: Number(fila.saldo_inicial ?? 0),
    fechaSaldoInicial: (fila.fecha_saldo_inicial as string | null) ?? null,
    activo: Boolean(fila.activo),
    orden: Number(fila.orden ?? 0),
    tieneMovimientos,
  }
}

const TIPOS = ["caja", "banco", "billetera"] as const

const texto = (v: unknown, max = 120): string | null => {
  if (typeof v !== "string") return null
  const t = v.trim().slice(0, max)
  return t.length > 0 ? t : null
}

/**
 * Traduce el cuerpo del pedido a columnas.
 *
 * En `edicion` solo viaja lo que vino: un PATCH que reconstruya la fila entera
 * borraría con `null` cada campo que el formulario no muestre.
 *
 * La moneda no se resuelve acá aunque sea un campo más: cambiarla depende de si
 * la cuenta ya tiene movimientos, y eso es una consulta que la ruta hace y esta
 * función no puede.
 */
export function camposDeCuenta(
  raw: Record<string, unknown>,
  modo: "alta" | "edicion"
): Record<string, unknown> | { error: string } {
  const campos: Record<string, unknown> = {}
  const esAlta = modo === "alta"

  if (esAlta || "nombre" in raw) {
    const nombre = texto(raw.nombre)
    if (!nombre) return { error: "La cuenta necesita un nombre" }
    campos.nombre = nombre
  }

  if (esAlta || "tipo" in raw) {
    const tipo = typeof raw.tipo === "string" ? raw.tipo : ""
    if (!(TIPOS as readonly string[]).includes(tipo)) {
      return { error: "El tipo tiene que ser caja, banco o billetera" }
    }
    campos.tipo = tipo
  }

  if (esAlta) campos.moneda = esMoneda(raw.moneda) ? raw.moneda : "ARS"

  for (const [clave, columna] of [
    ["banco", "banco"],
    ["numeroCuenta", "numero_cuenta"],
    ["cbu", "cbu"],
    ["alias", "alias"],
  ] as const) {
    if (esAlta || clave in raw) campos[columna] = texto(raw[clave])
  }

  if (esAlta || "cuentaContableId" in raw) {
    campos.cuenta_contable_id =
      typeof raw.cuentaContableId === "string" && raw.cuentaContableId
        ? raw.cuentaContableId
        : null
  }

  /* El saldo inicial admite negativos, y no es un descuido: es un descubierto,
     que en una cuenta corriente es un estado normal. Lo que no admite es basura,
     porque va a la primera línea del extracto y de ahí se acumula todo. */
  if (esAlta || "saldoInicial" in raw) {
    const n = Number(raw.saldoInicial ?? 0)
    if (!Number.isFinite(n)) return { error: "El saldo inicial tiene que ser un número" }
    campos.saldo_inicial = redondear(n)
  }

  if (esAlta || "fechaSaldoInicial" in raw) {
    const f = raw.fechaSaldoInicial
    campos.fecha_saldo_inicial =
      typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null
  }

  if ("activo" in raw) campos.activo = Boolean(raw.activo)

  if (esAlta || "orden" in raw) {
    const n = Number(raw.orden ?? 0)
    campos.orden = Number.isFinite(n) ? Math.trunc(n) : 0
  }

  return campos
}

/** El índice único es sobre (lower(nombre), moneda): el choque es de nombre. */
export function esNombreRepetido(error: { code?: string } | null): boolean {
  return error?.code === "23505"
}
