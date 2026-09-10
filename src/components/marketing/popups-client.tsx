"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { MessageSquareDashed, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { PopupEditor } from "@/components/marketing/popup-editor"
import { Badge, Dot } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import {
  ACCION_LABEL,
  ALCANCE_LABEL,
  ESTADO_LABEL,
  FORMATO_LABEL,
  FRECUENCIA_LABEL,
  estadoDe,
  fechaCorta,
  vigenteDe,
  type Estado,
  type Popup,
} from "@/lib/marketing/popups"
import { cn } from "@/lib/utils"

/**
 * La pantalla de popups: la lista, y el editor cuando se está cargando uno.
 *
 * POR QUE NO HAY BOTON DE DUPLICAR
 *
 * Parece la función obvia —el popup del evento de este año es el del año que
 * viene— y no está a propósito: duplicar tendría que copiar también la imagen,
 * y dos filas apuntando al mismo objeto del bucket convierten "borrar un popup"
 * en "romperle la imagen al otro". El camino real es el mismo y no cuesta nada:
 * se abre el del año pasado, se le cambian la fecha y el título, y se prende.
 *
 * POR QUE EL EDITOR REEMPLAZA A LA LISTA Y NO ES UN DIALOGO
 *
 * Porque al lado del formulario va la vista previa, y una vista previa dentro de
 * un diálogo entra a 400 px: justo el tamaño con el que no se puede juzgar nada.
 */
export function PopupsClient() {
  const [popups, setPopups] = useState<Popup[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  /** `null` = lista. `"nuevo"` = alta. Un popup = edición. */
  const [editando, setEditando] = useState<Popup | "nuevo" | null>(null)

  const cargar = useCallback(async () => {
    setErrorCarga(null)
    try {
      const r = await fetch("/api/marketing/popups")
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudieron cargar los popups")
      setPopups(d.popups ?? [])
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : "No se pudieron cargar los popups")
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  /** El que está al aire ahora mismo, con la misma regla que usa el sitio. */
  const vigente = useMemo(() => vigenteDe(popups), [popups])

  /* ── Acciones ───────────────────────────────────────────────────────────── */

  async function cambiarActivo(p: Popup, activo: boolean) {
    // Optimista: prender y apagar tiene que sentirse instantáneo, y si falla se
    // vuelve atrás. Es la única acción de esta pantalla que se hace apurado.
    setPopups((prev) => prev.map((x) => (x.id === p.id ? { ...x, activo } : x)))
    try {
      const r = await fetch(`/api/marketing/popups/${p.id}/activo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudo cambiar el estado")

      setPopups((prev) => prev.map((x) => (x.id === p.id ? (d.popup as Popup) : x)))
      toast.success(
        activo ? "Publicado. Tarda hasta un minuto en verse." : "Apagado. Sale del sitio en un minuto."
      )
    } catch (e) {
      setPopups((prev) => prev.map((x) => (x.id === p.id ? { ...x, activo: !activo } : x)))
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar el estado")
    }
  }

  async function borrar(p: Popup) {
    if (
      !confirm(
        `¿Borrar “${p.nombre}”? Se borra también su imagen y no se puede deshacer.\n\nSi es sólo para sacarlo del sitio, alcanza con apagarlo.`
      )
    ) {
      return
    }

    try {
      const r = await fetch(`/api/marketing/popups/${p.id}`, { method: "DELETE" })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error ?? "No se pudo borrar")
      }
      setPopups((prev) => prev.filter((x) => x.id !== p.id))
      toast.success("Popup borrado")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo borrar")
    }
  }

  function alGuardar(p: Popup, esNuevo: boolean) {
    setPopups((prev) => (esNuevo ? [p, ...prev] : prev.map((x) => (x.id === p.id ? p : x))))
    setEditando(null)
    toast.success(esNuevo ? "Popup creado" : "Cambios guardados")
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  if (editando !== null) {
    return (
      <PopupEditor
        popup={editando === "nuevo" ? null : editando}
        onCancelar={() => setEditando(null)}
        onGuardado={alGuardar}
      />
    )
  }

  if (cargando) return <LoadingState label="Cargando popups…" />
  if (errorCarga) return <ErrorState message={errorCarga} onRetry={cargar} />

  if (popups.length === 0) {
    return (
      <EmptyState
        icon={MessageSquareDashed}
        title="Todavía no hay ningún popup"
        description="Acá se carga lo que interrumpe al visitante del sitio: un evento, una capacitación, un aviso. Se prende y se apaga desde esta pantalla, sin tocar el sitio."
        action={
          <Button onClick={() => setEditando("nuevo")}>
            <Plus />
            Crear el primero
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Vigente popup={vigente} />
        <Button onClick={() => setEditando("nuevo")}>
          <Plus />
          Nuevo popup
        </Button>
      </div>

      <div className="space-y-2">
        {popups.map((p) => (
          <Fila
            key={p.id}
            popup={p}
            esVigente={vigente?.id === p.id}
            onEditar={() => setEditando(p)}
            onActivo={(v) => cambiarActivo(p, v)}
            onBorrar={() => borrar(p)}
          />
        ))}
      </div>
    </div>
  )
}

/* ── Qué está al aire ─────────────────────────────────────────────────────── */

/**
 * La línea que contesta la única pregunta con la que alguien entra a esta
 * pantalla: qué está viendo ahora mismo la gente que entra al sitio.
 *
 * Hace falta porque "activo" no alcanza: puede haber tres prendidos y estar
 * saliendo uno solo —el resto con fecha futura, vencida, o perdiendo contra el
 * que se tocó más tarde—. Sin esto, esa diferencia se descubre mirando el sitio.
 */
function Vigente({ popup }: { popup: Popup | null }) {
  if (!popup) {
    return (
      <p className="flex items-center gap-2 text-[12.5px] text-ink-muted">
        <Dot tone="neutral" />
        No hay ningún popup en el sitio en este momento.
      </p>
    )
  }

  return (
    <p className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-secondary">
      <Dot tone="success" />
      <span className="truncate">
        En el sitio ahora: <span className="font-medium text-ink">{popup.nombre}</span>
      </span>
    </p>
  )
}

/* ── Una fila ─────────────────────────────────────────────────────────────── */

const TONO: Record<Estado, "success" | "brand" | "neutral"> = {
  publicado: "success",
  programado: "brand",
  vencido: "neutral",
  apagado: "neutral",
}

function Fila({
  popup,
  esVigente,
  onEditar,
  onActivo,
  onBorrar,
}: {
  popup: Popup
  esVigente: boolean
  onEditar: () => void
  onActivo: (v: boolean) => void
  onBorrar: () => void
}) {
  const estado = estadoDe(popup)

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border bg-surface p-3 shadow-e1 transition-colors",
        esVigente ? "border-success-line" : "border-line"
      )}
    >
      {popup.imagenUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={popup.imagenUrl}
          alt=""
          className="h-12 w-16 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="grid h-12 w-16 shrink-0 place-items-center rounded-lg bg-surface-muted text-[10px] font-medium uppercase tracking-wide text-ink-faint">
          Sin foto
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[13px] font-semibold text-ink">{popup.nombre}</p>
          <Badge tone={TONO[estado]} size="sm">
            {ESTADO_LABEL[estado]}
          </Badge>
        </div>

        <p className="mt-0.5 truncate text-[12px] text-ink-muted">{popup.titulo}</p>

        <p className="mt-1 truncate font-mono text-[10.5px] uppercase tracking-[0.04em] text-ink-faint">
          {[
            FORMATO_LABEL[popup.formato],
            ACCION_LABEL[popup.accion],
            ALCANCE_LABEL[popup.alcance],
            FRECUENCIA_LABEL[popup.frecuencia],
            ventana(popup),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Switch
          checked={popup.activo}
          onCheckedChange={onActivo}
          aria-label={popup.activo ? "Apagar" : "Publicar"}
        />
        <Button variant="ghost" size="icon-sm" onClick={onEditar} title="Editar">
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onBorrar} title="Borrar">
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

/** "22 oct, 19:00 → 24 oct, 23:59", o lo que haya. Vacío si no tiene ventana:
 *  una fila que dice "sin fechas" ocupa lugar para no informar nada. */
function ventana(p: Popup): string {
  const desde = fechaCorta(p.desde)
  const hasta = fechaCorta(p.hasta)
  if (!desde && !hasta) return ""
  if (desde && hasta) return `${desde} → ${hasta}`
  return desde ? `Desde ${desde}` : `Hasta ${hasta}`
}
