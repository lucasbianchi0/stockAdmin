"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Check, Copy, Lightbulb, RotateCcw, Sparkles, Target, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { AvatarAgente, fechaHora } from "@/components/agentes/comun"
import type { EstadoPropuesta, FichaAgente, Propuesta, Trabajo } from "@/lib/agentes"
import { cn } from "@/lib/utils"

const RED_LABEL: Record<string, string> = { linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook" }
const TIPO_NOTA: Record<string, string> = { guia: "Guía", nota: "Nota", caso: "Caso" }
const TIPO_ADS: Record<string, string> = {
  negativas: "Negativas",
  keywords: "Keywords",
  presupuesto: "Presupuesto",
  puja: "Puja",
  anuncio: "Anuncio",
  segmentacion: "Segmentación",
  estado: "Estado",
  medicion: "Medición",
}

/** De qué se trata, en una etiqueta: el tipo de nota, la red o el tipo de cambio. */
export function etiquetaDe(p: Propuesta): string | null {
  if (p.red) return RED_LABEL[p.red] ?? p.red
  if (p.tipo) return TIPO_NOTA[p.tipo] ?? TIPO_ADS[p.tipo] ?? p.tipo
  return null
}

/**
 * Una propuesta abierta en el lector, como un mail: de quién y cuándo arriba,
 * las acciones a mano, y el contenido entero debajo.
 *
 * Aprobar y descartar no esperan al servidor: la ficha cambia el estado en la
 * caché al toque y lo deshace si el guardado falla.
 */
export function LectorPropuesta({
  ficha,
  trabajo,
  propuesta: p,
  onDecidir,
}: {
  ficha: FichaAgente
  trabajo: Trabajo
  propuesta: Propuesta
  onDecidir: (estado: EstadoPropuesta) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(p.texto ?? "")
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1600)
    } catch {
      setError("No se pudo copiar")
    }
  }

  const etiqueta = etiquetaDe(p)
  const decidida = p.estado !== "pendiente"

  return (
    <article className="flex h-full flex-col">
      {/* Barra de acciones, siempre a la vista como en un cliente de mail. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-6 py-3">
        {!decidida ? (
          <>
            <Button size="sm" onClick={() => onDecidir("aprobada")}>
              <Check /> Aprobar
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDecidir("descartada")}>
              <X /> Descartar
            </Button>
          </>
        ) : (
          <>
            <span
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold",
                p.estado === "aprobada" ? "bg-emerald-50 text-emerald-700" : "bg-surface-muted text-ink-muted"
              )}
            >
              {p.estado === "aprobada" ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {p.estado === "aprobada" ? "Aprobada" : "Descartada"}
            </span>
            <Button size="sm" variant="ghost" onClick={() => onDecidir("pendiente")}>
              <RotateCcw /> Deshacer
            </Button>
          </>
        )}
        {ficha.clave === "agente-blog" && p.estado === "aprobada" && !p.notaId && (
          <span className="text-[12px] text-ink-muted">Creando el borrador…</span>
        )}
        {p.notaId && (
          <Link
            href={`/marketing/notas/${p.notaId}`}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-lg px-3 text-[12.5px] font-semibold transition hover:brightness-95",
              ficha.tema.fondo,
              ficha.tema.texto
            )}
          >
            Abrir el borrador <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
        {error && <span className="text-[12px] text-danger-text">{error}</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="flex items-center gap-3">
          <AvatarAgente ficha={ficha} tamano={36} className="rounded-full" />
          <div className="min-w-0 text-[12.5px]">
            <p className="font-semibold text-ink">{ficha.apodo}</p>
            <p className="truncate text-ink-muted">
              {fechaHora(trabajo.creadoEn)} · {trabajo.titulo}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {etiqueta && (
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em]",
                ficha.tema.borde,
                ficha.tema.texto
              )}
            >
              {etiqueta}
            </span>
          )}
          {p.campana && <span className="text-[12px] text-ink-muted">{p.campana}</span>}
        </div>
        <h2 className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.03em] text-ink">{p.titulo}</h2>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-secondary">{p.detalle}</p>

        {(p.keyword || p.intencion || p.dato || p.porQue || p.ideaVisual) && (
          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {p.keyword && <Dato icono={Target} rotulo="Keyword" valor={p.keyword} destacado />}
            {p.dato && <Dato icono={Target} rotulo="El dato" valor={p.dato} destacado />}
            {p.intencion && <Dato icono={Sparkles} rotulo="Para quién" valor={p.intencion} />}
            {p.ideaVisual && <Dato icono={Sparkles} rotulo="Visual" valor={p.ideaVisual} />}
            {p.porQue && <Dato icono={Lightbulb} rotulo="Por qué" valor={p.porQue} ancho />}
          </div>
        )}

        {p.puntos && p.puntos.length > 0 && (
          <div className="mt-6">
            <p className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-faint">Índice de la nota</p>
            <ol className="space-y-2 border-l-2 border-line pl-4">
              {p.puntos.map((s, i) => (
                <li key={i} className="flex gap-3 text-[13.5px] text-ink-secondary">
                  <span className={cn("w-4 shrink-0 font-mono text-[12px] font-semibold", ficha.tema.texto)}>{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        )}

        {p.texto && (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-faint">El post</p>
              <button
                type="button"
                onClick={copiar}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copiado ? "Copiado" : "Copiar"}
              </button>
            </div>
            <p className="whitespace-pre-wrap rounded-xl border border-line bg-surface-subtle px-4 py-3.5 text-[13.5px] leading-relaxed text-ink-secondary">
              {p.texto}
            </p>
          </div>
        )}

        <p className="mt-8 border-t border-line pt-4 text-[12px] text-ink-faint">Aprobar: {ficha.aprobar}</p>
      </div>
    </article>
  )
}

function Dato({
  icono: Icono,
  rotulo,
  valor,
  destacado,
  ancho,
}: {
  icono: typeof Target
  rotulo: string
  valor: string
  destacado?: boolean
  ancho?: boolean
}) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface-subtle/60 px-3.5 py-3", ancho && "sm:col-span-2")}>
      <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-faint">
        <Icono className="h-3 w-3" /> {rotulo}
      </p>
      <p className={cn("mt-1 text-[13px] leading-relaxed", destacado ? "font-semibold text-ink" : "text-ink-secondary")}>
        {valor}
      </p>
    </div>
  )
}
