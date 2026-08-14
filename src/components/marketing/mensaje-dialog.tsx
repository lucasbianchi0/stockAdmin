"use client"

import { useEffect, useMemo, useState } from "react"
import { Braces, Loader2, PenLine, Plus, X } from "lucide-react"

import { CanalIcono } from "@/components/marketing/canal-icono"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  BORRADOR_VACIO,
  CANALES,
  CANAL_LABEL,
  CIRCUNSTANCIAS,
  CIRCUNSTANCIA_LABEL,
  CIRCUNSTANCIA_PISTA,
  LIMITES,
  faltantesDe,
  llevaAsunto,
  normalizarEtiquetas,
  variablesDe,
  type BorradorMensaje,
  type MensajePlantilla,
  type Yo,
} from "@/lib/marketing/mensajes"
import { cn } from "@/lib/utils"

/**
 * Alta y edición de una plantilla.
 *
 * Tres decisiones gobiernan el formulario:
 *
 *  1. **Dos campos obligatorios y nada más**: el título y el mensaje. Todo lo
 *     demás —cuándo usarla, las etiquetas, el asunto— mejora la plantilla pero
 *     no puede impedir que se guarde. Una plantilla a medias guardada es
 *     infinitamente mejor que una perfecta que quedó en el portapapeles.
 *
 *  2. **La circunstancia se elige antes que el texto.** Está arriba de todo
 *     porque es la pregunta que ordena a las demás: el mismo contenido se
 *     escribe distinto si es un primer contacto que si es un reclamo de pago.
 *
 *  3. **Las variables se muestran mientras se escribe.** El `{{nombre}}` es una
 *     convención invisible: si el formulario no la señalara, la mitad de las
 *     plantillas se cargarían con el nombre de un cliente puntual adentro y
 *     serían inservibles para el siguiente.
 */
export function MensajeDialog({
  abierto,
  mensaje,
  yo,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean
  /** `null` = alta. Con plantilla = edición. */
  mensaje: MensajePlantilla | null
  yo: Yo
  onCerrar: () => void
  onGuardado: (m: MensajePlantilla, esNuevo: boolean) => void
}) {
  const [f, setF] = useState<BorradorMensaje>(BORRADOR_VACIO)
  const [etiquetaNueva, setEtiquetaNueva] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editando = mensaje !== null

  // Al abrir se rearma el borrador desde cero. Sin esto, cerrar una edición y
  // abrir un alta muestra el texto de la anterior.
  useEffect(() => {
    if (!abierto) return
    setError(null)
    setEtiquetaNueva("")
    setF(
      mensaje
        ? {
            titulo: mensaje.titulo,
            circunstancia: mensaje.circunstancia,
            canal: mensaje.canal,
            asunto: mensaje.asunto ?? "",
            cuerpo: mensaje.cuerpo,
            cuandoUsar: mensaje.cuandoUsar ?? "",
            etiquetas: mensaje.etiquetas,
          }
        : BORRADOR_VACIO
    )
  }, [abierto, mensaje])

  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !guardando) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [abierto, guardando, onCerrar])

  const variables = useMemo(() => variablesDe(f.cuerpo, f.asunto), [f.cuerpo, f.asunto])
  const faltantes = faltantesDe(f)

  function set<K extends keyof BorradorMensaje>(k: K, v: BorradorMensaje[K]) {
    setF((prev) => ({ ...prev, [k]: v }))
  }

  function agregarEtiqueta(bruta: string) {
    const [limpia] = normalizarEtiquetas([bruta])
    setEtiquetaNueva("")
    if (!limpia || f.etiquetas.includes(limpia)) return
    if (f.etiquetas.length >= LIMITES.etiquetas) return
    set("etiquetas", [...f.etiquetas, limpia])
  }

  async function guardar() {
    if (faltantes.length > 0) {
      setError(`Falta ${faltantes.join(" y ")}.`)
      return
    }

    setGuardando(true)
    setError(null)

    try {
      const url = editando ? `/api/marketing/mensajes/${mensaje.id}` : "/api/marketing/mensajes"
      const r = await fetch(url, {
        method: editando ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(f),
      })

      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar")

      onGuardado(d.mensaje as MensajePlantilla, !editando)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  if (!abierto) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editando ? "Editar plantilla" : "Nueva plantilla"}
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={() => !guardando && onCerrar()}
      />

      <div className="relative flex max-h-[94vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-6 fade-in-0 duration-250 sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl">
        {/* Cabecera */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <PenLine className="h-[17px] w-[17px]" strokeWidth={1.9} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
                {editando ? "Editar plantilla" : "Nueva plantilla"}
              </h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                {editando ? (
                  <>
                    Sigue firmada por {mensaje.autorNombre}
                    {mensaje.autorId !== yo.id && " — tu nombre queda como último editor"}
                  </>
                ) : (
                  <>Va a quedar a nombre de {yo.nombre}</>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            disabled={guardando}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          {/* Circunstancia — primero: cambia cómo se escribe todo lo demás */}
          <section>
            <Rotulo>¿Para qué momento es?</Rotulo>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CIRCUNSTANCIAS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={guardando}
                  onClick={() => set("circunstancia", c)}
                  aria-pressed={f.circunstancia === c}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-60",
                    f.circunstancia === c
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-line bg-surface text-ink-secondary hover:border-line-strong hover:bg-surface-subtle"
                  )}
                >
                  {CIRCUNSTANCIA_LABEL[c]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-ink-muted">
              {CIRCUNSTANCIA_PISTA[f.circunstancia]}
            </p>
          </section>

          {/* Canal */}
          <section>
            <Rotulo>¿Por dónde se manda?</Rotulo>
            <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {CANALES.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={guardando}
                  onClick={() => set("canal", c)}
                  aria-pressed={f.canal === c}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-[11.5px] font-medium transition-colors disabled:opacity-60",
                    f.canal === c
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-line bg-surface text-ink-secondary hover:border-line-strong hover:bg-surface-subtle"
                  )}
                >
                  <CanalIcono canal={c} />
                  {CANAL_LABEL[c]}
                </button>
              ))}
            </div>
          </section>

          <div className="h-px bg-line" />

          <Campo id="titulo" rotulo="Título">
            <Input
              id="titulo"
              value={f.titulo}
              maxLength={LIMITES.titulo}
              disabled={guardando}
              placeholder="Recordatorio de factura próxima a vencer"
              onChange={(e) => set("titulo", e.target.value)}
            />
            <Ayuda>
              Cómo la vas a buscar dentro de seis meses. Describí la situación, no el
              texto: “Reclamo de pago” se encuentra, “Mensaje 3” no.
            </Ayuda>
          </Campo>

          {llevaAsunto(f.canal) && (
            <Campo id="asunto" rotulo="Asunto del mail" opcional>
              <Input
                id="asunto"
                value={f.asunto}
                maxLength={LIMITES.asunto}
                disabled={guardando}
                placeholder="Factura {{numero_factura}} — vence el {{fecha_vencimiento}}"
                onChange={(e) => set("asunto", e.target.value)}
              />
            </Campo>
          )}

          <Campo id="cuerpo" rotulo="El mensaje">
            <Textarea
              id="cuerpo"
              value={f.cuerpo}
              maxLength={LIMITES.cuerpo}
              disabled={guardando}
              rows={10}
              placeholder={
                "Hola {{nombre}}, ¿cómo estás?\n\nTe escribo por…"
              }
              onChange={(e) => set("cuerpo", e.target.value)}
              className="min-h-[220px] leading-[1.7]"
            />
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
                <Braces className="h-3.5 w-3.5 text-ink-faint" strokeWidth={2} />
                Escribí <code className="rounded bg-surface-muted px-1 py-px font-mono text-[10.5px] text-ink-secondary">{"{{nombre}}"}</code> donde vaya un dato de cada cliente
              </span>
              {variables.length > 0 && (
                <span className="flex flex-wrap items-center gap-1">
                  {variables.map((v) => (
                    <span
                      key={v}
                      className="rounded-md border border-brand-200 bg-brand-50 px-1.5 py-0.5 font-mono text-[10.5px] text-brand-700"
                    >
                      {v}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </Campo>

          <Campo id="cuandoUsar" rotulo="Cuándo usar esta y no otra" opcional>
            <Textarea
              id="cuandoUsar"
              value={f.cuandoUsar}
              maxLength={LIMITES.cuandoUsar}
              disabled={guardando}
              rows={3}
              placeholder="Tres días antes del vencimiento, no después: un recordatorio previo es un servicio, el mismo texto mandado tarde es un reclamo."
              onChange={(e) => set("cuandoUsar", e.target.value)}
            />
            <Ayuda>
              Es lo que permite elegir sin leer las seis plantillas enteras. Si sabés por
              qué esta funciona, escribilo acá.
            </Ayuda>
          </Campo>

          <Campo id="etiqueta" rotulo="Etiquetas" opcional>
            {f.etiquetas.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {f.etiquetas.map((e) => (
                  <span
                    key={e}
                    className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-muted py-1 pl-2 pr-1 text-[11.5px] text-ink-secondary"
                  >
                    {e}
                    <button
                      type="button"
                      disabled={guardando}
                      onClick={() => set("etiquetas", f.etiquetas.filter((x) => x !== e))}
                      aria-label={`Quitar ${e}`}
                      className="rounded p-0.5 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                id="etiqueta"
                value={etiquetaNueva}
                maxLength={LIMITES.etiqueta}
                disabled={guardando || f.etiquetas.length >= LIMITES.etiquetas}
                placeholder={
                  f.etiquetas.length >= LIMITES.etiquetas
                    ? `Máximo ${LIMITES.etiquetas} etiquetas`
                    : "cobranza, mail, urgente…"
                }
                onChange={(e) => setEtiquetaNueva(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault()
                    agregarEtiqueta(etiquetaNueva)
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={guardando || !etiquetaNueva.trim()}
                onClick={() => agregarEtiqueta(etiquetaNueva)}
              >
                <Plus />
                Agregar
              </Button>
            </div>
          </Campo>
        </div>

        {/* Pie */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          <p className="min-w-0 text-[11.5px] leading-snug text-danger-text">{error}</p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando || faltantes.length > 0}>
              {guardando && <Loader2 className="animate-spin" />}
              {editando ? "Guardar cambios" : "Crear plantilla"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Piezas del formulario ────────────────────────────────────────────────── */

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow">{children}</p>
}

/**
 * Al revés que de costumbre: se marca lo opcional en gris en vez de lo
 * obligatorio con asterisco. Con dos campos requeridos de seis, el asterisco
 * solitario no se ve — el "opcional" sí.
 */
function Campo({
  id,
  rotulo,
  opcional,
  children,
}: {
  id: string
  rotulo: string
  opcional?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline gap-2">
        <span className="eyebrow">{rotulo}</span>
        {opcional && <span className="text-[10.5px] text-ink-faint">opcional</span>}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Ayuda({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-muted">{children}</p>
}
