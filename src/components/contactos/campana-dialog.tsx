"use client"

import { useEffect, useState } from "react"
import { Loader2, Mail, MessageCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ListaPlantillas } from "@/components/contactos/escribir-dialog"
import type { PlantillaParaEnviar } from "@/lib/contactos-compartido"
import { usePresencia } from "@/lib/use-presencia"
import { cn } from "@/lib/utils"

/**
 * Crear una campaña con lo elegido: nombre, canal y plantilla.
 *
 * Hoy queda en borrador: los destinatarios juntos en un grupo y el mensaje
 * elegido. El envío desde la app es lo próximo; este diálogo es la puerta por
 * la que va a entrar, y lo que guarda es lo que ese envío va a usar.
 */

export type DestinoCampana = {
  /** Ids de contactos, o el filtro de Contactos para "todos los que coinciden". */
  ids?: string[]
  filtro?: string
  /** Un grupo que ya existe: la campaña va a sus miembros. */
  grupoId?: string
  cantidad: number
  conMail?: number
  conTelefono?: number
}

export function CampanaDialog({
  destino,
  origen,
  onCerrar,
  onCreada,
}: {
  /** `null` cierra el diálogo. */
  destino: DestinoCampana | null
  origen: "contactos" | "crm"
  onCerrar: () => void
  onCreada: (r: { campanaId: string; grupoId: string; destinatarios: number; nombre: string }) => void
}) {
  const { montado, saliendo } = usePresencia(destino !== null)
  const [mostrado, setMostrado] = useState(destino)
  if (destino && destino !== mostrado) setMostrado(destino)

  const [nombre, setNombre] = useState("")
  const [canal, setCanal] = useState<"email" | "whatsapp">("email")
  const [plantilla, setPlantilla] = useState<PlantillaParaEnviar | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [previo, setPrevio] = useState(destino)
  if (destino !== previo) {
    setPrevio(destino)
    if (destino) {
      setNombre("")
      setCanal("email")
      setPlantilla(null)
      setError(null)
    }
  }

  useEffect(() => {
    if (!destino) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !guardando && onCerrar()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [destino, guardando, onCerrar])

  if (!montado || !mostrado) return null
  const d = mostrado
  const alcanzables = canal === "email" ? d.conMail : d.conTelefono

  const guardar = async () => {
    if (!nombre.trim() || guardando) return
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch("/api/contactos/campanas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          ids: d.ids,
          filtro: d.filtro,
          grupoId: d.grupoId,
          canal,
          plantillaId: plantilla?.id ?? null,
          origen,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear la campaña")
      onCreada({ ...data, nombre: nombre.trim() })
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la campaña")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Crear campaña">
      <div
        className={cn(
          "absolute inset-0 bg-navy-950/50 backdrop-blur-[2px]",
          saliendo ? "animate-out fade-out-0 fill-mode-forwards duration-150" : "animate-in fade-in-0 duration-200"
        )}
        onClick={() => !guardando && onCerrar()}
      />
      <div
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-e4 sm:max-w-3xl sm:rounded-2xl",
          saliendo
            ? "pointer-events-none animate-out slide-out-to-bottom-4 fade-out-0 fill-mode-forwards duration-150"
            : "animate-in slide-in-from-bottom-4 fade-in-0 duration-200"
        )}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15.5px] font-semibold tracking-[-0.015em] text-ink">Crear campaña</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              Para {d.cantidad.toLocaleString("es-AR")} {d.cantidad === 1 ? "persona" : "personas"}
              {alcanzables !== undefined &&
                ` · ${alcanzables} con ${canal === "email" ? "mail" : "teléfono"}`}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onCerrar} disabled={guardando} aria-label="Cerrar">
            <X />
          </Button>
        </header>

        <div className="space-y-4 border-b border-line-soft px-5 py-4">
          <label className="block">
            <span className="text-[12px] font-medium text-ink-secondary">Nombre</span>
            <Input
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Firma biométrica — bancos, octubre"
              maxLength={80}
              className="mt-1.5"
            />
          </label>
          <div>
            <span className="text-[12px] font-medium text-ink-secondary">Canal</span>
            <div className="mt-1.5 grid w-full max-w-xs grid-cols-2 overflow-hidden rounded-lg border border-line">
              {(
                [
                  ["email", "Mail", Mail],
                  ["whatsapp", "WhatsApp", MessageCircle],
                ] as const
              ).map(([id, rotulo, Icono], i) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setCanal(id)
                    if (plantilla && plantilla.canal !== id) setPlantilla(null)
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-2 text-[12.5px] transition-colors",
                    i > 0 && "border-l border-line",
                    canal === id ? "bg-surface-muted font-medium text-ink" : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
                  )}
                >
                  <Icono className="h-3.5 w-3.5" />
                  {rotulo}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 sm:grid-cols-[260px_1fr]">
          <ListaPlantillas key={canal} canalInicial={canal} soloCanales={[canal]} elegida={plantilla} onElegir={setPlantilla} />
          <section className="min-h-[180px] overflow-y-auto px-5 py-4 sm:max-h-[40vh]">
            {plantilla ? (
              <>
                <p className="text-[13.5px] font-medium text-ink">{plantilla.titulo}</p>
                {plantilla.asunto && (
                  <p className="mt-2 text-[12px] text-ink-secondary">
                    <span className="text-ink-muted">Asunto:</span> {plantilla.asunto}
                  </p>
                )}
                <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-ink-secondary">{plantilla.cuerpo}</p>
              </>
            ) : (
              <p className="flex h-full items-center justify-center text-center text-[13px] text-ink-muted">
                Elegí el mensaje. Se puede dejar para después.
              </p>
            )}
          </section>
        </div>

        {error && <p className="border-t border-danger-line bg-danger-soft px-5 py-2.5 text-[12.5px] text-danger-text">{error}</p>}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-subtle px-5 py-3">
          <p className="text-[12px] text-ink-muted">
            Queda en <span className="font-medium text-ink-secondary">borrador</span>: el envío desde la app llega pronto.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={!nombre.trim() || guardando}>
              {guardando && <Loader2 className="animate-spin" />}
              Guardar campaña
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
