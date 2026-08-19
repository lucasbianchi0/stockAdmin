"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { pedirPlaca, pedirPromptFeed, proporcionDe, secuenciaFeed } from "@/lib/sistema-visual"

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
  /** El avance de la redacción automática del copy. Null cuando no está corriendo. */
  const [redaccion, setRedaccion] = useState<{ hechos: number; total: number } | null>(null)
  /** La pieza a la que se le está haciendo la imagen desde su propia fila. */
  const [imagenSuelta, setImagenSuelta] = useState<string | null>(null)

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

  /**
   * Escribe el copy de las piezas que todavía no lo tienen.
   *
   * Corre sola al abrir el plan, no con un botón: un plan tiene que quedar listo
   * para publicar salvo por las imágenes, y pedirle al usuario que después
   * apriete "generar" once veces era dejarle la mitad del trabajo hecho.
   *
   * NO se puede hacer dentro del POST que crea el plan, que sería el lugar
   * obvio: esa ruta ya tarda dos o tres minutos generando las once ideas y vive
   * contra el `maxDuration = 60` del plan hobby de Vercel. Sumarle once captions
   * garantiza el timeout. Acá, en cambio, cada caption es su propio request de
   * 60 segundos: si uno falla se pierde ese, no el plan.
   *
   * De a tres. En serie son varios minutos mirando un spinner; las once juntas
   * entran en rate limit del modelo y falla la mitad.
   */
  const redactarPendientes = useCallback(
    async (slots: Slot[]) => {
      const faltan = slots.filter((s) => s.elegida && !s.contenido)
      if (faltan.length === 0) return

      setRedaccion({ hechos: 0, total: faltan.length })
      const cola = [...faltan]
      let hechos = 0
      let fallaron = 0

      const trabajador = async () => {
        for (;;) {
          const s = cola.shift()
          if (!s) return
          try {
            const res = await fetch("/api/contenido/calendario/slot", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ slotId: s.id, ajuste: "" }),
            })
            const data = await res.json()
            if (!res.ok) fallaron++
            else aplicarSlot(data.slot)
          } catch {
            fallaron++
          }
          hechos++
          setRedaccion({ hechos, total: faltan.length })
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(3, faltan.length) }, () => trabajador())
      )

      setRedaccion(null)
      if (fallaron === 0) toast.success("El plan está listo para publicar. Faltan las imágenes.")
      else toast.warning(`${fallaron} pieza(s) quedaron sin texto. Se reintenta al recargar.`)
    },
    [aplicarSlot]
  )

  /**
   * Dispara la redacción una sola vez por plan.
   *
   * El guard por id y no por booleano porque `plan` cambia con cada slot que
   * vuelve: sin él, cada caption que llega relanzaría la tanda entera.
   *
   * Los planes terminados y archivados quedan afuera a propósito: abrir uno de
   * hace tres meses para mirarlo no tiene por qué disparar once generaciones.
   */
  const redactadoRef = useRef<string | null>(null)
  useEffect(() => {
    if (!plan || redactadoRef.current === plan.id) return
    if (plan.estado !== "activo" && plan.estado !== "borrador") return
    redactadoRef.current = plan.id
    void redactarPendientes(plan.slots)
  }, [plan, redactarPendientes])

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

  /**
   * Lo que falta EN LA PESTAÑA ACTIVA: las piezas sin imagen.
   *
   * Antes esto era "sin contenido", porque el texto también salía de este botón.
   * Ahora el texto se escribe solo al abrir el plan, así que lo único que queda
   * por decidir es a cuáles se les hace la imagen — que es la parte cara y la
   * que el usuario quiere elegir pieza por pieza.
   */
  const sinImagen = useMemo(
    () => slotsDelTab.filter((s) => s.elegida && !s.imagenPath && !recienGeneradas[s.id]),
    [slotsDelTab, recienGeneradas]
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

  /**
   * La imagen de una pieza: fondo generado y texto compuesto por código.
   *
   * Devuelve null cuando la pieza no tiene template asignado. El lote lo trata
   * como "sin imagen" y sigue, que es lo mismo que hacía antes con un prompt
   * vacío: una pieza sin imagen se resuelve desde el detalle, y frenar las diez
   * restantes por una sería peor.
   */
  const imagenDeSlot = useCallback(
    async (slot: Slot): Promise<string | null> => {
      const templateFeedId = feedPorSlot.get(slot.id)
      if (!templateFeedId) return null

      const { variables } = await pedirPromptFeed(slot.id, templateFeedId)
      const medida = proporcionDe(slot.canal)
      return await pedirPlaca(
        slot.id,
        templateFeedId,
        variables,
        medida === "portrait" ? "portrait" : "square"
      )
    },
    [feedPorSlot]
  )

  /**
   * La imagen de UNA pieza, desde su fila en la lista.
   *
   * Es el gesto que el usuario pidió: con el texto ya escrito, lo único que
   * queda por decidir es a cuáles se les hace la imagen, y esa decisión se toma
   * mirando la grilla — no entrando al detalle de cada una.
   */
  const generarImagenDe = useCallback(
    async (s: Slot) => {
      setImagenSuelta(s.id)
      try {
        let listo = s

        // Red por si la redacción automática falló justo en esta.
        if (!s.contenido) {
          const res = await fetch("/api/contenido/calendario/slot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slotId: s.id, ajuste: "" }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error)
          aplicarSlot(data.slot)
          listo = data.slot
        }

        const imagen = await imagenDeSlot(listo)
        if (imagen) await guardarImagen(s.id, imagen)
        else toast.error("Esta pieza no tiene template de feed asignado")
      } catch {
        toast.error("No se pudo generar la imagen")
      } finally {
        setImagenSuelta(null)
      }
    },
    [aplicarSlot, guardarImagen, imagenDeSlot]
  )

  /**
   * Genera las imágenes que faltan en la pestaña, de a una y en serie.
   *
   * En serie y no en paralelo como la redacción: cada imagen es una generación
   * pesada, y lanzarlas juntas es la forma más rápida de comerse el rate limit
   * del generador y perder las once.
   *
   * Sigue sabiendo escribir el texto si una pieza llegó sin él: la redacción
   * automática puede haber fallado en una, y frenar la imagen por eso sería
   * mandar al usuario a resolver a mano algo que el botón puede resolver solo.
   */
  const generarImagenes = useCallback(async () => {
    if (sinImagen.length === 0) return
    setLote({ hechos: 0, total: sinImagen.length, paso: "texto", slotId: null })
    let fallaron = 0

    for (const [i, s] of sinImagen.entries()) {
      try {
        let slotListo = s

        if (!s.contenido) {
          setLote({ hechos: i, total: sinImagen.length, paso: "texto", slotId: s.id })
          const res = await fetch("/api/contenido/calendario/slot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slotId: s.id, ajuste: "" }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error)
          aplicarSlot(data.slot)
          slotListo = data.slot
        }

        setLote({ hechos: i, total: sinImagen.length, paso: "imagen", slotId: s.id })
        const imagen = await imagenDeSlot(slotListo)
        if (imagen) await guardarImagen(s.id, imagen)
      } catch {
        fallaron++
      }
      setLote({ hechos: i + 1, total: sinImagen.length, paso: "imagen", slotId: null })
    }

    setLote(null)
    if (fallaron === 0) toast.success("Las imágenes están generadas")
    else toast.warning(`Quedaron ${fallaron} sin imagen. Probá de nuevo desde el detalle.`)
  }, [sinImagen, aplicarSlot, guardarImagen, imagenDeSlot])

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

        {/* Mientras se escriben los captions. No bloquea: las piezas ya redactadas
            se pueden abrir y trabajar mientras el resto sigue saliendo. */}
        {redaccion && (
          <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-ink">
                Escribiendo los textos… {redaccion.hechos}/{redaccion.total}
              </p>
              <p className="text-[11px] text-ink-muted">
                Cada pieza queda lista para publicar. Las imágenes las generás vos, las que quieras.
              </p>
            </div>
            <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-brand-200 sm:block">
              <div
                className="h-full rounded-full bg-brand-600 transition-all duration-500"
                style={{ width: `${Math.round((redaccion.hechos / redaccion.total) * 100)}%` }}
              />
            </div>
          </div>
        )}

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
            <Button
              size="sm"
              onClick={generarImagenes}
              disabled={sinImagen.length === 0 || Boolean(lote) || Boolean(redaccion)}
            >
              {lote ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {lote
                ? `${lote.paso === "imagen" ? "Imagen" : "Texto"} ${lote.hechos + 1}/${lote.total}…`
                : sinImagen.length === 0
                  ? "Todas tienen imagen"
                  : `Generar las ${sinImagen.length} imágenes`}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {slotsDelTab.map((s) => (
            <DiaPlan
              key={s.id}
              slot={s}
              imagen={imagenDe(s)}
              enCurso={
                lote?.slotId === s.id ? lote.paso : imagenSuelta === s.id ? "imagen" : null
              }
              ocupado={Boolean(lote) || Boolean(redaccion) || Boolean(imagenSuelta)}
              onAbrir={setSlotAbierto}
              onImagen={generarImagenDe}
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
  ocupado,
  onAbrir,
  onImagen,
}: {
  slot: Slot
  imagen: string | null
  enCurso: "texto" | "imagen" | null
  /** Hay otra generación corriendo: no se encolan dos a la vez. */
  ocupado: boolean
  onAbrir: (id: string) => void
  onImagen: (slot: Slot) => void
}) {
  const { diaSemana, numero, mes, finDeSemana } = etiquetaDia(slot.fecha)
  const listo = Boolean(slot.contenido)
  const tieneImagen = Boolean(imagen)
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
        {/* El estado que importa ahora es la imagen: el texto se escribe solo, así
            que "sin texto" pasó de ser el paso normal a ser una falla. */}
        {enCurso ? (
          <Badge tone="brand" size="sm">
            <Loader2 className="h-3 w-3 animate-spin" />
            Generando {enCurso === "imagen" ? "la imagen" : "el texto"}
          </Badge>
        ) : !listo ? (
          <Badge tone="warning" size="sm">
            Sin texto
          </Badge>
        ) : tieneImagen ? (
          <Badge tone="success" size="sm">
            <Check className="h-3 w-3" strokeWidth={3} />
            Lista para publicar
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm">
            Texto listo · falta la imagen
          </Badge>
        )}
        <Button size="xs" variant="ghost" onClick={() => onAbrir(slot.id)}>
          <PenLine />
          Detalle
        </Button>
      </div>

      {listo ? (
        <PiezaLista
          slot={slot}
          idea={idea}
          imagen={imagen}
          enCurso={enCurso}
          ocupado={ocupado}
          onAbrir={() => onAbrir(slot.id)}
          onImagen={() => onImagen(slot)}
        />
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
  ocupado,
  onAbrir,
  onImagen,
}: {
  slot: Slot
  idea: Opcion | null
  imagen: string | null
  enCurso: "texto" | "imagen" | null
  ocupado: boolean
  onAbrir: () => void
  onImagen: () => void
}) {
  return (
    <div className="flex gap-3 p-3">
      {/* Sin imagen la miniatura ES el botón de generar: el hueco que dice "falta
          la imagen" es donde la mano va sola. Con imagen, abre el panel a verla. */}
      <button
        type="button"
        onClick={imagen ? onAbrir : onImagen}
        disabled={!imagen && (ocupado || Boolean(enCurso))}
        className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-muted transition-opacity hover:opacity-85 disabled:opacity-60"
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
        {/* Decía "Generar la imagen" y abría el panel lateral. Generar es generar:
            el botón hace lo que dice y la imagen arranca en el momento. */}
        {imagen ? (
          <Button size="xs" variant="outline" className="mt-2" onClick={onAbrir}>
            <PenLine />
            Ver y editar
          </Button>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <Button size="xs" onClick={onImagen} disabled={ocupado || Boolean(enCurso)}>
              {enCurso === "imagen" ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {enCurso === "imagen" ? "Generando…" : "Generar imagen"}
            </Button>
            <Button size="xs" variant="ghost" onClick={onAbrir} disabled={Boolean(enCurso)}>
              <PenLine />
              Editar antes
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
