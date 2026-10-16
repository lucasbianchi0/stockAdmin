"use client"

import type React from "react"
import { useEffect } from "react"
import { Check, X } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Un diálogo con pasos numerados arriba: para las cargas que alguien hace pocas
 * veces y no tiene por qué recordar —un ítem de stock con su stock inicial, el
 * asiento de apertura que pasa el estudio, mover la fecha de un ejercicio—.
 *
 * La regla de todos los que lo usan: **lo último siempre es revisar**. Antes de
 * guardar se muestra lo que va a pasar, con los números, y recién ahí se
 * confirma. Una carga contable que se descubre mal después es mucho más cara
 * que un paso más.
 */
export function DialogoPasos({
  abierto,
  titulo,
  pasos,
  paso,
  onCerrar,
  children,
  pie,
  ancho = "md",
  bloqueado = false,
}: {
  abierto: boolean
  titulo: string
  /** Los nombres cortos de cada paso, en orden. */
  pasos: string[]
  /** El paso actual, desde 0. */
  paso: number
  onCerrar: () => void
  children: React.ReactNode
  pie: React.ReactNode
  ancho?: "md" | "lg" | "xl"
  /** Mientras se guarda: no se cierra con Escape ni tocando afuera. */
  bloqueado?: boolean
}) {
  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !bloqueado) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [abierto, bloqueado, onCerrar])

  if (!abierto) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={() => !bloqueado && onCerrar()}
      />

      <div
        className={cn(
          "relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-4 fade-in-0 duration-200 sm:rounded-2xl",
          ancho === "md" && "sm:max-w-lg",
          ancho === "lg" && "sm:max-w-2xl",
          ancho === "xl" && "sm:max-w-4xl"
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-ink">{titulo}</h2>
            <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5" aria-label="Pasos">
              {pasos.map((nombre, i) => (
                <li key={nombre} className="flex items-center gap-2">
                  <span
                    aria-current={i === paso ? "step" : undefined}
                    className={cn(
                      "flex items-center gap-1.5 text-[12px] font-medium",
                      i === paso ? "text-brand-700" : i < paso ? "text-ink-secondary" : "text-ink-faint"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold",
                        i === paso && "bg-brand-600 text-white",
                        i < paso && "bg-success-soft text-success-text",
                        i > paso && "bg-surface-muted text-ink-faint"
                      )}
                    >
                      {i < paso ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                    </span>
                    {nombre}
                  </span>
                  {i < pasos.length - 1 && <span className="h-px w-4 bg-line" aria-hidden />}
                </li>
              ))}
            </ol>
          </div>
          <button
            onClick={onCerrar}
            disabled={bloqueado}
            aria-label="Cerrar"
            className="-mr-1 rounded-md p-1 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5 sm:rounded-b-2xl sm:px-6">
          {pie}
        </div>
      </div>
    </div>
  )
}

/** Un dato del paso de revisión: rótulo chico arriba, valor abajo. */
export function DatoRevision({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow">{rotulo}</p>
      <div className="mt-0.5 text-[13px] text-ink">{children}</div>
    </div>
  )
}
