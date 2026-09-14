"use client"

import { useCallback, useEffect, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { claves, mensajeError, pedirJson } from "@/lib/admin/query"

/**
 * El motor de las tablas de administración: paginación, búsqueda y filtros
 * contra un endpoint que pagina del lado del servidor.
 *
 * Por qué del servidor y no del cliente, como la tabla de productos: el catálogo
 * está entero en caché y son unos miles de filas conocidas. Las facturas crecen
 * sin techo y nadie va a querer esperar a que bajen todas para ver la primera
 * página. La contrapartida es que cada tecleo es un fetch, y por eso el debounce
 * de acá no es un detalle de rendimiento sino parte del diseño.
 *
 * Cada combinación de página, búsqueda y filtros es una entrada de la caché de
 * TanStack Query: volver a una pantalla o a una página ya vista la muestra al
 * instante, y cualquier escritura del módulo la invalida (ver `@/lib/admin/query`).
 */

const DEBOUNCE_MS = 300
export const POR_PAGINA_DEFAULT = 25

export type RespuestaPaginada<T> = {
  filas: T[]
  total: number
}

type Opciones = {
  /** Endpoint que responde `{ <clave>: [...], total: n }`. */
  endpoint: string
  /** La clave del array dentro de la respuesta: "clientes", "comprobantes"… */
  clave: string
  /** Filtros extra que se agregan al query string. `undefined` se omite. */
  filtros?: Record<string, string | undefined>
  porPagina?: number
}

export type Tabla<T> = {
  filas: T[]
  total: number
  pagina: number
  porPagina: number
  totalPaginas: number
  busqueda: string
  cargando: boolean
  /** Solo el primer fetch. Los siguientes atenúan la tabla en vez de vaciarla. */
  cargandoInicial: boolean
  error: string | null
  setBusqueda: (v: string) => void
  irA: (p: number) => void
  recargar: () => void
}

export function useTablaAdmin<T>({
  endpoint,
  clave,
  filtros,
  porPagina = POR_PAGINA_DEFAULT,
}: Opciones): Tabla<T> {
  const [pagina, setPagina] = useState(1)
  const [busqueda, setBusqueda] = useState("")
  const [busquedaAplicada, setBusquedaAplicada] = useState("")

  // Serializado para poder compararlo por valor: el objeto `filtros` se recrea
  // en cada render del componente que llama.
  const filtrosSerializados = JSON.stringify(filtros ?? {})

  // Cambiar la búsqueda o un filtro vuelve a la página 1: quedarse en la 4 de un
  // resultado que ahora tiene 2 páginas muestra una tabla vacía que parece un
  // bug. Se ajusta durante el render y no en un efecto para no pedir primero la
  // página vieja con el filtro nuevo.
  const criterio = `${busquedaAplicada}|${filtrosSerializados}`
  const [criterioPrevio, setCriterioPrevio] = useState(criterio)
  if (criterio !== criterioPrevio) {
    setCriterioPrevio(criterio)
    setPagina(1)
  }

  useEffect(() => {
    const t = setTimeout(() => setBusquedaAplicada(busqueda.trim()), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [busqueda])

  const params = new URLSearchParams({
    pagina: String(pagina),
    porPagina: String(porPagina),
  })
  if (busquedaAplicada) params.set("q", busquedaAplicada)
  for (const [k, v] of Object.entries(
    JSON.parse(filtrosSerializados) as Record<string, string | undefined>
  )) {
    if (v !== undefined && v !== "") params.set(k, v)
  }
  const url = `${endpoint}?${params}`

  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<Record<string, unknown>>(url, { signal }),
    // Mientras llega la página nueva se sigue viendo la anterior, atenuada.
    placeholderData: keepPreviousData,
  })

  const total = query.isError ? 0 : Number(query.data?.total ?? 0)
  const filas = query.isError ? [] : ((query.data?.[clave] as T[] | undefined) ?? [])
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))

  const irA = useCallback(
    (p: number) => setPagina(Math.min(Math.max(1, p), Math.max(1, totalPaginas))),
    [totalPaginas]
  )

  const { refetch } = query
  const recargar = useCallback(() => {
    void refetch()
  }, [refetch])

  return {
    filas,
    total,
    pagina,
    porPagina,
    totalPaginas,
    busqueda,
    cargando: query.isFetching,
    cargandoInicial: query.isPending,
    error: query.isError ? mensajeError(query.error) : null,
    setBusqueda,
    irA,
    recargar,
  }
}
