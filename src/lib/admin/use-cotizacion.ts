"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * La cotización del dólar oficial venta (Banco Nación), compartida por todo el
 * módulo administración.
 *
 * Es la misma fuente que usa el módulo de productos para calcular precios — a
 * propósito. Si la factura de un cliente se valuara con un dólar distinto del
 * que se usó para cotizarle, los números de las dos pantallas no cerrarían y no
 * habría forma de explicar la diferencia.
 *
 * Devuelve `venta` como sugerencia, no como verdad: cada documento guarda su
 * propio TC y el formulario deja pisarlo. La operación real pudo cerrarse a otro
 * tipo de cambio, y el sistema tiene que poder reflejar lo que pasó y no lo que
 * debería haber pasado.
 */

export type Cotizacion = {
  /** Pesos por dólar. `null` mientras carga o si la API no respondió. */
  venta: number | null
  /** Cuándo la actualizó la fuente, no cuándo la pedimos nosotros. */
  actualizado: string | null
  cargando: boolean
  error: boolean
  refrescar: () => void
}

export function useCotizacion(): Cotizacion {
  const [venta, setVenta] = useState<number | null>(null)
  const [actualizado, setActualizado] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch("/api/dolar")
      const data = await res.json()
      if (!res.ok || typeof data.venta !== "number") throw new Error("sin cotización")
      setVenta(data.venta)
      setActualizado(data.updatedAt ?? null)
      setError(false)
    } catch {
      // No se limpia `venta`: si ya había una cotización, seguir mostrándola
      // vieja es mejor que dejar el campo del TC vacío en medio de una carga.
      setError(true)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  return { venta, actualizado, cargando, error, refrescar: cargar }
}
