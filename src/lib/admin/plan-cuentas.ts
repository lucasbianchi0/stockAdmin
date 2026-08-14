/**
 * El plan de cuentas, del lado del cliente.
 *
 * Desde la migración `20260813_01` el plan es el real del estudio contable: 224
 * cuentas con los códigos que el contador reconoce, en vez de las 50 genéricas
 * que sembró la fase 1. Eso cambia una cosa práctica en toda la UI: **una lista
 * desplegable ya no sirve**. Con 50 opciones se scrollea; con 224 no se
 * encuentra nada, y lo que pasa entonces es que se deja "sin imputar" —que es
 * justo lo que rompe el asiento después.
 *
 * De ahí las tres decisiones de este archivo:
 *
 *  1. **El plan se baja una sola vez por sesión.** Son 224 filas que no cambian
 *     durante el día; volver a pedirlas cada vez que se abre un formulario es
 *     latencia regalada. La promesa se cachea a nivel de módulo.
 *  2. **El filtrado es local y tolerante.** Sin acentos, por código o por
 *     nombre, y ordenado por qué tan bien matchea. Buscar "inter" tiene que
 *     traer `513 Internet` primero, no `180 Intereses a devengar`.
 *  3. **Las últimas usadas se recuerdan.** En la práctica una empresa imputa
 *     contra las mismas diez o quince cuentas; tenerlas arriba sin escribir nada
 *     es lo que hace que 224 no se sientan.
 */

import { useEffect, useState } from "react"

/* ── Vocabulario ──────────────────────────────────────────────────────────── */

/* Vive en `cuentas-vocabulario.ts` para que el servidor pueda usarlo sin
 * arrastrar los hooks de este archivo. Se reexporta para que las pantallas
 * sigan importando de un solo lugar. */
export {
  TIPOS_CUENTA,
  TIPO_CUENTA_LABEL,
  type TipoCuenta,
} from "@/lib/admin/cuentas-vocabulario"

import type { TipoCuenta } from "@/lib/admin/cuentas-vocabulario"

export type CuentaContable = {
  id: string
  codigo: string
  nombre: string
  tipo: TipoCuenta
  /** El código como número, que es el orden del papel del contador. Existe
   *  porque `codigo` es texto y ahí '10' ordena antes que '9'. */
  orden: number
  /** Lleva submayor: el saldo total no alcanza, hace falta saber cuánto es de
   *  cada quién. */
  llevaSubcuenta: boolean
  tipoSubcuenta: "cliente" | "proveedor" | null
  esBanco: boolean
  esValores: boolean
  libroIva: "compras" | "ventas" | null
  monedaExtranjera: boolean
  esMedioPago: boolean
}

export function etiquetaCuenta(c: CuentaContable): string {
  return `${c.codigo} · ${c.nombre}`
}

/* ── Búsqueda ─────────────────────────────────────────────────────────────── */

/** Sin acentos y en minúscula. Quien busca "credito" tiene que encontrar
 *  "IVA Crédito 21 %" — nadie tipea el acento en un buscador. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

/**
 * Filtra y **ordena por relevancia**, que es lo que separa un buscador útil de
 * uno que devuelve treinta filas en orden de código. El puntaje, de mejor a
 * peor: código exacto, código que empieza igual, nombre que empieza con el
 * término, palabra del nombre que empieza con el término, y por último cualquier
 * coincidencia adentro del texto.
 */
export function filtrarCuentas(cuentas: CuentaContable[], consulta: string): CuentaContable[] {
  const q = normalizar(consulta.trim())
  if (!q) return cuentas

  const puntuadas: { cuenta: CuentaContable; punto: number }[] = []

  for (const c of cuentas) {
    const codigo = c.codigo.toLowerCase()
    const nombre = normalizar(c.nombre)

    let punto = -1
    if (codigo === q) punto = 0
    else if (codigo.startsWith(q)) punto = 1
    else if (nombre.startsWith(q)) punto = 2
    else if (nombre.split(/\s+/).some((p) => p.startsWith(q))) punto = 3
    else if (nombre.includes(q)) punto = 4

    if (punto >= 0) puntuadas.push({ cuenta: c, punto })
  }

  return puntuadas
    .sort((a, b) => a.punto - b.punto || a.cuenta.orden - b.cuenta.orden)
    .map((p) => p.cuenta)
}

/* ── Últimas usadas ───────────────────────────────────────────────────────── */

const CLAVE_RECIENTES = "admin:cuentas-recientes"
const MAX_RECIENTES = 6

export function cuentasRecientes(): string[] {
  if (typeof window === "undefined") return []
  try {
    const crudo = window.localStorage.getItem(CLAVE_RECIENTES)
    const ids: unknown = crudo ? JSON.parse(crudo) : []
    return Array.isArray(ids) ? ids.filter((v): v is string => typeof v === "string") : []
  } catch {
    // localStorage puede estar deshabilitado o el JSON corrupto. Es una ayuda,
    // no un dato: sin recientes el selector funciona igual.
    return []
  }
}

export function recordarCuenta(id: string): void {
  if (typeof window === "undefined" || !id) return
  try {
    const previas = cuentasRecientes().filter((v) => v !== id)
    window.localStorage.setItem(
      CLAVE_RECIENTES,
      JSON.stringify([id, ...previas].slice(0, MAX_RECIENTES))
    )
  } catch {
    /* sin recientes se sigue igual */
  }
}

/* ── Carga ────────────────────────────────────────────────────────────────── */

/** La promesa, no el resultado: si dos formularios se abren a la vez, los dos
 *  esperan el mismo fetch en vez de disparar uno cada uno. */
let cache: Promise<CuentaContable[]> | null = null

export function cargarPlanCuentas(): Promise<CuentaContable[]> {
  if (!cache) {
    cache = fetch("/api/admin/plan-cuentas")
      .then((r) => r.json())
      .then((d) => (d.cuentas ?? []) as CuentaContable[])
      .catch((e) => {
        // Sin esto, un error de red deja la caché envenenada con una promesa
        // rechazada y el selector no se recupera nunca, ni recargando el
        // formulario.
        cache = null
        throw e
      })
  }
  return cache
}

/** Para después de tocar el plan de cuentas desde su pantalla de mantenimiento. */
export function olvidarPlanCuentas(): void {
  cache = null
}

/** El plan, listo para un formulario. Devuelve lista vacía mientras carga: los
 *  selectores ya manejan ese caso y un `undefined` obligaría a chequearlo en
 *  cada uno. */
export function usePlanCuentas(): { cuentas: CuentaContable[]; cargando: boolean } {
  const [cuentas, setCuentas] = useState<CuentaContable[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true
    cargarPlanCuentas()
      .then((c) => vigente && setCuentas(c))
      .catch(() => vigente && setCuentas([]))
      .finally(() => vigente && setCargando(false))
    return () => {
      vigente = false
    }
  }, [])

  return { cuentas, cargando }
}
