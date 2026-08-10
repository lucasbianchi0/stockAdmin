/**
 * CUIT — normalización y validación.
 *
 * El duplicado que hay que evitar no es el obvio (cargar dos veces el mismo
 * texto): es cargar `30-50054729-0` y después `30500547290` y terminar con la
 * misma empresa dos veces, con facturas repartidas entre las dos fichas y un
 * estado de cuenta que no cierra. Por eso el CUIT se guarda **siempre** como 11
 * dígitos pelados y el formato con guiones existe solo para mostrar.
 *
 * La validación del dígito verificador no es cosmética: es lo que distingue un
 * CUIT mal tipeado de uno que todavía no está en el sistema. Sin ella, un dígito
 * cambiado abre una ficha nueva en lugar de encontrar la que ya existe.
 */

/** Deja solo dígitos. `null` si no queda nada. */
export function normalizarCuit(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digitos = raw.replace(/\D/g, "")
  return digitos.length > 0 ? digitos : null
}

/**
 * Dígito verificador por módulo 11, el algoritmo de AFIP.
 *
 * Los pesos 5-4-3-2-7-6-5-4-3-2 se aplican a los primeros 10 dígitos; el resto
 * de dividir la suma por 11 determina el último.
 */
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

export function esCuitValido(raw: string | null | undefined): boolean {
  const cuit = normalizarCuit(raw)
  if (!cuit || cuit.length !== 11) return false

  // 00000000000 pasa el módulo 11 y no es un CUIT de nadie.
  if (/^(\d)\1{10}$/.test(cuit)) return false

  const suma = PESOS.reduce((acc, peso, i) => acc + peso * Number(cuit[i]), 0)
  const resto = suma % 11

  // 11 - resto, con los dos casos de borde de la especificación: cuando da 11 el
  // verificador es 0, y cuando da 10 es 9 (son los CUIT que AFIP emite con
  // prefijo 23 y sexo alternativo).
  const esperado = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto

  return esperado === Number(cuit[10])
}

/** `30500547290` → `30-50054729-0`. Devuelve el crudo si no tiene 11 dígitos. */
export function formatearCuit(raw: string | null | undefined): string {
  const cuit = normalizarCuit(raw)
  if (!cuit) return ""
  if (cuit.length !== 11) return cuit
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`
}

/**
 * Qué decirle a la persona que está cargando. `null` = está bien (incluido el
 * campo vacío: el CUIT es opcional, un cliente del exterior no tiene).
 */
export function errorDeCuit(raw: string | null | undefined): string | null {
  const cuit = normalizarCuit(raw)
  if (!cuit) return null
  if (cuit.length !== 11) return `El CUIT tiene ${cuit.length} dígitos y necesita 11`
  if (!esCuitValido(cuit)) return "El CUIT no es válido — revisá los dígitos"
  return null
}
