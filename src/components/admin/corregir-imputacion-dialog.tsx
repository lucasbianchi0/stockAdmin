"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, BookOpen, Check, Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { SelectorCuenta } from "@/components/admin/selector-cuenta"
import { Button } from "@/components/ui/button"
import type { DocumentoSinAsiento } from "@/lib/admin/asientos"
import { formatearFecha } from "@/lib/admin/fecha"
import { formatearImporte } from "@/lib/admin/moneda"
import { cn } from "@/lib/utils"

/**
 * Arreglar, desde un solo lugar, todo lo que quedó fuera del mayor.
 *
 * La pantalla está armada para que decidir sea posible sin salir de acá: cada
 * fila muestra de quién es el documento, qué dice su detalle y cuánto es, que
 * son los tres datos con los que un contador elige la cuenta. Sin eso hay que
 * abrir la factura en otra solapa para poder contestar, y una corrección que
 * obliga a navegar es una corrección que no se hace.
 *
 * Se guarda de a una y no todo junto al final. Son decisiones independientes
 * —cada documento va a una cuenta distinta— y si la quinta falla, las cuatro
 * anteriores ya están arregladas.
 */
export function CorregirImputacionDialog({
  abierto,
  documentos,
  onCerrar,
  onCorregido,
}: {
  abierto: boolean
  documentos: DocumentoSinAsiento[]
  onCerrar: () => void
  onCorregido: () => void
}) {
  /** documento → cuenta elegida en el formulario, todavía sin guardar. */
  const [elegidas, setElegidas] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState<string | null>(null)
  const [resueltos, setResueltos] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!abierto) return
    setElegidas({})
    setResueltos(new Set())
  }, [abierto])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !guardando) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar, guardando])

  if (!abierto) return null

  const imputar = async (d: DocumentoSinAsiento) => {
    const cuentaContableId = elegidas[d.id]
    if (!cuentaContableId) return

    setGuardando(d.id)
    try {
      const res = await fetch("/api/admin/contabilidad/imputar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ origen: d.origen, id: d.id, cuentaContableId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo imputar")

      if (data.ok) {
        setResueltos((prev) => new Set(prev).add(d.id))
        onCorregido()
      } else {
        // La cuenta se guardó pero el asiento sigue sin salir. Pasa cuando falta
        // una cuenta de sistema en la configuración contable: es un problema de
        // otro orden y decirlo tal cual evita que alguien pruebe cinco cuentas.
        toast.warning("Se imputó, pero sigue sin asiento", { description: data.motivo })
        onCorregido()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo imputar")
    } finally {
      setGuardando(null)
    }
  }

  const pendientes = documentos.filter((d) => !resueltos.has(d.id))

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Corregir documentos sin asiento"
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={() => !guardando && onCerrar()}
      />

      <div className="relative flex max-h-[94vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-6 fade-in-0 duration-250 sm:max-h-[90vh] sm:max-w-3xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning-text">
              <BookOpen className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
                Documentos fuera del mayor
              </h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                Elegí contra qué cuenta va cada uno. El asiento se genera solo al guardar.
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            disabled={Boolean(guardando)}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 sm:px-6">
          {pendientes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success-soft text-success">
                <Check className="h-5 w-5" strokeWidth={2.3} />
              </div>
              <p className="text-[13.5px] font-semibold text-ink">Todo asentado</p>
              <p className="text-[12px] text-ink-muted">
                Los documentos ya están en el libro diario.
              </p>
            </div>
          ) : (
            pendientes.map((d) => {
              const yaTieneCuenta = Boolean(d.cuentaContableId)
              const esteGuardando = guardando === d.id

              return (
                <div key={d.id} className="rounded-xl border border-line bg-surface px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-[13px] font-semibold text-ink">{d.referencia}</span>
                    <span className="num text-[11.5px] text-ink-muted">
                      {formatearFecha(d.fecha)}
                    </span>
                    <span className="num ml-auto text-[14px] font-bold text-ink">
                      {formatearImporte(d.importeArs)}
                    </span>
                  </div>

                  {/* De quién es y de qué se trata: los dos datos que permiten
                      elegir la cuenta sin abrir el documento. */}
                  <p className="mt-0.5 text-[12px] text-ink-secondary">
                    {d.contraparte ?? (d.origen === "movimiento" ? "Movimiento de banco" : "—")}
                    {d.detalle && (
                      <span className="text-ink-muted"> · {d.detalle}</span>
                    )}
                  </p>

                  <p
                    className={cn(
                      "mt-1.5 flex items-start gap-1.5 text-[11.5px]",
                      yaTieneCuenta ? "text-danger-text" : "text-warning-text"
                    )}
                  >
                    <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                    {d.motivo}
                  </p>

                  {yaTieneCuenta ? (
                    /* Ya tiene cuenta: el problema es otro y cambiarla no lo va a
                       arreglar. Ofrecer el selector igual sería mandar a alguien a
                       probar cuentas hasta que salga. */
                    <p className="mt-2 rounded-lg bg-surface-subtle px-3 py-2 text-[11.5px] text-ink-muted">
                      Este documento ya está imputado, así que la falla es del motor de
                      asientos y no de la cuenta. Suele ser una cuenta de sistema sin
                      configurar en el plan contable — mostrale este motivo a quien lleva la
                      contabilidad.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <SelectorCuenta
                          id={`imputar-${d.id}`}
                          valor={elegidas[d.id] ?? ""}
                          onElegir={(v) => setElegidas((prev) => ({ ...prev, [d.id]: v }))}
                          disabled={esteGuardando}
                          tipoSugerido={
                            d.tipo === "venta" ? "ingreso" : d.tipo === "compra" ? "egreso" : undefined
                          }
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => imputar(d)}
                        disabled={!elegidas[d.id] || esteGuardando}
                        className="shrink-0"
                      >
                        {esteGuardando ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Imputar
                      </Button>
                    </div>
                  )}

                  {/* Lo que se gana además de arreglar este documento. Sin
                      decirlo, la acción parece un parche y no una configuración. */}
                  {!yaTieneCuenta && d.origen === "comprobante" && d.contraparte && (
                    <p className="mt-1.5 text-[11px] text-ink-faint">
                      La cuenta queda guardada en la ficha de {d.contraparte}: sus próximas
                      facturas ya vienen con ella.
                    </p>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="shrink-0 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          <div className="flex items-center justify-end gap-2">
            <p className="mr-auto text-[12px] text-ink-muted">
              {pendientes.length === 0
                ? "No queda nada pendiente"
                : `${pendientes.length} sin asentar`}
            </p>
            <Button variant={pendientes.length === 0 ? "default" : "outline"} onClick={onCerrar}>
              {pendientes.length === 0 ? "Listo" : "Cerrar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
