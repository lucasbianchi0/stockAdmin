"use client"

import { useState } from "react"
import { Loader2, Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  BANCO_LABEL,
  BANCO_NOTA,
  CANALES_BANCO,
  TEMAS_BANCO,
  TEMA_LABEL,
  TEMA_NOTA,
  type TemaBanco,
} from "@/lib/banco-context"
import {
  OBJETIVOS,
  OBJETIVO_DESC,
  OBJETIVO_LABEL,
  type Audiencia,
  type Canal,
  type Objetivo,
} from "@/lib/calendario-context"

export type ConfigPieza = {
  canal: Canal
  tema: TemaBanco
  objetivo: Objetivo | null
  audiencia: Audiencia | null
  brief: string
  imagen: string
}

/**
 * Una pieza sobre un pedido concreto, en vez de un lote que elige el tema solo.
 *
 * El campo que importa es la descripción, y por eso va primero y ocupa el doble
 * que el resto: es lo único que el modelo no puede adivinar. Todo lo demás
 * —objetivo, público— se puede dejar sin elegir, y no es dejadez: quien escribe
 * el pedido muchas veces sabe qué quiere contar pero no si eso es awareness o
 * educación. Obligarlo a decidir lo hace tildar cualquier cosa, y esa elección
 * al azar después le tuerce la pieza. Sin elegir, lo resuelve el modelo leyendo
 * el pedido, que para eso lo tiene.
 *
 * El tema sí es obligatorio y no es estético: decide con qué reglas se escribe
 * el titular —el claro son dos líneas cortas, el oscuro una columna— así que un
 * copy escrito para uno no entra en el otro.
 */

const AUDIENCIAS_ELEGIBLES: Audiencia[] = ["decisores", "negocio", "corporativo"]

/**
 * Nombre corto y aclaración aparte.
 *
 * `AUDIENCIA_LABEL` son frases enteras —"Decisores técnicos (IT, CTO,
 * infraestructura)"— porque se escribieron para el prompt, donde cuanto más
 * explícito mejor. En una fila de tres fichas eso parte en tres renglones y deja
 * las tarjetas desparejas. Acá va el nombre arriba y el paréntesis como nota.
 */
const AUDIENCIA_CORTA: Record<Audiencia, { titulo: string; nota: string }> = {
  decisores: { titulo: "Decisores IT", nota: "CTO, infraestructura" },
  negocio: { titulo: "Negocio", nota: "Dueños, gerencia, finanzas" },
  corporativo: { titulo: "Corporativo / RH", nota: "Marca empleadora, equipo" },
  todos: { titulo: "Todos", nota: "Toda la audiencia B2B" },
}

const EJEMPLOS = [
  "Cerramos la migración de red de un banco a 4 provincias, quiero contarlo sin nombrar al cliente.",
  "Explicar por qué el backup no alcanza si nunca se probó la restauración.",
  "Firma biométrica para estudios jurídicos: qué problema real resuelve.",
]

/** Una opción de un grupo. El grupo entero se lee de un vistazo, sin abrir nada. */
function Opcion({
  activo,
  titulo,
  nota,
  onClick,
}: {
  activo: boolean
  titulo: string
  nota?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-lg border px-3 py-2 text-left transition-colors",
        activo
          ? "border-brand-500 bg-brand-50 text-brand-700"
          : "border-line bg-surface text-ink-secondary hover:bg-surface-muted"
      )}
    >
      <span className="block text-[12.5px] font-semibold">{titulo}</span>
      {nota ? <span className="mt-0.5 block text-[11px] text-ink-muted">{nota}</span> : null}
    </button>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-[12.5px] font-semibold text-ink">{label}</span>
      {children}
    </div>
  )
}

export function GenerarPiezaDialog({
  abierto,
  generando,
  canalInicial,
  onCerrar,
  onGenerar,
}: {
  abierto: boolean
  generando: boolean
  /** El canal de la pestaña desde la que se abrió: el caso más probable. */
  canalInicial: Canal
  onCerrar: () => void
  onGenerar: (cfg: ConfigPieza) => void
}) {
  const [canal, setCanal] = useState<Canal>(canalInicial)
  const [tema, setTema] = useState<TemaBanco>("oscuro")
  const [objetivo, setObjetivo] = useState<Objetivo | null>(null)
  const [audiencia, setAudiencia] = useState<Audiencia | null>(null)
  const [brief, setBrief] = useState("")
  const [imagen, setImagen] = useState("")

  if (!abierto) return null

  const puedeGenerar = brief.trim().length > 0 && !generando

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Generar publicación"
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={() => !generando && onCerrar()}
      />

      <div className="relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-6 fade-in-0 duration-250 sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
                Generar publicación
              </h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                Una pieza sobre lo que vos pidas — cae en el banco con las demás
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            disabled={generando}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {/* La descripción primero: es lo único que el modelo no puede inventar. */}
          <Campo label="Qué querés publicar">
            <Textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={4}
              placeholder="Ej: cerramos un proyecto de red multisucursal con un banco y quiero contarlo sin nombrar al cliente…"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EJEMPLOS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setBrief(e)}
                  className="rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                >
                  {e.length > 46 ? `${e.slice(0, 46)}…` : e}
                </button>
              ))}
            </div>
          </Campo>

          <Campo label="Plataforma">
            <div className="flex gap-2">
              {CANALES_BANCO.map((c) => (
                <Opcion
                  key={c}
                  activo={canal === c}
                  titulo={BANCO_LABEL[c]}
                  nota={BANCO_NOTA[c]}
                  onClick={() => setCanal(c)}
                />
              ))}
            </div>
          </Campo>

          <Campo label="Tipo de contenido">
            <div className="flex flex-wrap gap-2">
              <Opcion
                activo={objetivo === null}
                titulo="Sin preferencia"
                nota="Lo decide la IA"
                onClick={() => setObjetivo(null)}
              />
              {OBJETIVOS.map((o) => (
                <Opcion
                  key={o}
                  activo={objetivo === o}
                  titulo={OBJETIVO_LABEL[o]}
                  nota={OBJETIVO_DESC[o]}
                  onClick={() => setObjetivo(o)}
                />
              ))}
            </div>
          </Campo>

          <Campo label="Público">
            <div className="flex flex-wrap gap-2">
              <Opcion
                activo={audiencia === null}
                titulo="Sin preferencia"
                nota="Lo decide la IA"
                onClick={() => setAudiencia(null)}
              />
              {AUDIENCIAS_ELEGIBLES.map((a) => (
                <Opcion
                  key={a}
                  activo={audiencia === a}
                  titulo={AUDIENCIA_CORTA[a].titulo}
                  nota={AUDIENCIA_CORTA[a].nota}
                  onClick={() => setAudiencia(a)}
                />
              ))}
            </div>
          </Campo>

          <Campo label="Qué querés que se vea en la imagen">
            <Textarea
              value={imagen}
              onChange={(e) => setImagen(e.target.value)}
              rows={2}
              placeholder="Opcional. Ej: un rack de red abierto, cables ordenados, sin personas."
            />
          </Campo>

          <Campo label="Composición">
            <div className="flex gap-2">
              {TEMAS_BANCO.map((t) => (
                <Opcion
                  key={t}
                  activo={tema === t}
                  titulo={TEMA_LABEL[t]}
                  nota={TEMA_NOTA[t]}
                  onClick={() => setTema(t)}
                />
              ))}
            </div>
          </Campo>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 py-4 sm:px-6">
          <Button variant="ghost" size="sm" onClick={onCerrar} disabled={generando}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!puedeGenerar}
            onClick={() => onGenerar({ canal, tema, objetivo, audiencia, brief, imagen })}
          >
            {generando ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {generando ? "Generando…" : "Generar publicación"}
          </Button>
        </div>
      </div>
    </div>
  )
}
