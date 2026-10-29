"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  Database,
  FileText,
  Inbox,
  XCircle,
} from "lucide-react"

import { ErrorState, LoadingState } from "@/components/ui/states"
import { Formato } from "@/components/chatbot/formato"
import { useChatbotOpcional } from "@/components/chatbot/provider"
import { AvatarAgente, PildoraEstado, fechaCorta, fechaHora, relativo } from "@/components/agentes/comun"
import { LectorPropuesta, etiquetaDe } from "@/components/agentes/propuesta"
import { URL_EQUIPO } from "@/components/agentes/equipo"
import { claveDe, mensajeError, pedirJson } from "@/lib/admin/query"
import {
  AGENTES,
  contarPropuestas,
  cuandoCorre,
  proximaCorrida,
  type ClaveAgente,
  type DetalleAgente,
  type EstadoPropuesta,
  type FichaAgente,
  type Propuesta,
  type Trabajo,
} from "@/lib/agentes"
import type { Acceso } from "@/lib/permisos"
import { cn } from "@/lib/utils"

/** Sin el chat montado, los enlaces del análisis sólo se resuelven dentro de marketing. */
const ACCESO_MARKETING: Acceso = { admin: false, modulos: ["marketing"] }

type Filtro = "todas" | EstadoPropuesta
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "pendiente", rotulo: "Por revisar" },
  { id: "todas", rotulo: "Todas" },
  { id: "aprobada", rotulo: "Aprobadas" },
  { id: "descartada", rotulo: "Descartadas" },
]

/**
 * Un renglón de la bandeja: el análisis de una entrega o una de sus propuestas.
 * El id es el que se guarda como "abierto".
 */
type Item =
  | { tipo: "analisis"; id: string; trabajo: Trabajo }
  | { tipo: "propuesta"; id: string; trabajo: Trabajo; propuesta: Propuesta }

export function FichaDeAgente({ clave }: { clave: ClaveAgente }) {
  const ficha = AGENTES[clave]
  const url = `${URL_EQUIPO}?clave=${clave}`
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: claveDe("marketing", url),
    queryFn: ({ signal }) => pedirJson<{ agente: DetalleAgente }>(url, { signal }),
  })

  if (query.isPending) return <LoadingState label={`Llamando a ${ficha.apodo}`} />
  if (query.isError) return <ErrorState message={mensajeError(query.error)} onRetry={() => query.refetch()} />

  const detalle = query.data.agente

  const alCambiar = (nuevo: Trabajo) => {
    qc.setQueryData<{ agente: DetalleAgente }>(claveDe("marketing", url), (prev) =>
      prev ? { agente: { ...prev.agente, trabajos: prev.agente.trabajos.map((t) => (t.id === nuevo.id ? nuevo : t)) } } : prev
    )
    // La tarjeta del equipo cuenta los pendientes: que no quede vieja al volver.
    qc.invalidateQueries({ queryKey: claveDe("marketing", URL_EQUIPO) })
  }

  return (
    <div className="pb-16">
      <Cabecera ficha={ficha} detalle={detalle} />

      <div className="mx-auto w-full max-w-[1400px] space-y-8 px-5 sm:px-8">
        {detalle.trabajos.length ? (
          <Bandeja ficha={ficha} trabajos={detalle.trabajos} onCambio={alCambiar} />
        ) : (
          <SinEntregas ficha={ficha} />
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <Corridas corridas={detalle.corridas} />
          <QueLee ficha={ficha} estado={detalle.estado} />
        </div>
      </div>
    </div>
  )
}

/* ── Cabecera ─────────────────────────────────────────────────────────────── */

function Cabecera({ ficha, detalle }: { ficha: FichaAgente; detalle: DetalleAgente }) {
  const cuenta = contarPropuestas(detalle.trabajos)
  const decididas = cuenta.aprobada + cuenta.descartada
  const tasa = decididas ? Math.round((cuenta.aprobada / decididas) * 100) : null
  const proxima = proximaCorrida(ficha)

  return (
    <header className={cn("relative mb-8 overflow-hidden bg-gradient-to-b", ficha.tema.degrade)}>
      <div className="mx-auto w-full max-w-[1400px] px-5 pb-8 pt-6 sm:px-8">
        <Link
          href="/agentes"
          className="group mb-6 inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> Equipo de agentes
        </Link>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <AvatarAgente ficha={ficha} tamano={140} prioridad className="rounded-[30px] shadow-e3 ring-4 ring-white" />
            <div className="min-w-0">
              <PildoraEstado estado={detalle.estado} />
              <h1 className="mt-3 text-[34px] font-semibold leading-none tracking-[-0.04em] text-ink">{ficha.apodo}</h1>
              <p className={cn("mt-1.5 text-[14px] font-semibold", ficha.tema.texto)}>{ficha.nombre}</p>
              <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-ink-secondary">{ficha.descripcion}</p>
              <p className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                <CalendarClock className="h-3.5 w-3.5" /> {cuandoCorre(ficha)} · próxima {relativo(proxima)}
              </p>
            </div>
          </div>

          <dl className="grid shrink-0 grid-cols-4 gap-2.5 lg:w-[460px]">
            <Numero rotulo="Entregas" valor={String(detalle.trabajos.length)} />
            <Numero rotulo="Por revisar" valor={String(cuenta.pendiente)} resaltar={cuenta.pendiente > 0} ficha={ficha} />
            <Numero rotulo="Aprobadas" valor={String(cuenta.aprobada)} />
            <Numero rotulo="Le aceptás" valor={tasa === null ? "—" : `${tasa}%`} />
          </dl>
        </div>
      </div>
    </header>
  )
}

function Numero({ rotulo, valor, resaltar, ficha }: { rotulo: string; valor: string; resaltar?: boolean; ficha?: FichaAgente }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/70 px-3 py-2.5 shadow-e1 backdrop-blur">
      <dt className="truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">{rotulo}</dt>
      <dd
        className={cn(
          "mt-1 text-[24px] font-semibold tabular-nums leading-none tracking-[-0.03em]",
          resaltar && ficha ? ficha.tema.texto : "text-ink"
        )}
      >
        {valor}
      </dd>
    </div>
  )
}

/* ── La bandeja ───────────────────────────────────────────────────────────── */

/**
 * Como un cliente de mail: a la izquierda la lista, breve, agrupada por entrega;
 * a la derecha lo que está abierto. El análisis de cada entrega es un renglón
 * más, arriba de sus propuestas.
 *
 * Al aprobar o descartar se abre sola la siguiente pendiente: revisar es vaciar
 * la bandeja, no ir y volver.
 */
function Bandeja({
  ficha,
  trabajos,
  onCambio,
}: {
  ficha: FichaAgente
  trabajos: Trabajo[]
  onCambio: (t: Trabajo) => void
}) {
  const cuenta = contarPropuestas(trabajos)
  const [filtro, setFiltro] = useState<Filtro>(cuenta.pendiente ? "pendiente" : "todas")
  const [abierto, setAbierto] = useState<string | null>(null)
  // En el teléfono se ve una columna por vez: la lista o el lector.
  const [leyendo, setLeyendo] = useState(false)

  const grupos = useMemo(
    () =>
      trabajos
        .map((t) => {
          const items: Item[] = t.propuestas
            .filter((p) => filtro === "todas" || p.estado === filtro)
            .map((p) => ({ tipo: "propuesta", id: p.id, trabajo: t, propuesta: p }))
          // El análisis acompaña siempre que la entrega tenga algo que mostrar.
          if (t.resumen && (items.length || filtro === "todas")) items.unshift({ tipo: "analisis", id: `analisis-${t.id}`, trabajo: t })
          return { trabajo: t, items }
        })
        .filter((g) => g.items.length > 0),
    [trabajos, filtro]
  )
  const items = grupos.flatMap((g) => g.items)
  // Lo abierto, o lo primero que pida decisión, o lo primero de la lista.
  const actual =
    items.find((i) => i.id === abierto) ??
    items.find((i) => i.tipo === "propuesta" && i.propuesta.estado === "pendiente") ??
    items[0] ??
    null

  const abrir = (id: string) => {
    setAbierto(id)
    setLeyendo(true)
  }

  const alCambiar = (nuevo: Trabajo, decidida: boolean) => {
    if (decidida && actual?.tipo === "propuesta") {
      // La siguiente pendiente después de la actual, en el orden de la lista.
      const desde = items.findIndex((i) => i.id === actual.id)
      const siguiente = [...items.slice(desde + 1), ...items.slice(0, desde)].find(
        (i) => i.tipo === "propuesta" && i.propuesta.estado === "pendiente"
      )
      setAbierto(siguiente?.id ?? actual.id)
    }
    onCambio(nuevo)
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-e2">
      <div className="grid lg:h-[min(78vh,820px)] lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* ── Lista ── */}
        <div className={cn("flex min-h-0 flex-col border-line lg:border-r", leyendo && "hidden lg:flex")}>
          <div className="border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-ink-faint" />
              <h2 className="text-[14px] font-semibold text-ink">Bandeja de {ficha.apodo}</h2>
            </div>
            <div className="mt-3 flex gap-1 overflow-x-auto">
              {FILTROS.map((f) => {
                const n = f.id === "todas" ? cuenta.pendiente + cuenta.aprobada + cuenta.descartada : cuenta[f.id]
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFiltro(f.id)}
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                      filtro === f.id ? "bg-ink text-white" : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                    )}
                  >
                    {f.rotulo}
                    <span className={cn("ml-1 tabular-nums", filtro === f.id ? "text-white/60" : "text-ink-faint")}>{n}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {grupos.length === 0 && (
              <div className="px-6 py-14 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
                <p className="mt-3 text-[13.5px] font-semibold text-ink">Nada por acá</p>
                <p className="mt-1 text-[12.5px] text-ink-muted">
                  {filtro === "pendiente" ? "Revisaste todo lo que entregó." : "No hay propuestas en este estado."}
                </p>
              </div>
            )}
            {grupos.map((g) => (
              <div key={g.trabajo.id}>
                <p className="sticky top-0 z-10 border-b border-line bg-surface-subtle/95 px-4 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-faint backdrop-blur">
                  {fechaCorta(g.trabajo.creadoEn)} · {g.trabajo.titulo}
                </p>
                <ul>
                  {g.items.map((it) => (
                    <Renglon key={it.id} ficha={ficha} item={it} activo={it.id === actual?.id} onAbrir={() => abrir(it.id)} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ── Lector ── */}
        <div className={cn("min-h-0 bg-surface", !leyendo && "hidden lg:block")}>
          <button
            type="button"
            onClick={() => setLeyendo(false)}
            className="flex items-center gap-1 border-b border-line px-4 py-2.5 text-[12.5px] font-medium text-ink-muted lg:hidden"
          >
            <ChevronLeft className="h-4 w-4" /> Bandeja
          </button>
          {actual?.tipo === "propuesta" && (
            <LectorPropuesta
              key={actual.id}
              ficha={ficha}
              trabajo={actual.trabajo}
              propuesta={actual.propuesta}
              onCambio={alCambiar}
            />
          )}
          {actual?.tipo === "analisis" && <LectorAnalisis key={actual.id} ficha={ficha} trabajo={actual.trabajo} />}
          {!actual && (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-6 text-center">
              <AvatarAgente ficha={ficha} tamano={96} className="rounded-3xl" />
              <p className="mt-4 text-[14px] font-semibold text-ink">Elegí algo de la bandeja</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function Renglon({ ficha, item, activo, onAbrir }: { ficha: FichaAgente; item: Item; activo: boolean; onAbrir: () => void }) {
  const esAnalisis = item.tipo === "analisis"
  const p = item.tipo === "propuesta" ? item.propuesta : null
  const pendiente = p?.estado === "pendiente"
  const etiqueta = p ? etiquetaDe(p) : "Análisis"
  const titulo = p ? p.titulo : `Lo que ve ${ficha.apodo}`
  // La primera línea con texto del análisis, sin la marcación de markdown.
  const bajada = p
    ? p.detalle
    : (item.trabajo.resumen.split("\n").find((l) => l.trim() && !l.trim().startsWith("#")) ?? "").replace(/[*_`#>]/g, "")

  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        className={cn(
          "relative flex w-full gap-3 border-b border-line px-4 py-3.5 text-left transition-colors",
          activo ? ficha.tema.lavado : "hover:bg-surface-subtle"
        )}
      >
        {activo && <span className={cn("absolute inset-y-0 left-0 w-[3px]", ficha.tema.punto)} />}
        <span className="mt-1.5 flex w-2 shrink-0 justify-center">
          {pendiente && <span className={cn("h-2 w-2 rounded-full", ficha.tema.punto)} />}
          {esAnalisis && <FileText className="-ml-1 h-3.5 w-3.5 text-ink-faint" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn("text-[10.5px] font-bold uppercase tracking-[0.06em]", esAnalisis ? "text-ink-faint" : ficha.tema.texto)}>
              {etiqueta}
            </span>
            {p?.estado === "aprobada" && <span className="text-[10.5px] font-semibold text-emerald-600">✓ Aprobada</span>}
            {p?.estado === "descartada" && <span className="text-[10.5px] font-semibold text-ink-faint">Descartada</span>}
          </span>
          <span
            className={cn(
              "mt-0.5 block truncate text-[13.5px]",
              pendiente ? "font-semibold text-ink" : p?.estado === "descartada" ? "text-ink-faint line-through" : "text-ink-secondary"
            )}
          >
            {titulo}
          </span>
          <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink-muted">{bajada}</span>
        </span>
      </button>
    </li>
  )
}

/** El análisis de una entrega, abierto en el lector. */
function LectorAnalisis({ ficha, trabajo }: { ficha: FichaAgente; trabajo: Trabajo }) {
  const acceso = useChatbotOpcional()?.acceso ?? ACCESO_MARKETING
  const sinDatos = Object.entries(trabajo.fuentes).filter(([, v]) => /error|venc|falta|no /i.test(v))

  return (
    <article className="h-full overflow-y-auto px-6 py-6">
      <div className="flex items-center gap-3">
        <AvatarAgente ficha={ficha} tamano={36} className="rounded-full" />
        <div className="min-w-0 text-[12.5px]">
          <p className="font-semibold text-ink">{ficha.apodo}</p>
          <p className="truncate text-ink-muted">{fechaHora(trabajo.creadoEn)}</p>
        </div>
      </div>

      <p className={cn("mt-6 text-[10.5px] font-bold uppercase tracking-[0.1em]", ficha.tema.texto)}>Análisis de la entrega</p>
      <h2 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.03em] text-ink">{trabajo.titulo}</h2>

      {Object.keys(trabajo.fuentes).length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {Object.entries(trabajo.fuentes).map(([fuente, estado]) => {
            const mal = sinDatos.some(([f]) => f === fuente)
            return (
              <span
                key={fuente}
                title={estado}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                  mal ? "border-warning-line bg-warning-soft text-warning-text" : "border-line bg-surface-subtle text-ink-muted"
                )}
              >
                {mal ? <AlertTriangle className="h-3 w-3" /> : <Database className="h-3 w-3" />}
                {fuente}
                <span className="text-ink-faint">· {estado}</span>
              </span>
            )
          })}
        </div>
      )}

      <div className="mt-6 text-[14px] leading-relaxed text-ink-secondary">
        <Formato texto={trabajo.resumen} enCurso={false} acceso={acceso} onNavegar={() => {}} />
      </div>

      {trabajo.revisadoPor && trabajo.revisadoEn && (
        <p className="mt-8 border-t border-line pt-4 text-[12px] text-ink-faint">
          Revisó {trabajo.revisadoPor} {relativo(trabajo.revisadoEn)}
        </p>
      )}
    </article>
  )
}

function SinEntregas({ ficha }: { ficha: FichaAgente }) {
  return (
    <div className={cn("rounded-3xl border border-dashed px-6 py-14 text-center", ficha.tema.borde)}>
      <AvatarAgente ficha={ficha} tamano={88} className="mx-auto rounded-3xl" />
      <p className="mt-4 text-[15px] font-semibold text-ink">{ficha.apodo} todavía no entregó nada</p>
      <p className="mt-1 text-[13px] text-ink-muted">
        Su primera entrega aparece acá después de la próxima corrida ({cuandoCorre(ficha).toLowerCase()}).
      </p>
    </div>
  )
}

/* ── Debajo de la bandeja ─────────────────────────────────────────────────── */

function Corridas({ corridas }: { corridas: DetalleAgente["corridas"] }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint">Corridas</h3>
      {corridas.length === 0 && <p className="text-[12.5px] text-ink-muted">Todavía no corrió.</p>}
      <ul className="space-y-2.5">
        {corridas.slice(0, 6).map((c) => (
          <li key={c.inicio} className="flex items-start gap-2 text-[12.5px]">
            {c.ok ? (
              <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-500" />
            ) : (
              <XCircle className="mt-px h-3.5 w-3.5 shrink-0 text-danger-text" />
            )}
            <span className="min-w-0">
              <span className="text-ink-secondary">{fechaHora(c.inicio)}</span>
              <span className="text-ink-faint"> · {c.origen === "manual" ? "a mano" : "automática"}</span>
              {c.detalle && (
                <span className={cn("block truncate", c.ok ? "text-ink-muted" : "text-danger-text")} title={c.detalle}>
                  {c.detalle}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function QueLee({ ficha, estado }: { ficha: FichaAgente; estado: DetalleAgente["estado"] }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint">Qué mira</h3>
      <ul className="space-y-2">
        {ficha.lee.map((l) => (
          <li key={l} className="flex items-center gap-2 text-[12.5px] text-ink-secondary">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ficha.tema.punto)} />
            {l}
          </li>
        ))}
      </ul>
      {estado === "pausado" && <p className="mt-3 text-[12px] text-ink-muted">Está en pausa: se reactiva desde el Calendario.</p>}
    </section>
  )
}
