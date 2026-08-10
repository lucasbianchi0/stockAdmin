"use client"

import { useEffect } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Confirmación de una acción destructiva.
 *
 * Es un diálogo propio y no `window.confirm` por dos razones. La visible: el
 * nativo no deja explicar las consecuencias ni distinguir "dar de baja" de
 * "borrar para siempre", que acá son cosas distintas. La otra: bloquea el hilo
 * del navegador, y una confirmación que congela la página se siente como que la
 * app se colgó.
 */
export function ConfirmarDialog({
  abierto,
  titulo,
  descripcion,
  confirmar = "Confirmar",
  tono = "danger",
  trabajando = false,
  onCerrar,
  onConfirmar,
}: {
  abierto: boolean
  titulo: string
  descripcion: React.ReactNode
  confirmar?: string
  tono?: "danger" | "warning"
  trabajando?: boolean
  onCerrar: () => void
  onConfirmar: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !trabajando) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar, trabajando])

  if (!abierto) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={() => !trabajando && onCerrar()}
      />

      <div className="relative w-full rounded-t-2xl border border-line bg-surface p-5 shadow-e4 animate-in slide-in-from-bottom-4 fade-in-0 duration-200 sm:max-w-md sm:rounded-2xl sm:p-6">
        <div className="flex gap-3.5">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
              tono === "danger"
                ? "bg-danger-soft text-danger-text ring-danger-line"
                : "bg-warning-soft text-warning-text ring-warning-line"
            )}
          >
            <AlertTriangle className="h-[18px] w-[18px]" strokeWidth={1.9} />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">{titulo}</h2>
            <div className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
              {descripcion}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCerrar} disabled={trabajando}>
            Cancelar
          </Button>
          <Button
            variant={tono === "danger" ? "destructive" : "default"}
            onClick={onConfirmar}
            disabled={trabajando}
          >
            {trabajando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmar}
          </Button>
        </div>
      </div>
    </div>
  )
}
