"use client"

import { QueryClient, isServer, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

/**
 * La caché de datos del administrador.
 *
 * Todo lo que una pantalla lee del `/api/admin` pasa por acá, y por eso hay una
 * sola regla para saber si lo que se ve está al día: **después de cualquier
 * escritura se invalida todo lo que cuelga de `["admin"]`**.
 *
 * Por qué todo y no la clave exacta: en este módulo casi nada está aislado. Un
 * cobro mueve la cuenta corriente del cliente, el saldo de la caja, el extracto
 * del banco, el mayor y los pendientes de asiento. Invalidar con precisión
 * obligaría a que cada formulario sepa qué pantallas dependen de él, y el día que
 * alguien sume una se olvida. Invalidar es barato: solo se vuelve a pedir lo que
 * está montado en pantalla; el resto queda marcado y se refresca al volver.
 */

/** Cuánto se considera fresco un dato. Dentro de esta ventana, volver a una
 *  pantalla la muestra al instante sin pedir nada; pasada, la muestra igual y
 *  la refresca por detrás. */
const FRESCO_MS = 30_000

function crearCliente() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: FRESCO_MS,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: true,
        // Un 4xx no se arregla reintentando; un corte de red sí, una vez.
        retry: (fallos, error) =>
          fallos < 1 && !(error instanceof ErrorApi && error.status < 500),
      },
    },
  })
}

let clienteNavegador: QueryClient | undefined

/** En el servidor, uno por render —compartirlo filtraría datos entre pedidos—;
 *  en el navegador, uno solo para toda la pestaña. */
export function getQueryClient(): QueryClient {
  if (isServer) return crearCliente()
  return (clienteNavegador ??= crearCliente())
}

export class ErrorApi extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

/** `fetch` + JSON + el `error` que devuelven los handlers, como excepción. */
export async function pedirJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ErrorApi(
      (data as { error?: string }).error ?? "No se pudieron cargar los datos",
      res.status
    )
  }
  return data as T
}

/** Mensaje legible de un error de query o mutación. */
export function mensajeError(e: unknown, porDefecto = "No se pudieron cargar los datos"): string {
  return e instanceof Error ? e.message : porDefecto
}

/**
 * Las claves. Todas empiezan con "admin" para que una invalidación las alcance;
 * el resto es solo para que dos pedidos distintos no compartan entrada.
 */
export const claves = {
  todo: ["admin"] as const,
  url: (url: string) => ["admin", "url", url] as const,
  planCuentas: ["admin", "plan-cuentas"] as const,
  cotizacion: ["admin", "cotizacion"] as const,
}

/** Todo lo del administrador menos la cotización: el dólar viene de afuera y
 *  ninguna escritura nuestra lo mueve. */
const filtroInvalidacion = {
  queryKey: claves.todo,
  predicate: (q: { queryKey: readonly unknown[] }) => q.queryKey[1] !== claves.cotizacion[1],
}

/** Para después de guardar, anular o borrar: todo el administrador a refrescar. */
export function useInvalidarAdmin(): () => Promise<void> {
  const qc = useQueryClient()
  return useCallback(() => qc.invalidateQueries(filtroInvalidacion), [qc])
}

/** Lo mismo, fuera de un componente. */
export function invalidarAdmin(): Promise<void> {
  return getQueryClient().invalidateQueries(filtroInvalidacion)
}

/* ── Los otros módulos ──────────────────────────────────────────────────────
 *
 * Productos y marketing usan la misma caché con la misma regla, cada uno con su
 * raíz: guardar un brochure no tiene por qué volver a pedir el catálogo de
 * Distecna, que son miles de filas. Dentro de cada módulo sí se invalida todo,
 * por lo mismo que en administración: un producto elegido cambia Inventario,
 * Nuestros Productos y Pedidos a la vez.
 */

export type Modulo = "admin" | "productos" | "marketing" | "tickets"

/** La clave de un GET dentro de un módulo. */
export function claveDe(modulo: Modulo, url: string) {
  return [modulo, "url", url] as const
}

/** Después de una escritura: todo el módulo a refrescar. */
export function useInvalidar(modulo: Modulo): () => Promise<void> {
  const invalidarTodoAdmin = useInvalidarAdmin()
  const qc = useQueryClient()
  return useCallback(
    () =>
      modulo === "admin"
        ? invalidarTodoAdmin()
        : qc.invalidateQueries({ queryKey: [modulo] }),
    [modulo, qc, invalidarTodoAdmin]
  )
}
