"use client"

import * as React from "react"
import Image from "next/image"

import { cn } from "@/lib/utils"
import { useChatbot } from "./provider"

/**
 * El botón flotante.
 *
 * En escritorio queda fijo abajo a la derecha. En el teléfono es más chico y se
 * puede arrastrar —tapa contenido distinto en cada pantalla, y la persona sabe
 * mejor que nadie dónde le molesta menos—; la posición se guarda en
 * `localStorage`. Sólo se arrastra con el dedo: con mouse, un arrastre
 * accidental al hacer click movería el botón de lugar sin querer.
 *
 * Con el panel abierto se oculta: en el teléfono el panel es pantalla completa
 * y en escritorio se abre justo encima.
 */

const CLAVE_POSICION = "accedra-asistente:boton"
const MARGEN = 12
const UMBRAL_ARRASTRE = 6

type Posicion = { derecha: number; abajo: number }

function leerPosicion(): Posicion | null {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE_POSICION) ?? "null")
    return p && typeof p.derecha === "number" && typeof p.abajo === "number" ? p : null
  } catch {
    return null
  }
}

export function Launcher() {
  const { abierto, abrir } = useChatbot()
  const boton = React.useRef<HTMLButtonElement>(null)
  // null hasta montar: en el servidor no hay viewport, y la posición guardada
  // aplicada en el primer render desencajaría la hidratación.
  const [posicion, setPosicion] = React.useState<Posicion | null>(null)
  const arrastre = React.useRef<{
    x: number
    y: number
    inicio: Posicion
    movido: boolean
  } | null>(null)

  React.useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setPosicion(leerPosicion())
  }, [])

  const acotar = (p: Posicion): Posicion => {
    const lado = boton.current?.offsetWidth ?? 56
    return {
      derecha: Math.min(Math.max(p.derecha, MARGEN), window.innerWidth - lado - MARGEN),
      abajo: Math.min(Math.max(p.abajo, MARGEN), window.innerHeight - lado - MARGEN),
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== "touch") return
    const rect = e.currentTarget.getBoundingClientRect()
    arrastre.current = {
      x: e.clientX,
      y: e.clientY,
      inicio: { derecha: window.innerWidth - rect.right, abajo: window.innerHeight - rect.bottom },
      movido: false,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const a = arrastre.current
    if (!a) return
    const dx = e.clientX - a.x
    const dy = e.clientY - a.y
    if (!a.movido && Math.hypot(dx, dy) < UMBRAL_ARRASTRE) return
    a.movido = true
    setPosicion(acotar({ derecha: a.inicio.derecha - dx, abajo: a.inicio.abajo - dy }))
  }

  const onPointerUp = () => {
    const a = arrastre.current
    arrastre.current = null
    if (a?.movido && posicion) {
      try {
        localStorage.setItem(CLAVE_POSICION, JSON.stringify(posicion))
      } catch {}
    }
  }

  const onClick = (e: React.MouseEvent) => {
    // El click que cierra un arrastre no abre el panel.
    if (arrastre.current?.movido) {
      e.preventDefault()
      return
    }
    abrir()
  }

  if (abierto) return null

  return (
    <button
      ref={boton}
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label="Abrir el asistente"
      title="Asistente"
      style={
        posicion ? { right: posicion.derecha, bottom: posicion.abajo, touchAction: "none" } : undefined
      }
      className={cn(
        "chat-latido fixed z-40 flex touch-none select-none items-center justify-center rounded-full",
        "bg-gradient-to-b from-navy-800 to-navy-950 ring-1 ring-white/10",
        "transition-transform duration-200 hover:scale-[1.04] active:scale-95",
        "h-14 w-14 md:h-[72px] md:w-[72px]",
        !posicion && "bottom-4 right-4 md:bottom-6 md:right-6"
      )}
    >
      <Image
        src="/brand/accedra-isotipo-blanco.svg"
        alt=""
        width={200}
        height={200}
        className="h-6 w-6 md:h-8 md:w-8"
        unoptimized
        draggable={false}
      />
      <span
        aria-hidden
        className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-navy-900 bg-brand-400 md:right-1 md:top-1"
      />
    </button>
  )
}
