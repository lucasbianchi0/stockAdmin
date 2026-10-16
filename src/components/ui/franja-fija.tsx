"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

/**
 * Una franja que queda pegada abajo del encabezado de la página al bajar.
 *
 * Es para los totales de un reporte: la tabla es larga y lo que se quiere tener
 * a la vista mientras se la recorre es el resumen de arriba.
 *
 * ── POR QUE MIDE EL ENCABEZADO EN VEZ DE USAR UN `top` FIJO ──
 *
 * `PageHeader` también es sticky y su alto cambia: con o sin link de vuelta,
 * con o sin descripción, y en el teléfono la descripción ocupa dos líneas. Un
 * `top-[88px]` queda bien en una pantalla y tapado o flotando en las demás. Se
 * mide el encabezado de la misma página y se sigue con un ResizeObserver.
 *
 * ── LO QUE TIENE QUE CUMPLIR QUIEN LA USA ──
 *
 * Ningún ancestro entre la franja y el área que scrollea puede tener
 * `overflow-hidden` ni `overflow-auto`: cualquiera de los dos pasa a ser el
 * contenedor del sticky y la franja deja de pegarse. Para recortar esquinas
 * redondeadas va `overflow-clip`, que recorta igual sin crear un contenedor.
 */
export function FranjaFija({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(0)
  const [pegada, setPegada] = useState(false)

  useEffect(() => {
    const encabezado = ref.current?.closest("main")?.querySelector("header")
    if (!encabezado) return
    const medir = () => setTop(encabezado.getBoundingClientRect().height)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(encabezado)
    return () => observador.disconnect()
  }, [])

  // Pegada, la franja lleva una sombra: sin ella, las filas que pasan por
  // debajo parecen cortadas en vez de tapadas.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observador = new IntersectionObserver(
      ([entrada]) => setPegada(entrada.intersectionRatio < 1),
      { rootMargin: `-${top + 1}px 0px 0px 0px`, threshold: [1] }
    )
    observador.observe(el)
    return () => observador.disconnect()
  }, [top])

  return (
    <div
      ref={ref}
      style={{ top }}
      className={cn(
        "sticky z-10 transition-shadow duration-200",
        pegada && "shadow-[0_6px_12px_-8px_rgb(15_23_42/0.25)]",
        className
      )}
    >
      {children}
    </div>
  )
}
