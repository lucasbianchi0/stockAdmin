"use client"

import { useCallback } from "react"
import { useQuery } from "@tanstack/react-query"

import { claves } from "@/lib/admin/query"

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
 *
 * Una sola entrada de caché para toda la pestaña: la tira y cada formulario
 * que se abre leen la misma, en vez de pedir el dólar cada uno.
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

type Dolar = { venta: number; updatedAt: string | null }

async function pedirDolar(): Promise<Dolar> {
  const res = await fetch("/api/dolar")
  const data = await res.json()
  if (!res.ok || typeof data.venta !== "number") throw new Error("sin cotización")
  return { venta: data.venta, updatedAt: data.updatedAt ?? null }
}

export function useCotizacion(): Cotizacion {
  const query = useQuery({
    queryKey: claves.cotizacion,
    queryFn: pedirDolar,
    staleTime: 5 * 60_000,
  })

  const { refetch } = query
  const refrescar = useCallback(() => {
    void refetch()
  }, [refetch])

  // Si un refresco falla, TanStack conserva la cotización anterior: seguir
  // mostrándola vieja es mejor que dejar el TC vacío en medio de una carga.
  return {
    venta: query.data?.venta ?? null,
    actualizado: query.data?.updatedAt ?? null,
    cargando: query.isFetching,
    error: query.isError,
    refrescar,
  }
}
