"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Copy, ExternalLink, X, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { Formato } from "@/components/chatbot/formato"
import { useChatbotOpcional } from "@/components/chatbot/provider"
import { claveDe, mensajeError, pedirJson } from "@/lib/admin/query"
import type { EstadoAgente, EstadoPropuesta, Propuesta, Trabajo } from "@/lib/agentes"
import type { Acceso } from "@/lib/permisos"
import { cn } from "@/lib/utils"

const URL = "/api/agentes"
const CLAVE = claveDe("marketing", URL)

/** Sin el chat montado, los enlaces del análisis sólo se resuelven dentro de marketing. */
const ACCESO_MARKETING: Acceso = { admin: false, modulos: ["marketing"] }

const ESTADO_PROPUESTA: Record<EstadoPropuesta, { rotulo: string; tono: "neutral" | "success" | "danger" }> = {
  pendiente: { rotulo: "Pendiente", tono: "neutral" },
  aprobada: { rotulo: "Aprobada", tono: "success" },
  descartada: { rotulo: "Descartada", tono: "danger" },
}

const RED_LABEL: Record<string, string> = { linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook" }
const TIPO_NOTA: Record<string, string> = { guia: "Guía", nota: "Nota", caso: "Caso" }

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AgentesClient() {
  const query = useQuery({
    queryKey: CLAVE,
    queryFn: ({ signal }) => pedirJson<{ agentes: EstadoAgente[] }>(URL, { signal }),
  })

  if (query.isPending) return <LoadingState label="Cargando agentes" />
  if (query.isError) return <ErrorState message={mensajeError(query.error)} onRetry={() => query.refetch()} />

  return (
    <div className="space-y-6">
      {query.data.agentes.map((a) => (
        <TarjetaAgente key={a.ficha.clave} agente={a} />
      ))}
    </div>
  )
}

function TarjetaAgente({ agente }: { agente: EstadoAgente }) {
  const { ficha, estado, ultimaCorrida, trabajos } = agente
  const [ultimo, ...anteriores] = trabajos
  const [verAnteriores, setVerAnteriores] = useState(false)

  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-e1">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-ink">{ficha.nombre}</h2>
            <Badge tone="neutral" size="sm">
              {ficha.cuando}
            </Badge>
            {estado === "planificado" && (
              <Badge tone="warning" size="sm">
                Todavía no corrió
              </Badge>
            )}
            {estado === "pausado" && (
              <Badge tone="neutral" size="sm">
                Pausado
              </Badge>
            )}
          </div>
          <p className="mt-1 text-[13px] text-ink-muted">{ficha.rol}</p>
        </div>
        {ultimaCorrida && (
          <div
            className={cn(
              "flex items-center gap-1.5 text-[12px]",
              ultimaCorrida.ok ? "text-success-text" : "text-danger-text"
            )}
            title={ultimaCorrida.detalle ?? undefined}
          >
            {ultimaCorrida.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            <span>
              {fechaHora(ultimaCorrida.inicio)}
              {ultimaCorrida.detalle ? ` · ${ultimaCorrida.detalle}` : ""}
            </span>
          </div>
        )}
      </header>

      {ultimo ? (
        <div className="mt-4">
          <EntregaTrabajo trabajo={ultimo} aprobar={ficha.aprobar} />
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-surface-subtle px-3 py-2.5 text-[13px] text-ink-muted">
          Sin entregas todavía. La primera aparece acá después de su próxima corrida ({ficha.cuando.toLowerCase()}).
        </p>
      )}

      {anteriores.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => setVerAnteriores((v) => !v)}
            className="flex items-center gap-1 text-[12px] font-medium text-ink-muted hover:text-ink"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", verAnteriores && "rotate-180")} />
            {verAnteriores ? "Ocultar" : "Ver"} entregas anteriores ({anteriores.length})
          </button>
          {verAnteriores && (
            <div className="mt-3 space-y-5">
              {anteriores.map((t) => (
                <EntregaTrabajo key={t.id} trabajo={t} aprobar={ficha.aprobar} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function EntregaTrabajo({ trabajo, aprobar }: { trabajo: Trabajo; aprobar: string }) {
  const acceso = useChatbotOpcional()?.acceso ?? ACCESO_MARKETING
  const conProblemas = Object.entries(trabajo.fuentes).filter(([, v]) => /error|venc|falta|no /i.test(v))

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13.5px] font-semibold text-ink">{trabajo.titulo}</h3>
        <span className="text-[11.5px] text-ink-faint">{fechaHora(trabajo.creadoEn)}</span>
      </div>

      {conProblemas.length > 0 && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md bg-warning-soft px-2.5 py-1.5 text-[12px] text-warning-text">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Trabajó sin {conProblemas.map(([k, v]) => `${k} (${v})`).join(", ")}.
          </span>
        </div>
      )}

      {trabajo.resumen && (
        <div className="mt-3 text-[13px] leading-relaxed text-ink-secondary">
          <Formato texto={trabajo.resumen} enCurso={false} acceso={acceso} onNavegar={() => {}} />
        </div>
      )}

      {trabajo.propuestas.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-[11.5px] text-ink-faint">Aprobar: {aprobar}</p>
          {trabajo.propuestas.map((p) => (
            <TarjetaPropuesta key={p.id} trabajoId={trabajo.id} propuesta={p} />
          ))}
        </div>
      )}
    </div>
  )
}

function TarjetaPropuesta({ trabajoId, propuesta: p }: { trabajoId: string; propuesta: Propuesta }) {
  const qc = useQueryClient()
  const [guardando, setGuardando] = useState<EstadoPropuesta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  const cambiar = async (estado: EstadoPropuesta) => {
    setGuardando(estado)
    setError(null)
    try {
      const { trabajo } = await pedirJson<{ trabajo: Trabajo }>(`${URL}/${trabajoId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ propuestaId: p.id, estado }),
      })
      qc.setQueryData<{ agentes: EstadoAgente[] }>(CLAVE, (prev) =>
        prev
          ? {
              agentes: prev.agentes.map((a) => ({
                ...a,
                trabajos: a.trabajos.map((t) => (t.id === trabajo.id ? trabajo : t)),
              })),
            }
          : prev
      )
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"))
    } finally {
      setGuardando(null)
    }
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(p.texto ?? "")
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      setError("No se pudo copiar")
    }
  }

  const estado = ESTADO_PROPUESTA[p.estado]
  const etiqueta = p.tipo ? TIPO_NOTA[p.tipo] ?? p.tipo : p.red ? RED_LABEL[p.red] ?? p.red : null

  return (
    <article
      className={cn(
        "rounded-lg border border-line p-3.5",
        p.estado === "descartada" ? "bg-surface-subtle opacity-70" : "bg-surface"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {etiqueta && (
            <Badge tone="brand" size="sm">
              {etiqueta}
            </Badge>
          )}
          <h4 className="text-[13.5px] font-semibold text-ink">{p.titulo}</h4>
        </div>
        <Badge tone={estado.tono} size="sm">
          {estado.rotulo}
        </Badge>
      </div>

      <p className="mt-1.5 text-[13px] text-ink-secondary">{p.detalle}</p>

      <dl className="mt-2 space-y-1 text-[12.5px] text-ink-muted">
        {p.keyword && <Dato rotulo="Keyword" valor={p.keyword} />}
        {p.intencion && <Dato rotulo="Para quién" valor={p.intencion} />}
        {p.porQue && <Dato rotulo="Por qué" valor={p.porQue} />}
        {p.campana && <Dato rotulo="Campaña" valor={p.campana} />}
        {p.dato && <Dato rotulo="Dato" valor={p.dato} />}
        {p.ideaVisual && <Dato rotulo="Visual" valor={p.ideaVisual} />}
      </dl>

      {p.puntos && p.puntos.length > 0 && (
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[12.5px] text-ink-secondary marker:text-ink-faint">
          {p.puntos.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}

      {p.texto && (
        <pre className="mt-2 whitespace-pre-wrap rounded-md bg-surface-subtle p-2.5 font-sans text-[12.5px] leading-relaxed text-ink-secondary">
          {p.texto}
        </pre>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {p.estado !== "aprobada" && (
          <Button size="xs" onClick={() => cambiar("aprobada")} disabled={guardando !== null}>
            <Check /> {guardando === "aprobada" ? "Guardando…" : "Aprobar"}
          </Button>
        )}
        {p.estado !== "descartada" && (
          <Button size="xs" variant="outline" onClick={() => cambiar("descartada")} disabled={guardando !== null}>
            <X /> Descartar
          </Button>
        )}
        {p.estado !== "pendiente" && (
          <Button size="xs" variant="ghost" onClick={() => cambiar("pendiente")} disabled={guardando !== null}>
            Volver a pendiente
          </Button>
        )}
        {p.texto && (
          <Button size="xs" variant="ghost" onClick={copiar}>
            <Copy /> {copiado ? "Copiado" : "Copiar texto"}
          </Button>
        )}
        {p.notaId && (
          <Link
            href={`/marketing/notas/${p.notaId}`}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 hover:text-brand-700"
          >
            Abrir el borrador <ExternalLink className="h-3 w-3" />
          </Link>
        )}
        {error && <span className="text-[12px] text-danger-text">{error}</span>}
      </div>
    </article>
  )
}

function Dato({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 font-medium text-ink-secondary">{rotulo}:</dt>
      <dd>{valor}</dd>
    </div>
  )
}
