"use client"

import Link from "next/link"
import {
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  Clock,
  FileText,
  Landmark,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  modulosImpactados,
  type ClaveModulo,
  type Impacto,
  type ModuloImpactado,
} from "@/lib/admin/impacto"
import { cn } from "@/lib/utils"

/**
 * Qué se movió en el resto del sistema, después de guardar.
 *
 * Es un informe, no una confirmación. Aparece cuando la carga ya ocurrió y no
 * hay nada que decidir — por eso se cierra con Escape, con un click afuera y con
 * un solo botón, y por eso ninguna de sus filas es obligatoria de leer.
 *
 * DOS COSAS QUE HACE A PROPOSITO
 *
 * **Muestra lo que NO pasó.** Caja y bancos aparece siempre, diciendo que no se
 * movió. Es la fila más útil de la lista: la pregunta que sigue a "cargué la
 * factura" es "¿y por qué el banco sigue igual?", y contestarla antes de que se
 * haga evita el reflejo de ir a cargar el movimiento a mano y duplicarlo cuando
 * después se registre el pago.
 *
 * **Cada módulo es un link.** Si el resumen dice que dos comprobantes quedaron
 * sin asiento, se va a arreglarlos desde acá. Un informe del que no se puede
 * salir hacia ningún lado se lee una vez y después se cierra sin mirar.
 */

const ICONO: Record<ClaveModulo, LucideIcon> = {
  comprobantes: FileText,
  entidades: Building2,
  contabilidad: BookOpen,
  cobranza: Wallet,
  bancos: Landmark,
}

/** El tono no decora: dice qué mirar. Ámbar es lo único que pide una acción. */
const TONO: Record<ModuloImpactado["tono"], { icono: LucideIcon; clase: string; caja: string }> = {
  hecho: { icono: Check, clase: "text-success", caja: "bg-success-soft/50 text-success" },
  aviso: { icono: Clock, clase: "text-warning-text", caja: "bg-warning-soft text-warning-text" },
  pendiente: { icono: Clock, clase: "text-ink-faint", caja: "bg-surface-muted text-ink-muted" },
}

export function ImpactoDialog({
  impacto,
  onCerrar,
}: {
  /** `null` cierra el diálogo: es el mismo estado que "no hay nada que mostrar". */
  impacto: Impacto | null
  onCerrar: () => void
}) {
  if (!impacto) return null

  const modulos = modulosImpactados(impacto)
  const confirmado = impacto.estado === "confirmado"

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Resumen de impacto"
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={onCerrar}
      />

      <div className="relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-6 fade-in-0 duration-250 sm:max-w-lg sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                confirmado ? "bg-success-soft text-success" : "bg-brand-50 text-brand-600"
              )}
            >
              <Check className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
                {confirmado ? "Listo — esto se movió" : "Guardado — esto queda pendiente"}
              </h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                {confirmado
                  ? "El resumen sale de la base, no de lo que se mandó"
                  : "Los borradores impactan recién cuando los confirmás"}
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <ul className="space-y-1">
            {modulos.map((m) => {
              const Icono = ICONO[m.clave]
              const tono = TONO[m.tono]
              const Marca = tono.icono

              return (
                <li key={m.clave}>
                  <Link
                    href={m.href}
                    onClick={onCerrar}
                    className="group flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-subtle"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                        tono.caja
                      )}
                    >
                      <Icono className="h-[15px] w-[15px]" strokeWidth={1.9} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-ink">{m.titulo}</span>
                        <Marca className={cn("h-3 w-3 shrink-0", tono.clase)} strokeWidth={2.4} />
                        <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                      {m.lineas.map((linea, i) => (
                        <span
                          key={i}
                          className={cn(
                            "mt-0.5 block text-[12px] leading-[1.45]",
                            i === 0 ? "text-ink-secondary" : "text-ink-muted"
                          )}
                        >
                          {linea}
                        </span>
                      ))}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="shrink-0 border-t border-line bg-surface-subtle px-5 py-3.5">
          <div className="flex items-center justify-end gap-2">
            <p className="mr-auto text-[11.5px] text-ink-muted">
              Tocá un módulo para ir a verlo
            </p>
            <Button onClick={onCerrar}>Entendido</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
