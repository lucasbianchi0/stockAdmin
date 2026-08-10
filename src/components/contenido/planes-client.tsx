"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  Copy,
  LayoutGrid,
  Sparkles,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState, LoadingState } from "@/components/ui/states"
import { PlanearDialog, type ConfigPlan } from "@/components/contenido/planear-dialog"
import { MarcaCanal } from "@/components/admin/platform-icons"
import { cn } from "@/lib/utils"
import {
  CANAL_CORTO,
  DIAS_PLAN,
  ESTADO_LABEL,
  etiquetaDia,
  fechaFinDe,
  nombreDePlan,
  type Canal,
  type EstadoPlan,
  type PlanResumen,
} from "@/lib/calendario-context"

/**
 * El home del calendario: todos los planes.
 *
 * Antes esta ruta saltaba directo al único plan que podía existir, porque crear
 * uno nuevo archivaba el anterior. Tener el de agosto y el de septiembre a la
 * vez no es un caso raro: es cómo se trabaja.
 *
 * Lo que se ve de cada plan es el avance en tres tramos —elegidas, con
 * contenido, con imagen—, que es la única pregunta que uno se hace mirando una
 * lista de planes: cuál está a medias y dónde quedó.
 */
export function PlanesClient() {
  const router = useRouter()
  const [planes, setPlanes] = useState<PlanResumen[] | null>(null)
  const [verArchivados, setVerArchivados] = useState(false)
  const [dialogo, setDialogo] = useState(false)
  const [generando, setGenerando] = useState(false)

  const cargar = useCallback(async (archivados: boolean) => {
    try {
      const res = await fetch(`/api/contenido/calendario${archivados ? "?archivados=1" : ""}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPlanes(data.planes ?? [])
    } catch {
      toast.error("No se pudieron cargar los planes")
      setPlanes([])
    }
  }, [])

  useEffect(() => {
    cargar(verArchivados)
  }, [cargar, verArchivados])

  const generarPlan = useCallback(
    async (cfg: ConfigPlan) => {
      setGenerando(true)
      try {
        const res = await fetch("/api/contenido/calendario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cfg),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error ?? "No se pudo generar el plan")
          return
        }
        toast.success("Calendario listo")
        // Directo al detalle: el plan recién generado es lo que se quiere ver,
        // y volver a la lista para tener que buscarlo sería un paso de más.
        router.push(`/contenido/calendario/${data.planId}`)
      } catch {
        toast.error("No se pudo conectar con el servidor")
      } finally {
        setGenerando(false)
      }
    },
    [router]
  )

  /** Cambia el estado o borra sin volver a pedir toda la lista. */
  const actualizar = useCallback(
    async (id: string, accion: "archivar" | "desarchivar" | "borrar" | "duplicar") => {
      const anterior = planes
      try {
        if (accion === "borrar") {
          setPlanes((p) => p?.filter((x) => x.id !== id) ?? null)
          const res = await fetch(`/api/contenido/calendario/${id}`, { method: "DELETE" })
          if (!res.ok) throw new Error()
          toast.success("Plan borrado")
          return
        }

        if (accion === "duplicar") {
          const res = await fetch(`/api/contenido/calendario/${id}/duplicar`, { method: "POST" })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error)
          toast.success("Plan duplicado")
          router.push(`/contenido/calendario/${data.planId}`)
          return
        }

        const estado: EstadoPlan = accion === "archivar" ? "archivado" : "activo"
        setPlanes((p) => p?.map((x) => (x.id === id ? { ...x, estado } : x)) ?? null)

        const res = await fetch(`/api/contenido/calendario/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado }),
        })
        if (!res.ok) throw new Error()

        // Archivar con el filtro apagado saca la card de la lista; recargar es
        // más simple que decidir a mano si todavía corresponde mostrarla.
        if (!verArchivados) cargar(false)
      } catch {
        setPlanes(anterior ?? null)
        toast.error("No se pudo completar la acción")
      }
    },
    [planes, verArchivados, cargar, router]
  )

  const hayArchivados = useMemo(
    () => (planes ?? []).some((p) => p.estado === "archivado"),
    [planes]
  )

  if (planes === null) return <LoadingState label="Cargando los planes…" />

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/contenido/plantillas">
              <LayoutGrid />
              Plantillas visuales
            </Link>
          </Button>

          {(verArchivados || hayArchivados || planes.length > 0) && (
            <button
              type="button"
              onClick={() => setVerArchivados((v) => !v)}
              className="text-[11.5px] font-medium text-ink-muted transition-colors hover:text-ink"
            >
              {verArchivados ? "Ocultar archivados" : "Ver archivados"}
            </button>
          )}

          <Button size="sm" className="ml-auto" onClick={() => setDialogo(true)}>
            <Sparkles />
            Planear {DIAS_PLAN} días
          </Button>
        </div>

        {planes.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={CalendarDays}
              title={verArchivados ? "No hay planes archivados" : "Todavía no hay ningún plan"}
              description={
                <>
                  Un plan son {DIAS_PLAN} días de publicaciones para LinkedIn, Instagram y Facebook
                  pensadas como un conjunto. Podés tener varios a la vez.
                </>
              }
              action={
                <Button size="lg" onClick={() => setDialogo(true)}>
                  <Sparkles />
                  Planear {DIAS_PLAN} días
                </Button>
              }
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {planes.map((plan) => (
              <CardPlan key={plan.id} plan={plan} onAccion={actualizar} />
            ))}
          </div>
        )}
      </div>

      <PlanearDialog
        abierto={dialogo}
        generando={generando}
        onCerrar={() => !generando && setDialogo(false)}
        onGenerar={generarPlan}
      />
    </>
  )
}

/* ── La card de un plan ───────────────────────────────────────────────────── */

const TONO_ESTADO: Record<EstadoPlan, "brand" | "success" | "neutral" | "warning"> = {
  borrador: "warning",
  activo: "brand",
  terminado: "success",
  archivado: "neutral",
}

function CardPlan({
  plan,
  onAccion,
}: {
  plan: PlanResumen
  onAccion: (id: string, accion: "archivar" | "desarchivar" | "borrar" | "duplicar") => void
}) {
  const [confirmando, setConfirmando] = useState(false)
  const archivado = plan.estado === "archivado"

  return (
    <div className="panel flex flex-col overflow-hidden">
      <Link
        href={`/contenido/calendario/${plan.id}`}
        className="flex-1 p-4 transition-colors hover:bg-surface-subtle"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug tracking-[-0.01em] text-ink">
            {nombreDePlan(plan)}
          </h3>
          <Badge tone={TONO_ESTADO[plan.estado]} size="sm" className="shrink-0">
            {ESTADO_LABEL[plan.estado]}
          </Badge>
        </div>

        <p className="mt-1 text-[11.5px] text-ink-muted">{rango(plan)}</p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {plan.canales.map((c: Canal) => (
            <Badge key={c} tone={c === "linkedin" ? "brand" : "neutral"} size="sm">
              <MarcaCanal canal={c} className="h-3.5 w-3.5" />
              {CANAL_CORTO[c]}
            </Badge>
          ))}
        </div>

        <BarraAvance avance={plan.avance} />
      </Link>

      <div className="flex items-center gap-1 border-t border-line px-2 py-1.5">
        {confirmando ? (
          <>
            <span className="px-1.5 text-[11px] text-ink-muted">¿Borrar del todo?</span>
            <Button
              variant="destructive"
              size="xs"
              className="ml-auto"
              onClick={() => onAccion(plan.id, "borrar")}
            >
              Borrar
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setConfirmando(false)}>
              No
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onAccion(plan.id, "duplicar")}
              title="Duplicar las ideas del plan en fechas nuevas"
            >
              <Copy />
              Duplicar
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onAccion(plan.id, archivado ? "desarchivar" : "archivar")}
            >
              {archivado ? <ArchiveRestore /> : <Archive />}
              {archivado ? "Recuperar" : "Archivar"}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              onClick={() => setConfirmando(true)}
            >
              <Trash2 />
              <span className="sr-only">Borrar el plan</span>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

/** "3 – 17 de ago", o con los dos meses si el plan cruza de mes. */
function rango(plan: PlanResumen): string {
  const desde = etiquetaDia(plan.fechaInicio)
  const hasta = etiquetaDia(fechaFinDe(plan))

  return desde.mes === hasta.mes
    ? `${desde.numero} – ${hasta.numero} de ${desde.mes}`
    : `${desde.numero} de ${desde.mes} – ${hasta.numero} de ${hasta.mes}`
}

/**
 * El avance en tres tramos, uno adentro del otro.
 *
 * No son tres barras apiladas sino tres capas sobre la misma pista, porque los
 * conjuntos están anidados: todo lo que tiene imagen tiene contenido, y todo lo
 * que tiene contenido está elegido. Dibujarlas apiladas sugeriría que suman, y
 * daría más del 100%.
 */
function BarraAvance({ avance }: { avance: PlanResumen["avance"] }) {
  const { total, elegidas, conContenido, conImagen } = avance
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)

  return (
    <div className="mt-3">
      <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-brand-200 transition-[width] duration-500"
          style={{ width: `${pct(elegidas)}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-brand-500 transition-[width] duration-500"
          style={{ width: `${pct(conContenido)}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-success transition-[width] duration-500"
          style={{ width: `${pct(conImagen)}%` }}
        />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-ink-muted">
        <Tramo color="bg-brand-200" n={elegidas} total={total} label="elegidas" />
        <Tramo color="bg-brand-500" n={conContenido} total={total} label="con texto" />
        <Tramo color="bg-success" n={conImagen} total={total} label="con imagen" />
      </div>
    </div>
  )
}

function Tramo({
  color,
  n,
  total,
  label,
}: {
  color: string
  n: number
  total: number
  label: string
}) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("h-1.5 w-1.5 rounded-full", color)} />
      <span className="num font-semibold text-ink-secondary">
        {n}/{total}
      </span>
      {label}
    </span>
  )
}
