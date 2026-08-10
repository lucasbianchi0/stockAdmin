"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * El motor de las tablas de administración: paginación, búsqueda y filtros
 * contra un endpoint que pagina del lado del servidor.
 *
 * Por qué del servidor y no del cliente, como la tabla de productos: el catálogo
 * está entero en caché y son unos miles de filas conocidas. Las facturas crecen
 * sin techo y nadie va a querer esperar a que bajen todas para ver la primera
 * página. La contrapartida es que cada tecleo es un fetch, y por eso el debounce
 * de acá no es un detalle de rendimiento sino parte del diseño.
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
  const [filas, setFilas] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [busqueda, setBusquedaRaw] = useState("")
  const [busquedaAplicada, setBusquedaAplicada] = useState("")
  const [cargando, setCargando] = useState(true)
  const [cargandoInicial, setCargandoInicial] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Un contador de pedidos en lugar de AbortController: lo que hay que evitar no
  // es el fetch de más, es que la respuesta de una búsqueda vieja pise a la
  // nueva cuando vuelven desordenadas.
  const pedido = useRef(0)

  // Serializado para poder compararlo por valor en las dependencias: el objeto
  // `filtros` se recrea en cada render del componente que llama.
  const filtrosSerializados = JSON.stringify(filtros ?? {})

  const cargar = useCallback(async () => {
    const mio = ++pedido.current
    setCargando(true)
    setError(null)

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

    try {
      const res = await fetch(`${endpoint}?${params}`)
      const data = await res.json()
      if (mio !== pedido.current) return
      if (!res.ok) throw new Error(data.error ?? "Error")
      setFilas(data[clave] ?? [])
      setTotal(data.total ?? 0)
    } catch (e) {
      if (mio !== pedido.current) return
      setFilas([])
      setTotal(0)
      setError(e instanceof Error ? e.message : "No se pudieron cargar los datos")
    } finally {
      if (mio === pedido.current) {
        setCargando(false)
        setCargandoInicial(false)
      }
    }
  }, [endpoint, clave, pagina, porPagina, busquedaAplicada, filtrosSerializados])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Escribir en el buscador vuelve a la página 1: quedarse en la 4 de un
  // resultado que ahora tiene 2 páginas muestra una tabla vacía que parece un bug.
  const setBusqueda = useCallback((v: string) => {
    setBusquedaRaw(v)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      setBusquedaAplicada(busqueda.trim())
      setPagina(1)
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [busqueda])

  // Lo mismo al cambiar un filtro.
  useEffect(() => {
    setPagina(1)
  }, [filtrosSerializados])

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))

  const irA = useCallback(
    (p: number) => setPagina(Math.min(Math.max(1, p), Math.max(1, totalPaginas))),
    [totalPaginas]
  )

  return {
    filas,
    total,
    pagina,
    porPagina,
    totalPaginas,
    busqueda,
    cargando,
    cargandoInicial,
    error,
    setBusqueda,
    irA,
    recargar: cargar,
  }
}
