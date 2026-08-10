"use client"

import { useCallback, useEffect, useState } from "react"
import { ImagePlus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { EmptyState, LoadingState } from "@/components/ui/states"
import { cn } from "@/lib/utils"
import type { Plantilla } from "@/lib/plantillas"
import { CrearTemplate } from "@/components/contenido/crear-template"

/**
 * Los templates de la marca.
 *
 * Cada uno nace de una pieza que alguien subió y de la estructura que se leyó de
 * ella. Lo que se guarda no es la imagen sino la receta: proporciones,
 * distribución y tipo de fondo, sin nada del color ni del contenido original.
 *
 * La imagen queda igual, pero como referencia de lo que se quiso copiar — sirve
 * para entender de dónde salió la receta cuando haya que corregirla.
 */
export function PlantillasClient() {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/contenido/plantillas")
      const d = await r.json()
      setPlantillas(d.plantillas ?? [])
    } catch {
      toast.error("No se pudieron cargar las plantillas")
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function cambiar(id: string, cambios: Partial<Plantilla>) {
    setPlantillas((prev) => prev.map((p) => (p.id === id ? { ...p, ...cambios } : p)))
    const r = await fetch(`/api/contenido/plantillas/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cambios),
    })
    if (!r.ok) {
      toast.error("No se pudo guardar")
      cargar()
    }
  }

  async function borrar(id: string) {
    const r = await fetch(`/api/contenido/plantillas/${id}`, { method: "DELETE" })
    if (!r.ok) return toast.error("No se pudo borrar")
    setPlantillas((prev) => prev.filter((p) => p.id !== id))
    toast.success("Plantilla eliminada")
  }

  if (cargando) return <LoadingState label="Cargando plantillas…" />

  return (
    <div className="space-y-5">
      <CrearTemplate onGuardada={(p) => setPlantillas((prev) => [...prev, p])} />

      {plantillas.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={ImagePlus}
            title="Todavía no hay plantillas"
            description="Subí una pieza cuya estructura te guste. Se lee cómo está armada y queda como template reutilizable, con los colores y la información de Accedra."
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plantillas.map((p) => (
            <Ficha key={p.id} plantilla={p} onCambiar={cambiar} onBorrar={borrar} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Ficha ────────────────────────────────────────────────────────────────── */

function Ficha({
  plantilla,
  onCambiar,
  onBorrar,
}: {
  plantilla: Plantilla
  onCambiar: (id: string, cambios: Partial<Plantilla>) => void
  onBorrar: (id: string) => void
}) {
  const [confirmando, setConfirmando] = useState(false)

  return (
    <figure
      className={cn(
        "overflow-hidden rounded-xl border border-line bg-surface shadow-e1 transition-opacity",
        !plantilla.activa && "opacity-55"
      )}
    >
      <div className="aspect-square bg-surface-muted">
        {plantilla.url && (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Storage
          <img src={plantilla.url} alt={plantilla.nombre} className="h-full w-full object-cover" />
        )}
      </div>

      <figcaption className="p-3.5">
        <p className="text-[13px] font-semibold text-ink">{plantilla.nombre}</p>
        {plantilla.composicion && (
          <p className="mt-1 line-clamp-3 font-mono text-[10.5px] leading-relaxed text-ink-faint">
            {plantilla.composicion}
          </p>
        )}
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-muted">
          {plantilla.cuandoUsar || (
            <span className="italic text-warning-text">
              Sin criterio de uso: no se va a recomendar sola.
            </span>
          )}
        </p>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
          <label className="flex items-center gap-2 text-[11.5px] text-ink-muted">
            <Switch
              checked={plantilla.activa}
              onCheckedChange={(v) => onCambiar(plantilla.id, { activa: v })}
            />
            {plantilla.activa ? "Activa" : "Desactivada"}
          </label>

          {confirmando ? (
            <span className="flex items-center gap-1">
              <Button variant="destructive" size="xs" onClick={() => onBorrar(plantilla.id)}>
                Borrar
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setConfirmando(false)}>
                No
              </Button>
            </span>
          ) : (
            <Button variant="ghost" size="icon-sm" onClick={() => setConfirmando(true)}>
              <Trash2 />
              <span className="sr-only">Borrar plantilla</span>
            </Button>
          )}
        </div>
      </figcaption>
    </figure>
  )
}
