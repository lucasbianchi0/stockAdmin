"use client"

import { useEffect, useState } from "react"
import { CalendarDays, Loader2, Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  AUDIENCIAS,
  AUDIENCIA_LABEL,
  CANALES,
  CANAL_LABEL,
  CONTEXTO_MAX_LEN,
  DIAS_PLAN,
  POSTS_POR_CANAL,
  fechaLarga,
  hoyISO,
  sumarDias,
  type Audiencia,
  type Canal,
} from "@/lib/calendario-context"

export type ConfigPlan = {
  fechaInicio: string
  canales: Canal[]
  audiencia: Audiencia
  contexto: string
}

/**
 * El diálogo de planificación. El campo que importa es el de contexto: es donde
 * el usuario mete lo que el modelo no puede saber —un aniversario, una feria, un
 * lanzamiento— y es lo que separa un plan útil de quince posts genéricos. Por eso
 * va primero, ocupa el doble que el resto y tiene ejemplos a un click.
 */
const EJEMPLOS = [
  "El 12 cumplimos 18 años como empresa, quiero que sea el eje de la semana.",
  "Arrancamos a comunicar firma biométrica para estudios jurídicos.",
  "Estuvimos en una feria del sector, tenemos fotos del stand y del equipo.",
  "Cerramos un proyecto grande de red multisucursal con un banco.",
]

export function PlanearDialog({
  abierto,
  generando,
  onCerrar,
  onGenerar,
}: {
  abierto: boolean
  generando: boolean
  onCerrar: () => void
  onGenerar: (cfg: ConfigPlan) => void
}) {
  const [fechaInicio, setFechaInicio] = useState(hoyISO)
  const [canales, setCanales] = useState<Canal[]>([...CANALES])
  const [audiencia, setAudiencia] = useState<Audiencia>("todos")
  const [contexto, setContexto] = useState("")

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !generando) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar, generando])

  if (!abierto) return null

  const toggleCanal = (c: Canal) =>
    setCanales((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))

  const totalPosts = canales.reduce((a, c) => a + POSTS_POR_CANAL[c], 0)
  const fechaFin = sumarDias(fechaInicio, DIAS_PLAN - 1)
  const puedeGenerar = canales.length > 0 && !generando

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Planear 15 días"
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={() => !generando && onCerrar()}
      />

      <div className="relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-6 fade-in-0 duration-250 sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <CalendarDays className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
                Planear {DIAS_PLAN} días
              </h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                {fechaLarga(fechaInicio)} → {fechaLarga(fechaFin)} · {totalPosts} publicaciones
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
          {/* Contexto — el campo importante */}
          <div>
            <label
              htmlFor="contexto"
              className="text-[12.5px] font-semibold text-ink"
            >
              ¿Hay algo puntual que el plan tenga que tener en cuenta?
            </label>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
              Una fecha importante, un lanzamiento, un proyecto que cerraron. Es lo único que la
              IA no puede saber sola, y es lo que hace que el plan sea de Accedra y no de
              cualquier empresa de IT.
            </p>
            <Textarea
              id="contexto"
              value={contexto}
              onChange={(e) => setContexto(e.target.value.slice(0, CONTEXTO_MAX_LEN))}
              placeholder="Ej: el 12 cumplimos 18 años y quiero que sea el eje de esa semana…"
              className="mt-2.5 min-h-[92px]"
              disabled={generando}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EJEMPLOS.map((e) => (
                <button
                  key={e}
                  type="button"
                  disabled={generando}
                  onClick={() => setContexto(e)}
                  className="rounded-full border border-line bg-surface-subtle px-2.5 py-1 text-[10.5px] text-ink-muted transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
                >
                  {e.length > 46 ? `${e.slice(0, 46)}…` : e}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-right font-mono text-[10px] text-ink-faint">
              {contexto.length} / {CONTEXTO_MAX_LEN}
            </p>
          </div>

          {/* Canales */}
          <div>
            <p className="text-[12.5px] font-semibold text-ink">Dónde se publica</p>
            <div className="mt-2.5 space-y-2">
              {CANALES.map((c) => {
                const activo = canales.includes(c)
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={generando}
                    onClick={() => toggleCanal(c)}
                    aria-pressed={activo}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors disabled:opacity-60",
                      activo
                        ? "border-brand-300 bg-brand-50"
                        : "border-line bg-surface hover:border-line-strong hover:bg-surface-subtle"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        activo ? "border-brand-600 bg-brand-600" : "border-line-strong bg-surface"
                      )}
                    >
                      {activo && (
                        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white" fill="none">
                          <path
                            d="M2 6.2l2.6 2.6L10 3.4"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-medium text-ink">
                        {CANAL_LABEL[c]}
                      </span>
                      <span className="block text-[11px] text-ink-muted">
                        {POSTS_POR_CANAL[c]} publicaciones en {DIAS_PLAN} días
                        {c === "meta" && " · la misma pieza en los dos"}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            {canales.length === 0 && (
              <p className="mt-2 text-[11.5px] font-medium text-danger-text">
                Elegí al menos un canal.
              </p>
            )}
          </div>

          {/* Fecha y audiencia */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="desde" className="text-[12.5px] font-semibold text-ink">
                Arranca el
              </label>
              <Input
                id="desde"
                type="date"
                value={fechaInicio}
                min={hoyISO()}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="mt-2"
                disabled={generando}
              />
            </div>
            <div>
              <label htmlFor="audiencia" className="text-[12.5px] font-semibold text-ink">
                Audiencia
              </label>
              <select
                id="audiencia"
                value={audiencia}
                onChange={(e) => setAudiencia(e.target.value as Audiencia)}
                disabled={generando}
                className="mt-2 h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-ink transition-colors hover:border-n-400 focus:outline-none disabled:opacity-60"
              >
                {AUDIENCIAS.map((a) => (
                  <option key={a} value={a}>
                    {AUDIENCIA_LABEL[a]}
                  </option>
                ))}
              </select>
            </div>
          </div>

        </div>

        <div className="shrink-0 rounded-b-2xl border-t border-line bg-surface-subtle px-5 py-4 sm:px-6">
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              size="lg"
              onClick={onCerrar}
              disabled={generando}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              size="lg"
              className="flex-1"
              disabled={!puedeGenerar}
              onClick={() => onGenerar({ fechaInicio, canales, audiencia, contexto })}
            >
              {generando ? (
                <>
                  <Loader2 className="animate-spin" />
                  Armando el plan…
                </>
              ) : (
                <>
                  <Sparkles />
                  Generar plan
                </>
              )}
            </Button>
          </div>
          {generando && (
            <p className="mt-2.5 text-center text-[11px] text-ink-muted">
              Puede tardar hasta un minuto: son {totalPosts} publicaciones, con la idea recomendada de cada una.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
