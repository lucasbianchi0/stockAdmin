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
  Shuffle,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState, LoadingState } from "@/components/ui/states"
import { PiezaPanel } from "@/components/contenido/pieza-panel"
import { SelectorTemplate } from "@/components/contenido/selector-template"
import { cn } from "@/lib/utils"
import {
  CANAL_CORTO,
  CANAL_LABEL,
  ESTADOS,
  ESTADO_LABEL,
  etiquetaDia,
  fechaFinDe,
  nombreDePlan,
  type Canal,
  type EstadoPlan,
  type Opcion,
  type Plan,
  type Slot,
} from "@/lib/calendario-context"
import { FeedPrevia } from "@/components/contenido/feed-previa"
import { MarcaCanal } from "@/components/admin/platform-icons"
import { promptDeImagen } from "@/lib/prompt-pieza"
import {
  claveSistema,
  esSistema,
  pedirPromptFeed,
  proporcionDe,
  secuenciaFeed,
  SISTEMAS,
  SISTEMA_LABEL,
  SISTEMA_NOTA,
  type SistemaVisual,
} from "@/lib/sistema-visual"

/**
 * Un plan del calendario.
 *
 * Es la pantalla que antes era todo el calendario, con dos cosas nuevas encima:
 * cada pieza muestra y deja cambiar su TEMPLATE, y el feed se puede previsualizar
 * con las miniaturas de esos templates antes de generar una sola imagen. Poder
 * juzgar si el conjunto respira sin gastar veinte generaciones de doce segundos
 * es la razón entera de que el template se decida al planificar.
 */
export function PlanClient({ planId }: { planId: string }) {
  const router = useRouter()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slotAbierto, setSlotAbierto] = useState<string | null>(null)
  const [eligiendo, setEligiendo] = useState(false)
  const [generandoSlot, setGenerandoSlot] = useState(false)
  const [tab, setTab] = useState<Canal>("linkedin")
  const [reordenando, setReordenando] = useState(false)
  const [templateEnCurso, setTemplateEnCurso] = useState<string | null>(null)
  const [lote, setLote] = useState<{
    hechos: number
    total: number
    paso: "texto" | "imagen"
    /** Qué publicación se está generando ahora mismo. */
    slotId: string | null
  } | null>(null)
  const [previaFeed, setPreviaFeed] = useState(false)
  /**
   * Con cuál de los dos sistemas visuales se generan las imágenes de este plan.
   *
   * Vive en localStorage y no en la base a propósito: es un experimento por
   * plan, no una propiedad del plan. Cuando uno de los dos gane, esto se borra
   * y el ganador queda solo.
   */
  const [sistema, setSistema] = useState<SistemaVisual>("accedra")
  /** La última pieza generada con cada template. Es lo que se dibuja en el feed
   *  para las piezas que todavía no tienen su imagen real. */
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({})
  /** Imágenes recién generadas, antes de que vuelva la versión persistida. Sin
   *  esto, la pieza parpadea en vacío entre que sale del generador y se sube. */
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
        // La pestaña arranca en un canal que el plan tenga: con el default fijo
        // en LinkedIn, un plan solo de Meta abría vacío.
        const canales: Canal[] = d.plan?.canales ?? []
        if (canales.length > 0 && !canales.includes("linkedin")) setTab(canales[0])
      })
      .catch((e: Error) => vigente && setError(e.message))
      .finally(() => vigente && setCargando(false))

    return () => {
      vigente = false
    }
  }, [planId])

  useEffect(() => {
    const guardado = window.localStorage.getItem(claveSistema(planId))
    if (esSistema(guardado)) setSistema(guardado)
  }, [planId])

  const cambiarSistema = useCallback(
    (s: SistemaVisual) => {
      setSistema(s)
      window.localStorage.setItem(claveSistema(planId), s)
    },
    [planId]
  )

  // Las miniaturas no bloquean nada: si fallan, el feed se dibuja con los
  // nombres de los templates.
  useEffect(() => {
    fetch("/api/contenido/templates/miniaturas")
      .then((r) => r.json())
      .then((d) => setMiniaturas(d.miniaturas ?? {}))
      .catch(() => {})
  }, [])

  /** Reemplaza un slot en el plan sin volver a pedir todo al servidor. */
  const aplicarSlot = useCallback((actualizado: Slot) => {
    setPlan((prev) =>
      prev
        ? { ...prev, slots: prev.slots.map((s) => (s.id === actualizado.id ? actualizado : s)) }
        : prev
    )
  }, [])

  const elegir = useCallback(
    async (slotId: string, opcionId: string | null) => {
      setEligiendo(true)
      try {
        const res = await fetch("/api/contenido/calendario/slot", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slotId, elegida: opcionId }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error ?? "No se pudo guardar la elección")
          return
        }
        aplicarSlot(data.slot)
      } catch {
        toast.error("No se pudo conectar con el servidor")
      } finally {
        setEligiendo(false)
      }
    },
    [aplicarSlot]
  )

  const cambiarTemplate = useCallback(
    async (slotId: string, slug: string) => {
      setTemplateEnCurso(slotId)
      try {
        const res = await fetch("/api/contenido/calendario/slot", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slotId, templateSlug: slug }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error ?? "No se pudo cambiar el formato")
          return
        }
        aplicarSlot(data.slot)
      } catch {
        toast.error("No se pudo conectar con el servidor")
      } finally {
        setTemplateEnCurso(null)
      }
    },
    [aplicarSlot]
  )

  /**
   * Recalcula qué template le toca a cada pieza con otra semilla.
   *
   * Las que ya tienen imagen quedan clavadas y el resto se acomoda alrededor:
   * el servidor las trata como posiciones fijas.
   */
  const reordenar = useCallback(async () => {
    setReordenando(true)
    try {
      const res = await fetch(`/api/contenido/calendario/${planId}/secuencia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // La semilla sale del reloj: cada click tiene que proponer otra cosa.
        body: JSON.stringify({ semilla: Date.now() % 100000 }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo reordenar")
        return
      }
      setPlan((prev) => (prev ? { ...prev, slots: data.slots } : prev))
      toast.success("Formatos reordenados")
    } catch {
      toast.error("No se pudo conectar con el servidor")
    } finally {
      setReordenando(false)
    }
  }, [planId])

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

  /**
   * Guarda la imagen recién generada en el bucket.
   *
   * Antes vivía en memoria del navegador y recargar la pestaña tiraba cuatro
   * minutos de generación. Se muestra al toque con el data URL y se reemplaza
   * por la versión firmada cuando termina de subir.
   */
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
        // La imagen sigue viéndose gracias al data URL, pero se pierde al
        // recargar: hay que decirlo o el usuario cierra la pestaña tranquilo.
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

  /**
   * Solo los días que tienen publicación en el canal activo. Mostrar los quince
   * con nueve vacíos era hacer scrollear por casilleros donde no pasa nada.
   */
  const slotsDelTab = useMemo(
    () =>
      (plan?.slots ?? [])
        .filter((s) => s.canal === tab)
        .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [plan, tab]
  )

  /**
   * Lo que falta generar EN LA PESTAÑA ACTIVA. Acotarlo al canal no es un
   * capricho: si el lote recorre los dos, la mitad del progreso ocurre en la
   * pestaña que no estás mirando y la pantalla parece trabada.
   */
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

  /**
   * Qué template del camino 2 le toca a cada pieza.
   *
   * Se calcula acá y no se guarda: es una función pura de los slots del plan,
   * así que dos cálculos dan lo mismo. Guardarlo obligaría a una columna nueva
   * para un sistema que todavía se está probando.
   */
  const feedPorSlot = useMemo(
    () => (plan ? secuenciaFeed(plan.slots) : new Map<string, string>()),
    [plan]
  )

  /**
   * El prompt de una pieza, por el camino que esté activo.
   *
   * Único punto donde se decide: el lote y el panel tienen que armar el MISMO
   * prompt o la comparación entre los dos sistemas no mide lo que se cree.
   */
  const promptDeSlot = useCallback(
    async (slot: Slot): Promise<string> => {
      if (sistema !== "feed") return promptDeImagen(slot)

      const templateFeedId = feedPorSlot.get(slot.id)
      if (!templateFeedId) return ""

      const { prompt } = await pedirPromptFeed(slot.id, templateFeedId)
      return prompt
    },
    [sistema, feedPorSlot]
  )

  /**
   * Genera todo lo elegido, de a una. En serie y no en paralelo a propósito: son
   * llamadas caras a un modelo y lanzar once juntas termina en rate limit, con
   * la mitad hecha y sin forma de saber cuál falló.
   */
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

          // Y la imagen. Sin esto el lote dejaba once textos y ninguna pieza
          // visual, que es media publicación: había que entrar a cada día a
          // generar la imagen a mano, justo lo que el botón venía a evitar.
          setLote({ hechos: i, total: pendientes.length, paso: "imagen", slotId: s.id })
          const prompt = await promptDeSlot(data.slot)
          if (prompt) {
            const img = await fetch("/api/contenido/image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              // La proporción sale del canal, siempre. Antes iba "square" fija
              // y una pieza de LinkedIn salía con la medida de Instagram.
              body: JSON.stringify(
                sistema === "feed"
                  ? { prompt, size: proporcionDe(s.canal), sistema: "feed" }
                  : { prompt, size: proporcionDe(s.canal) }
              ),
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
  }, [pendientes, aplicarSlot, guardarImagen, promptDeSlot, sistema])

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
        <Resumen
          plan={plan}
          avance={avance}
          onRenombrar={renombrar}
          onEstado={cambiarEstado}
        />

        {plan.analisis && <Analisis texto={plan.analisis} />}

        {/* Dos generaciones distintas, no un filtro: lo que se publica en
            LinkedIn y lo que va a Meta no se decide con el mismo criterio. */}
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

          {/* Con cuál de los dos sistemas se generan las imágenes. Está al lado
              del botón que las genera y no escondido en un ajuste: la gracia es
              generar la misma pieza por los dos caminos y comparar. */}
          <div
            className="flex gap-1 rounded-xl border border-line bg-surface p-1 shadow-e1"
            title={SISTEMA_NOTA[sistema]}
          >
            {SISTEMAS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => cambiarSistema(s)}
                disabled={Boolean(lote)}
                title={SISTEMA_NOTA[s]}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-colors disabled:opacity-50",
                  sistema === s
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                )}
              >
                {SISTEMA_LABEL[s]}
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={reordenar} disabled={reordenando}>
              {reordenando ? <Loader2 className="animate-spin" /> : <Shuffle />}
              Reordenar formatos
            </Button>
            {/* Antes este botón exigía tener contenido generado. Es al revés: el
                preview sirve JUSTAMENTE para decidir antes de generar. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviaFeed(true)}
              disabled={slotsDelTab.length === 0}
            >
              <Eye />
              Ver el feed
            </Button>
            <Button
              size="sm"
              onClick={generarTodas}
              disabled={pendientes.length === 0 || Boolean(lote)}
            >
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
              miniaturas={miniaturas}
              guardandoTemplate={templateEnCurso === s.id}
              enCurso={lote?.slotId === s.id ? lote.paso : null}
              eligiendo={eligiendo}
              onElegir={elegir}
              onTemplate={cambiarTemplate}
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
          miniaturas={miniaturas}
          onCerrar={() => setPreviaFeed(false)}
        />
      )}

      <PiezaPanel
        slot={slot}
        sistema={sistema}
        feedTemplateId={slot ? (feedPorSlot.get(slot.id) ?? null) : null}
        eligiendo={eligiendo}
        generando={generandoSlot}
        imagen={slot ? imagenDe(slot) : null}
        miniaturas={miniaturas}
        guardandoTemplate={Boolean(slot && templateEnCurso === slot.id)}
        onImagen={guardarImagen}
        onTemplate={cambiarTemplate}
        onCerrar={() => setSlotAbierto(null)}
        onElegir={elegir}
        onGenerar={generarContenido}
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
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-ink-muted">
              {plan.arco}
            </p>
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
        <Metrica valor={avance.elegidos} label="elegidas" tono="brand" />
        <Metrica valor={avance.listos} label="con texto" tono="brand" />
        <Metrica valor={avance.conImagen} label="con imagen" tono="ok" />

        <div className="ml-auto flex min-w-[140px] flex-1 items-center gap-2.5 sm:flex-none sm:basis-52">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-success transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="num shrink-0 font-mono text-[11px] font-semibold text-ink-muted">
            {pct}%
          </span>
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

/* ── Día ──────────────────────────────────────────────────────────────────── */

/**
 * Un día del plan con sus tres opciones a la vista.
 *
 * Antes cada día era una celda de una grilla de quince y había que abrir un
 * panel para ver qué proponía. Elegir entre tres cosas que no se ven al mismo
 * tiempo no es elegir: es aceptar la primera. Acá las tres están abiertas y la
 * recomendada viene marcada con su motivo.
 */
function DiaPlan({
  slot,
  imagen,
  miniaturas,
  guardandoTemplate,
  enCurso,
  eligiendo,
  onElegir,
  onTemplate,
  onAbrir,
}: {
  slot: Slot
  imagen: string | null
  miniaturas: Record<string, string>
  guardandoTemplate: boolean
  /** Qué se está generando de esta pieza ahora mismo, si es que algo. */
  enCurso: "texto" | "imagen" | null
  eligiendo: boolean
  onElegir: (slotId: string, opcionId: string) => void
  onTemplate: (slotId: string, slug: string) => void
  onAbrir: (id: string) => void
}) {
  const { diaSemana, numero, mes, finDeSemana } = etiquetaDia(slot.fecha)
  const listo = Boolean(slot.contenido)

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
        ) : slot.elegida ? (
          <Badge tone="brand" size="sm">
            Elegida
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm">
            Sin elegir
          </Badge>
        )}
        <Button size="xs" variant="ghost" onClick={() => onAbrir(slot.id)}>
          <PenLine />
          Detalle
        </Button>
      </div>

      {/* El formato de la pieza, arriba de las opciones: es lo que decide cómo
          se va a ver en la grilla, y se elige antes de generar nada. */}
      <div className="border-b border-line-soft px-3 py-2 sm:max-w-sm">
        <SelectorTemplate
          templateSlug={slot.templateSlug}
          miniaturas={miniaturas}
          guardando={guardandoTemplate}
          yaTieneImagen={Boolean(slot.imagenPath)}
          onElegir={(slug) => onTemplate(slot.id, slug)}
        />
      </div>

      {listo ? (
        <PiezaLista slot={slot} imagen={imagen} enCurso={enCurso} onAbrir={() => onAbrir(slot.id)} />
      ) : (
        <div className="grid gap-2.5 p-3 lg:grid-cols-3">
          {slot.opciones.map((o) => (
            <OpcionCard
              key={o.id}
              opcion={o}
              elegida={slot.elegida === o.id}
              deshabilitado={eligiendo}
              onElegir={() => onElegir(slot.id, o.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OpcionCard({
  opcion,
  elegida,
  deshabilitado,
  onElegir,
}: {
  opcion: Opcion
  elegida: boolean
  deshabilitado: boolean
  onElegir: () => void
}) {
  return (
    <button
      type="button"
      onClick={onElegir}
      disabled={deshabilitado || elegida}
      className={cn(
        "flex flex-col rounded-xl border p-3 text-left transition-all duration-150",
        elegida
          ? "border-brand-300 bg-brand-50 shadow-e1"
          : "border-line bg-surface hover:-translate-y-px hover:border-brand-200 hover:shadow-e1",
        deshabilitado && !elegida && "opacity-60"
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold uppercase",
            elegida ? "bg-brand-600 text-white" : "bg-surface-muted text-ink-muted"
          )}
        >
          {elegida ? <Check className="h-3 w-3" strokeWidth={3} /> : opcion.id}
        </span>
        <p className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-ink">
          {opcion.titulo}
        </p>
      </div>

      {opcion.recomendada && (
        <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-md bg-success-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success-text">
          <Sparkles className="h-2.5 w-2.5" strokeWidth={2.5} />
          Recomendada
        </span>
      )}

      {opcion.hook && (
        <p className="mt-2 text-[11.5px] italic leading-relaxed text-ink-secondary">“{opcion.hook}”</p>
      )}

      <dl className="mt-2.5 space-y-1.5 border-t border-line pt-2.5">
        {opcion.angulo && (
          <div>
            <dt className="text-[9px] font-bold uppercase tracking-[0.09em] text-ink-faint">El posteo</dt>
            <dd className="text-[11px] leading-relaxed text-ink-muted">{opcion.angulo}</dd>
          </div>
        )}
        {opcion.imagen && (
          <div>
            <dt className="text-[9px] font-bold uppercase tracking-[0.09em] text-ink-faint">La imagen</dt>
            <dd className="text-[11px] leading-relaxed text-ink-muted">{opcion.imagen}</dd>
          </div>
        )}
      </dl>

      {opcion.recomendada && opcion.porQue && (
        <p className="mt-2.5 rounded-lg bg-success-soft/60 px-2.5 py-1.5 text-[10.5px] leading-relaxed text-success-text">
          {opcion.porQue}
        </p>
      )}
    </button>
  )
}

/* ── Análisis del plan ────────────────────────────────────────────────────── */

/**
 * La lectura de marketer, arriba de todo.
 *
 * Un calendario sin explicación es una lista de tareas: se ejecuta sin criterio
 * y no se puede discutir. Con el reparto explicado —cuánto da a conocer, cuánto
 * educa, cuánto convierte— se puede estar en desacuerdo, que es justamente lo
 * que hace que alguien lo revise en serio.
 */
function Analisis({ texto }: { texto: string }) {
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50 p-5">
      <p className="eyebrow mb-2 text-brand-700">Por qué este plan</p>
      <p className="max-w-3xl whitespace-pre-line text-[13px] leading-relaxed text-brand-700/90">
        {texto}
      </p>
    </div>
  )
}

/* ── Enlace al Studio ─────────────────────────────────────────────────────── */

/** Va en las acciones de la cabecera: el calendario planifica, el Studio produce
 *  piezas sueltas fuera del plan. */
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

/**
 * El día ya resuelto: la pieza como quedó.
 *
 * Con el contenido generado, mostrar otra vez las tres opciones es ruido —dos de
 * ellas ya no son alternativas—. Y la imagen tiene que estar acá: si solo se ve
 * abriendo el detalle, después de generar once piezas en lote no hay forma de
 * saber qué salió sin entrar once veces.
 */
function PiezaLista({
  slot,
  imagen,
  enCurso,
  onAbrir,
}: {
  slot: Slot
  imagen: string | null
  enCurso: "texto" | "imagen" | null
  onAbrir: () => void
}) {
  const elegida = slot.opciones.find((o) => o.id === slot.elegida)

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
        {elegida && (
          <p className="text-[12.5px] font-semibold leading-snug text-ink">{elegida.titulo}</p>
        )}
        <p className="mt-1 line-clamp-3 text-[11.5px] leading-relaxed text-ink-muted">
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
