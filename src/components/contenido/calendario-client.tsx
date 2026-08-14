"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Archive,
  CalendarDays,
  Check,
  Eye,
  Loader2,
  PenLine,
  Sparkles,
  Target,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState, LoadingState } from "@/components/ui/states"
import { PiezaPanel, type CamposRegenerar } from "@/components/contenido/pieza-panel"
import { cn } from "@/lib/utils"
import {
  AUDIENCIA_CORTO,
  CANAL_CORTO,
  CANAL_LABEL,
  ESTADOS,
  ESTADO_LABEL,
  OBJETIVO_LABEL,
  etiquetaDia,
  fechaFinDe,
  nombreDePlan,
  type Canal,
  type EstadoPlan,
  type Objetivo,
  type Opcion,
  type Plan,
  type Slot,
} from "@/lib/calendario-context"
import { FeedPrevia } from "@/components/contenido/feed-previa"
import { MarcaCanal } from "@/components/admin/platform-icons"
import { templateFeedPorId } from "@/lib/templates-feed"
import { pedirPromptFeed, proporcionDe, secuenciaFeed } from "@/lib/sistema-visual"

/** El color del chip de objetivo, reusando los tonos del sistema. */
function tonoObjetivo(o: Objetivo): "brand" | "warning" | "success" {
  return o === "conversion" ? "success" : o === "educacion" ? "warning" : "brand"
}

/**
 * Un plan del calendario.
 *
 * Cada día trae UNA idea —la que recomendó el estratega— con su objetivo y a
 * quién le habla a la vista. Si no convence, se regenera con campos editables
 * desde el detalle. Las imágenes salen todas por el camino 2 (Feed 1080).
 */
export function PlanClient({ planId }: { planId: string }) {
  const router = useRouter()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slotAbierto, setSlotAbierto] = useState<string | null>(null)
  const [generandoSlot, setGenerandoSlot] = useState(false)
  const [regenerandoSlot, setRegenerandoSlot] = useState(false)
  const [tab, setTab] = useState<Canal>("linkedin")
  const [lote, setLote] = useState<{
    hechos: number
    total: number
    paso: "texto" | "imagen"
    slotId: string | null
  } | null>(null)
  const [previaFeed, setPreviaFeed] = useState(false)
  /** Imágenes recién generadas, antes de que vuelva la versión persistida. */
  const [recienGeneradas, setRecienGeneradas] = useState<Record<string, string>>({})

  useEffect(() => {
    let vigente = true

    fetch(`/api/contenido/calendario/${planId}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? "No se pudo cargar el plan")
        return d
      })
      .then((d) => {
        if (!vigente) return
        setPlan(d.plan)
        const canales: Canal[] = d.plan?.canales ?? []
        if (canales.length > 0 && !canales.includes("linkedin")) setTab(canales[0])
      })
      .catch((e: Error) => vigente && setError(e.message))
      .finally(() => vigente && setCargando(false))

    return () => {
      vigente = false
    }
  }, [planId])

  /** Reemplaza un slot en el plan sin volver a pedir todo al servidor. */
  const aplicarSlot = useCallback((actualizado: Slot) => {
    setPlan((prev) =>
      prev
        ? { ...prev, slots: prev.slots.map((s) => (s.id === actualizado.id ? actualizado : s)) }
        : prev
    )
  }, [])

  const generarContenido = useCallback(
    async (slotId: string, ajuste: string) => {
      setGenerandoSlot(true)
      try {
        const res = await fetch("/api/contenido/calendario/slot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slotId, ajuste }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error ?? "No se pudo generar el contenido")
          return
        }
        aplicarSlot(data.slot)
      } catch {
        toast.error("No se pudo conectar con el servidor")
      } finally {
        setGenerandoSlot(false)
      }
    },
    [aplicarSlot]
  )

  const regenerarIdea = useCallback(
    async (slotId: string, campos: CamposRegenerar) => {
      setRegenerandoSlot(true)
      try {
        const res = await fetch("/api/contenido/calendario/slot/regenerar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slotId, ...campos }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error ?? "No se pudo regenerar la idea")
          return
        }
        // Regenerar la idea limpia contenido e imagen: soltamos la recién hecha.
        setRecienGeneradas((prev) => {
          if (!(slotId in prev)) return prev
          const resto = { ...prev }
          delete resto[slotId]
          return resto
        })
        aplicarSlot(data.slot)
        toast.success("Idea regenerada")
      } catch {
        toast.error("No se pudo conectar con el servidor")
      } finally {
        setRegenerandoSlot(false)
      }
    },
    [aplicarSlot]
  )

  /** Guarda la imagen recién generada en el bucket. */
  const guardarImagen = useCallback(
    async (slotId: string, dataUrl: string) => {
      setRecienGeneradas((prev) => ({ ...prev, [slotId]: dataUrl }))
      try {
        const res = await fetch("/api/contenido/calendario/slot/imagen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slotId, imagen: dataUrl }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        aplicarSlot(data.slot)
      } catch {
        toast.warning("La imagen se generó pero no se pudo guardar. Descargala antes de cerrar.")
      }
    },
    [aplicarSlot]
  )

  const renombrar = useCallback(
    async (nombre: string) => {
      setPlan((prev) => (prev ? { ...prev, nombre: nombre || null } : prev))
      try {
        const res = await fetch(`/api/contenido/calendario/${planId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre }),
        })
        if (!res.ok) throw new Error()
      } catch {
        toast.error("No se pudo guardar el nombre")
      }
    },
    [planId]
  )

  const cambiarEstado = useCallback(
    async (estado: EstadoPlan) => {
      const anterior = plan?.estado
      setPlan((prev) => (prev ? { ...prev, estado } : prev))
      try {
        const res = await fetch(`/api/contenido/calendario/${planId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado }),
        })
        if (!res.ok) throw new Error()
        if (estado === "archivado") {
          toast.success("Plan archivado")
          router.push("/contenido/calendario")
        }
      } catch {
        setPlan((prev) => (prev && anterior ? { ...prev, estado: anterior } : prev))
        toast.error("No se pudo cambiar el estado")
      }
    },
    [plan?.estado, planId, router]
  )

  /** La imagen que hay que mostrar de una pieza: la recién hecha o la guardada. */
  const imagenDe = useCallback(
    (slot: Slot) => recienGeneradas[slot.id] ?? slot.imagenUrl,
    [recienGeneradas]
  )

  const slotsDelTab = useMemo(
    () =>
      (plan?.slots ?? [])
        .filter((s) => s.canal === tab)
        .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [plan, tab]
  )

  /** Lo que falta generar EN LA PESTAÑA ACTIVA (elegida y sin contenido). */
  const pendientes = useMemo(
    () => slotsDelTab.filter((s) => s.elegida && !s.contenido),
    [slotsDelTab]
  )

  const avance = useMemo(() => {
    const slots = plan?.slots ?? []
    return {
      total: slots.length,
      elegidos: slots.filter((s) => s.elegida).length,
      listos: slots.filter((s) => s.contenido).length,
      conImagen: slots.filter((s) => s.imagenPath || recienGeneradas[s.id]).length,
    }
  }, [plan, recienGeneradas])

  /** Qué template del feed le toca a cada pieza. Función pura de los slots. */
  const feedPorSlot = useMemo(
    () => (plan ? secuenciaFeed(plan.slots) : new Map<string, string>()),
    [plan]
  )

  const nombreTemplateDe = useCallback(
    (slot: Slot) => templateFeedPorId(feedPorSlot.get(slot.id) ?? null)?.nombre ?? null,
    [feedPorSlot]
  )

  /** El prompt de imagen de una pieza, por el camino 2. */
  const promptDeSlot = useCallback(
    async (slot: Slot): Promise<string> => {
      const templateFeedId = feedPorSlot.get(slot.id)
      if (!templateFeedId) return ""
      const { prompt } = await pedirPromptFeed(slot.id, templateFeedId)
      return prompt
    },
    [feedPorSlot]
  )

  /** Genera todo lo elegido, de a una: texto y después imagen. En serie. */
  const generarTodas = useCallback(async () => {
    if (pendientes.length === 0) return
    setLote({ hechos: 0, total: pendientes.length, paso: "texto", slotId: null })
    let fallaron = 0

    for (const [i, s] of pendientes.entries()) {
      try {
        setLote({ hechos: i, total: pendientes.length, paso: "texto", slotId: s.id })
        const res = await fetch("/api/contenido/calendario/slot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slotId: s.id, ajuste: "" }),
        })
        const data = await res.json()
        if (!res.ok) {
          fallaron++
        } else {
          aplicarSlot(data.slot)

          setLote({ hechos: i, total: pendientes.length, paso: "imagen", slotId: s.id })
          const prompt = await promptDeSlot(data.slot)
          if (prompt) {
            const img = await fetch("/api/contenido/image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt, size: proporcionDe(s.canal), sistema: "feed" }),
            })
            const datosImg = await img.json()
            if (img.ok && datosImg.image) await guardarImagen(s.id, datosImg.image)
          }
        }
      } catch {
        fallaron++
      }
      setLote({ hechos: i + 1, total: pendientes.length, paso: "texto", slotId: null })
    }

    setLote(null)
    if (fallaron === 0) toast.success("Todo el contenido está generado")
    else toast.warning(`Quedaron ${fallaron} sin generar. Probá de nuevo desde el detalle.`)
  }, [pendientes, aplicarSlot, guardarImagen, promptDeSlot])

  const slot = plan?.slots.find((s) => s.id === slotAbierto) ?? null

  if (cargando) return <LoadingState label="Cargando el plan…" />

  if (error || !plan) {
    return (
      <div className="panel">
        <EmptyState
          icon={CalendarDays}
          title="No se encontró el plan"
          description={error ?? "Puede que lo hayan borrado desde otra pestaña."}
          action={
            <Button asChild>
              <Link href="/contenido/calendario">Volver al calendario</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-5">
        <Resumen plan={plan} avance={avance} onRenombrar={renombrar} onEstado={cambiarEstado} />

        {plan.analisis && <Analisis texto={plan.analisis} />}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-line bg-surface p-1 shadow-e1">
            {plan.canales.map((c) => {
              const cuenta = plan.slots.filter((s) => s.canal === c).length
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTab(c)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors",
                    tab === c
                      ? "bg-brand-50 text-brand-700"
                      : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                  )}
                >
                  <MarcaCanal canal={c} className="h-4 w-4" />
                  {CANAL_LABEL[c]}
                  <span className="tabular-nums text-ink-faint">{cuenta}</span>
                </button>
              )
            })}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviaFeed(true)}
              disabled={slotsDelTab.length === 0}
            >
              <Eye />
              Ver el feed
            </Button>
            <Button size="sm" onClick={generarTodas} disabled={pendientes.length === 0 || Boolean(lote)}>
              {lote ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {lote
                ? `${lote.paso === "imagen" ? "Imagen" : "Texto"} ${lote.hechos + 1}/${lote.total}…`
                : `Generar las ${pendientes.length} elegidas`}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {slotsDelTab.map((s) => (
            <DiaPlan
              key={s.id}
              slot={s}
              imagen={imagenDe(s)}
              enCurso={lote?.slotId === s.id ? lote.paso : null}
              onAbrir={setSlotAbierto}
            />
          ))}
        </div>
      </div>

      {previaFeed && (
        <FeedPrevia
          canal={tab}
          slots={slotsDelTab}
          imagenDe={imagenDe}
          nombreTemplate={nombreTemplateDe}
          onCerrar={() => setPreviaFeed(false)}
        />
      )}

      <PiezaPanel
        slot={slot}
        feedTemplateId={slot ? (feedPorSlot.get(slot.id) ?? null) : null}
        generando={generandoSlot}
        regenerando={regenerandoSlot}
        imagen={slot ? imagenDe(slot) : null}
        onImagen={guardarImagen}
        onCerrar={() => setSlotAbierto(null)}
        onGenerar={generarContenido}
        onRegenerar={regenerarIdea}
      />
    </>
  )
}

/* ── Resumen ──────────────────────────────────────────────────────────────── */

function Resumen({
  plan,
  avance,
  onRenombrar,
  onEstado,
}: {
  plan: Plan
  avance: { total: number; elegidos: number; listos: number; conImagen: number }
  onRenombrar: (nombre: string) => void
  onEstado: (estado: EstadoPlan) => void
}) {
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState("")
  const pct = avance.total ? Math.round((avance.conImagen / avance.total) * 100) : 0

  const empezarEdicion = () => {
    setBorrador(plan.nombre ?? plan.titulo)
    setEditando(true)
  }

  const confirmar = () => {
    setEditando(false)
    const limpio = borrador.trim()
    if (limpio !== (plan.nombre ?? plan.titulo)) onRenombrar(limpio)
  }

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {editando ? (
              <Input
                autoFocus
                value={borrador}
                onChange={(e) => setBorrador(e.target.value)}
                onBlur={confirmar}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmar()
                  if (e.key === "Escape") setEditando(false)
                }}
                className="h-8 max-w-xs text-[15px] font-semibold"
              />
            ) : (
              <button
                type="button"
                onClick={empezarEdicion}
                title="Cambiarle el nombre"
                className="group flex items-center gap-1.5 text-left"
              >
                <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-ink">
                  {nombreDePlan(plan)}
                </h2>
                <PenLine className="h-3 w-3 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}

            {plan.canales.map((c: Canal) => (
              <Badge key={c} tone={c === "linkedin" ? "brand" : "neutral"} size="md">
                <MarcaCanal canal={c} className="h-4 w-4" />
                {CANAL_CORTO[c]}
              </Badge>
            ))}
          </div>

          <p className="mt-1 text-[11.5px] text-ink-muted">
            {rangoLargo(plan)} · {plan.dias} días
          </p>

          {plan.arco && (
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-ink-muted">{plan.arco}</p>
          )}
          {plan.contexto && (
            <p className="mt-2 max-w-2xl border-l-2 border-brand-200 pl-2.5 text-[11.5px] italic leading-relaxed text-ink-secondary">
              {plan.contexto}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-line bg-surface-subtle p-0.5">
            {ESTADOS.filter((e) => e !== "archivado").map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onEstado(e)}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  plan.estado === e
                    ? "bg-brand-600 text-white shadow-e1"
                    : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                )}
              >
                {ESTADO_LABEL[e]}
              </button>
            ))}
          </div>

          <Button variant="ghost" size="icon-sm" onClick={() => onEstado("archivado")}>
            <Archive />
            <span className="sr-only">Archivar el plan</span>
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3.5">
        <Metrica valor={avance.total} label="publicaciones" />
        <Metrica valor={avance.listos} label="con texto" tono="brand" />
        <Metrica valor={avance.conImagen} label="con imagen" tono="ok" />

        <div className="ml-auto flex min-w-[140px] flex-1 items-center gap-2.5 sm:flex-none sm:basis-52">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-success transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="num shrink-0 font-mono text-[11px] font-semibold text-ink-muted">{pct}%</span>
        </div>
      </div>
    </div>
  )
}

function rangoLargo(plan: Plan): string {
  const desde = etiquetaDia(plan.fechaInicio)
  const hasta = etiquetaDia(fechaFinDe(plan))
  return desde.mes === hasta.mes
    ? `${desde.numero} – ${hasta.numero} de ${desde.mes}`
    : `${desde.numero} de ${desde.mes} – ${hasta.numero} de ${hasta.mes}`
}

function Metrica({
  valor,
  label,
  tono,
}: {
  valor: number
  label: string
  tono?: "brand" | "ok"
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className={cn(
          "num text-[17px] font-bold leading-none",
          tono === "ok" ? "text-success-text" : tono === "brand" ? "text-brand-600" : "text-ink"
        )}
      >
        {valor}
      </span>
      <span className="text-[11.5px] text-ink-muted">{label}</span>
    </span>
  )
}

/* ── Chips de estrategia ──────────────────────────────────────────────────── */

/** Objetivo + audiencia de una pieza, la lectura rápida de a quién y para qué. */
function ChipsEstrategia({ idea }: { idea: Opcion }) {
  const objetivo: Objetivo | null =
    idea.objetivo === "awareness" || idea.objetivo === "educacion" || idea.objetivo === "conversion"
      ? idea.objetivo
      : null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {objetivo && (
        <Badge tone={tonoObjetivo(objetivo)} size="sm">
          <Target className="h-3 w-3" strokeWidth={2.5} />
          {OBJETIVO_LABEL[objetivo]}
        </Badge>
      )}
      {idea.audiencia && AUDIENCIA_CORTO[idea.audiencia] && (
        <Badge tone="neutral" size="sm">
          <Users className="h-3 w-3" strokeWidth={2.5} />
          {AUDIENCIA_CORTO[idea.audiencia]}
        </Badge>
      )}
    </div>
  )
}

/* ── Día ──────────────────────────────────────────────────────────────────── */

/**
 * Un día del plan con su única idea a la vista, ya con objetivo y audiencia.
 * Todo el trabajo fino —regenerar, generar texto e imagen— pasa en el detalle.
 */
function DiaPlan({
  slot,
  imagen,
  enCurso,
  onAbrir,
}: {
  slot: Slot
  imagen: string | null
  enCurso: "texto" | "imagen" | null
  onAbrir: (id: string) => void
}) {
  const { diaSemana, numero, mes, finDeSemana } = etiquetaDia(slot.fecha)
  const listo = Boolean(slot.contenido)
  const idea = slot.opciones.find((o) => o.id === slot.elegida) ?? slot.opciones[0] ?? null

  return (
    <div
      className={cn(
        "panel overflow-hidden transition-shadow",
        enCurso && "ring-2 ring-brand-300 ring-offset-2 ring-offset-background"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-surface-subtle px-4 py-2.5">
        <span className="flex items-baseline gap-1.5">
          <span className="text-[17px] font-bold tabular-nums tracking-tight text-ink">{numero}</span>
          <span className="text-[11.5px] text-ink-muted">
            {mes} · {diaSemana}
          </span>
        </span>
        {finDeSemana && (
          <Badge tone="warning" size="sm">
            Fin de semana
          </Badge>
        )}
        {slot.beat && (
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-muted">{slot.beat}</span>
        )}
        {enCurso ? (
          <Badge tone="brand" size="sm">
            <Loader2 className="h-3 w-3 animate-spin" />
            Generando {enCurso === "imagen" ? "la imagen" : "el texto"}
          </Badge>
        ) : listo ? (
          <Badge tone="success" size="sm">
            <Check className="h-3 w-3" strokeWidth={3} />
            Contenido listo
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm">
            Lista para generar
          </Badge>
        )}
        <Button size="xs" variant="ghost" onClick={() => onAbrir(slot.id)}>
          <PenLine />
          Detalle
        </Button>
      </div>

      {listo ? (
        <PiezaLista slot={slot} idea={idea} imagen={imagen} enCurso={enCurso} onAbrir={() => onAbrir(slot.id)} />
      ) : (
        <button
          type="button"
          onClick={() => onAbrir(slot.id)}
          className="block w-full p-3.5 text-left transition-colors hover:bg-surface-subtle"
        >
          {idea && <ChipsEstrategia idea={idea} />}
          {idea && (
            <p className="mt-2 text-[13px] font-semibold leading-snug text-ink">{idea.titulo}</p>
          )}
          {idea?.hook && (
            <p className="mt-1 text-[11.5px] italic leading-relaxed text-ink-secondary">“{idea.hook}”</p>
          )}
          {idea?.angulo && (
            <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-ink-muted">{idea.angulo}</p>
          )}
        </button>
      )}
    </div>
  )
}

/* ── Análisis del plan ────────────────────────────────────────────────────── */

/**
 * La lectura de marketer, arriba de todo: cuánto da a conocer, cuánto educa,
 * cuánto convierte y a quién. Con el reparto explicado se puede discutir, que es
 * lo que hace que alguien lo revise en serio.
 */
function Analisis({ texto }: { texto: string }) {
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50 p-5">
      <p className="eyebrow mb-2 text-brand-700">La estrategia de este plan</p>
      <p className="max-w-3xl whitespace-pre-line text-[13px] leading-relaxed text-brand-700/90">{texto}</p>
    </div>
  )
}

/* ── Enlace al Studio ─────────────────────────────────────────────────────── */

export function EnlaceStudio() {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href="/contenido">
        <PenLine />
        Ir al Studio
      </Link>
    </Button>
  )
}

/* ── Pieza resuelta ───────────────────────────────────────────────────────── */

/** El día ya resuelto: la pieza como quedó, con su imagen y el arranque del texto. */
function PiezaLista({
  slot,
  idea,
  imagen,
  enCurso,
  onAbrir,
}: {
  slot: Slot
  idea: Opcion | null
  imagen: string | null
  enCurso: "texto" | "imagen" | null
  onAbrir: () => void
}) {
  return (
    <div className="flex gap-3 p-3">
      <button
        type="button"
        onClick={onAbrir}
        className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-muted transition-opacity hover:opacity-85"
      >
        {imagen ? (
          // eslint-disable-next-line @next/next/no-img-element -- data: URL de runtime o firma temporal
          <img src={imagen} alt="" className="h-full w-full object-cover" />
        ) : enCurso === "imagen" ? (
          <span className="flex h-full items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
          </span>
        ) : (
          <span className="flex h-full items-center justify-center px-2 text-center text-[10px] leading-tight text-ink-faint">
            Falta la imagen
          </span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        {idea && <ChipsEstrategia idea={idea} />}
        {idea && (
          <p className="mt-1.5 text-[12.5px] font-semibold leading-snug text-ink">{idea.titulo}</p>
        )}
        <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-ink-muted">
          {slot.contenido?.caption}
        </p>
        <Button size="xs" variant="outline" className="mt-2" onClick={onAbrir}>
          <PenLine />
          {imagen ? "Ver y editar" : "Generar la imagen"}
        </Button>
      </div>
    </div>
  )
}
