"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { usePresencia } from "@/lib/use-presencia"
import { cn } from "@/lib/utils"

/**
 * Un menú desplegable mínimo: un disparador y una lista de opciones que se
 * cierra al elegir, al clickear afuera, con Escape o al scrollear.
 *
 * Propio y no de Radix porque el repo no tiene ningún primitivo de menú y para
 * esto alcanza con poco. La lista se dibuja en un portal con posición fija: los
 * menús de las filas viven adentro de una tabla con scroll horizontal, y un
 * `absolute` ahí adentro queda recortado justo en las últimas filas.
 *
 * `lado` decide hacia dónde abre (la barra de selección está abajo de todo, así
 * que su menú abre para arriba); si no entra, se da vuelta solo.
 */
export function Menu({
  disparador,
  children,
  lado = "abajo",
  alinear = "fin",
  className,
}: {
  disparador: (abrir: () => void, abierto: boolean) => React.ReactNode
  children: (cerrar: () => void) => React.ReactNode
  lado?: "abajo" | "arriba"
  alinear?: "inicio" | "fin"
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState<React.CSSProperties | null>(null)
  const ancla = useRef<HTMLDivElement>(null)
  const lista = useRef<HTMLDivElement>(null)

  const cerrar = useCallback(() => setAbierto(false), [])
  const { montado, saliendo } = usePresencia(abierto, 110)

  // Se calcula con el menú ya montado para saber cuánto mide y si entra.
  useLayoutEffect(() => {
    if (!abierto || !ancla.current) return
    const r = ancla.current.getBoundingClientRect()
    const alto = lista.current?.offsetHeight ?? 0
    const entraAbajo = r.bottom + 6 + alto <= window.innerHeight - 8
    const entraArriba = r.top - 8 - alto >= 8
    const haciaArriba = lado === "arriba" ? entraArriba || !entraAbajo : !entraAbajo && entraArriba

    setPos({
      position: "fixed",
      // Crece desde el botón y no desde su centro.
      transformOrigin: `${haciaArriba ? "bottom" : "top"} ${alinear === "fin" ? "right" : "left"}`,
      ...(haciaArriba ? { bottom: window.innerHeight - r.top + 8 } : { top: r.bottom + 6 }),
      ...(alinear === "fin"
        ? { right: Math.max(8, window.innerWidth - r.right) }
        : { left: Math.max(8, r.left) }),
    })
  }, [abierto, lado, alinear])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node
      if (!ancla.current?.contains(t) && !lista.current?.contains(t)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false)
    }
    // Con posición fija, scrollear la página lo dejaría flotando lejos del
    // botón. Se cierra, como los menús del sistema.
    const scroll = (e: Event) => {
      if (!lista.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener("mousedown", fuera)
    document.addEventListener("keydown", tecla)
    window.addEventListener("scroll", scroll, true)
    window.addEventListener("resize", cerrar)
    return () => {
      document.removeEventListener("mousedown", fuera)
      document.removeEventListener("keydown", tecla)
      window.removeEventListener("scroll", scroll, true)
      window.removeEventListener("resize", cerrar)
    }
  }, [abierto, cerrar])

  return (
    <div ref={ancla} className="relative inline-flex">
      {disparador(() => {
        if (!abierto) setPos(null)
        setAbierto((v) => !v)
      }, abierto)}
      {montado &&
        createPortal(
          <div
            ref={lista}
            role="menu"
            style={pos ?? { position: "fixed", top: -9999, left: -9999 }}
            className={cn(
              "z-[80] max-h-[min(420px,calc(100dvh-24px))] min-w-[220px] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-e4",
              // Solo un fundido corto: con escala, al abrir y cerrar rápido se
              // veía un parpadeo.
              // `[animation-duration]` y no `duration-*`: en Tailwind 4 esa clase
              // también pone una transición a todo y la lista volaba desde
              // donde nace (-9999) hasta el botón.
              "transition-none",
              saliendo
                ? "pointer-events-none animate-out fade-out-0 fill-mode-forwards [animation-duration:75ms]"
                : pos && "animate-in fade-in-0 [animation-duration:100ms]",
              className
            )}
          >
            {children(cerrar)}
          </div>,
          document.body
        )}
    </div>
  )
}

export function MenuItem({
  onClick,
  children,
  tono = "normal",
  activo = false,
  disabled = false,
}: {
  onClick: () => void
  children: React.ReactNode
  tono?: "normal" | "danger"
  activo?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0",
        tono === "danger"
          ? "text-danger-text hover:bg-danger-soft"
          : activo
            ? "bg-brand-50 text-brand-700"
            : "text-ink-secondary hover:bg-surface-muted hover:text-ink"
      )}
    >
      {children}
    </button>
  )
}

export function MenuRotulo({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow px-2.5 pb-1 pt-2">{children}</p>
}

export function MenuSeparador() {
  return <div className="my-1 h-px bg-line-soft" />
}
