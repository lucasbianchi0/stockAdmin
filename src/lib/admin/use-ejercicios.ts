"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import type { Ejercicio } from "@/lib/admin/ejercicios"
import { claves, pedirJson } from "@/lib/admin/query"

const URL = "/api/admin/ejercicios"

/** Los ejercicios contables, del más viejo al más nuevo. */
export function useEjercicios(): { ejercicios: Ejercicio[]; cargando: boolean } {
  const q = useQuery({
    queryKey: claves.url(URL),
    queryFn: ({ signal }) => pedirJson<{ ejercicios: Ejercicio[] }>(URL, { signal }),
    staleTime: 5 * 60_000,
  })
  return { ejercicios: q.data?.ejercicios ?? [], cargando: q.isPending }
}

/**
 * El rango de fechas de una vista contable, que arranca en un ejercicio.
 *
 * Por defecto el ejercicio en curso: es lo que se mira casi siempre, y abrir el
 * libro diario con todo lo asentado desde el primer día obliga a acotarlo
 * antes de poder leerlo. Si la URL trae `?ejercicio=<id>` (los enlaces de la
 * ficha de un ejercicio), arranca en ese; con `?ejercicio=todos`, sin filtro;
 * con `?desde=…&hasta=…`, en ese rango.
 *
 * `listo` es falso hasta saber qué ejercicio toca: así la vista no pide primero
 * todo y un instante después lo del ejercicio.
 */
export function useRangoDeEjercicio() {
  const { ejercicios, cargando } = useEjercicios()
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [listo, setListo] = useState(false)

  useEffect(() => {
    if (listo || cargando) return
    const params = new URLSearchParams(window.location.search)
    // Un rango explícito gana: es el «Ver» de un mes en la ficha del ejercicio.
    const d = params.get("desde")
    const h = params.get("hasta")
    if (d && h) {
      setDesde(d)
      setHasta(h)
      setListo(true)
      return
    }
    const pedido = params.get("ejercicio")
    const elegido =
      pedido === "todos"
        ? null
        : (ejercicios.find((e) => String(e.id) === pedido) ?? ejercicios.find((e) => e.enCurso) ?? null)
    if (elegido) {
      setDesde(elegido.inicio)
      setHasta(elegido.fin)
    }
    setListo(true)
  }, [ejercicios, cargando, listo])

  return { desde, hasta, setDesde, setHasta, listo, ejercicios }
}
