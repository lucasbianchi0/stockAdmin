"use client"

import { useEffect, useRef, useState } from "react"
import {
  Check,
  Copy,
  Eye,
  Hash,
  Loader2,
  MousePointerClick,
  RotateCcw,
  Sparkles,
  Type,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ImagenGenerada } from "@/components/contenido/imagen-generada"
import { VistaPrevia } from "@/components/contenido/vista-previa"
import { SelectorTemplate } from "@/components/contenido/selector-template"
import { promptDeImagen } from "@/lib/prompt-pieza"
import {
  CANAL_CORTO,
  CANAL_LABEL,
  type Canal,
  fechaLarga,
  type Contenido,
  type Slot,
} from "@/lib/calendario-context"

/**
 * Panel lateral de una pieza. Dos estados y una transición entre ellos:
 * elegir entre las 3 opciones, y ver el contenido generado.
 *
 * El contenido no reemplaza a las opciones: quedan arriba, colapsadas, con la
 * elegida marcada. Si desaparecieran, cambiar de idea obligaría a cerrar y
 * volver a entrar, y peor: no se vería que la decisión es reversible.
 */
export function PiezaPanel({
  slot,
  eligiendo,
  generando,
  imagen,
  miniaturas,
  guardandoTemplate,
  onImagen,
  onTemplate,
  onCerrar,
  onElegir,
  onGenerar,
}: {
  slot: Slot | null
  eligiendo: boolean
  generando: boolean
  /** La imagen vive en el calendario: el panel se cierra y ella tiene que
   *  seguir estando, tanto para volver a abrirlo como para la vista del feed. */
  imagen: string | null
  miniaturas: Record<string, string>
  guardandoTemplate: boolean
  onImagen: (slotId: string, dataUrl: string) => void
  onTemplate: (slotId: string, slug: string) => void
  onCerrar: () => void
  onElegir: (slotId: string, opcionId: string | null) => void
  onGenerar: (slotId: string, ajuste: string) => void
}) {
  const [ajuste, setAjuste] = useState("")
  const idAnterior = useRef<string | null>(null)

  // El ajuste es de la pieza, no del panel: si no se limpia al cambiar de slot,
  // el pedido de una se aplica a la siguiente sin que nadie lo note.
  useEffect(() => {
    if (slot && slot.id !== idAnterior.current) {
      idAnterior.current = slot.id
      setAjuste("")
    }
  }, [slot])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !generando && !eligiendo) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar, generando, eligiendo])

  if (!slot) return null

  const elegida = slot.opciones.find((o) => o.id === slot.elegida) ?? null
  const ocupado = eligiendo || generando

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-navy-950/45 backdrop-blur-[2px] animate-in fade-in-0 duration-200"
        onClick={() => !ocupado && onCerrar()}
      />

      <aside className="relative flex h-full w-full flex-col border-l border-line bg-surface shadow-e4 animate-in slide-in-from-right duration-250 sm:max-w-[560px]">
        {/* Cabecera */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge tone={slot.canal === "linkedin" ? "brand" : "neutral"} size="sm">
                {CANAL_CORTO[slot.canal]}
              </Badge>
              <span className="text-[11.5px] text-ink-muted">{fechaLarga(slot.fecha)}</span>
            </div>
            <h2 className="mt-1.5 text-[15px] font-semibold tracking-[-0.015em] text-ink">
              {elegida?.titulo ?? "Elegí una de las tres"}
            </h2>
            {slot.beat && (
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">{slot.beat}</p>
            )}
          </div>
          <button
            onClick={onCerrar}
            disabled={ocupado}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="space-y-5">
            {/* El formato de la pieza. Va arriba porque condiciona todo lo de
                abajo: la receta del template es la que arma el prompt final. */}
            <section>
              <p className="eyebrow mb-2">Formato de la pieza</p>
              <SelectorTemplate
                templateSlug={slot.templateSlug}
                miniaturas={miniaturas}
                guardando={guardandoTemplate}
                yaTieneImagen={Boolean(slot.imagenPath)}
                onElegir={(slug) => onTemplate(slot.id, slug)}
              />
            </section>

            <section>
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <p className="eyebrow">
                  {slot.contenido ? "Opción elegida" : `${slot.opciones.length} opciones`}
                </p>
                {slot.elegida && (
                  <button
                    onClick={() => onElegir(slot.id, null)}
                    disabled={ocupado}
                    className="text-[11px] font-medium text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
                  >
                    Cambiar de opción
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {slot.opciones.map((o, i) => {
                  const activa = slot.elegida === o.id
                  // Con contenido ya generado sólo se muestra la elegida: las
                  // otras dos ya no son alternativas, son ruido.
                  if (slot.contenido && !activa) return null

                  return (
                    <button
                      key={o.id}
                      onClick={() => !activa && onElegir(slot.id, o.id)}
                      disabled={ocupado || activa}
                      className={cn(
                        "flex w-full gap-3 rounded-xl border p-3.5 text-left transition-all duration-150",
                        activa
                          ? "border-brand-300 bg-brand-50 shadow-e1"
                          : "border-line bg-surface hover:-translate-y-px hover:border-brand-200 hover:shadow-e1",
                        ocupado && !activa && "opacity-60"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold uppercase",
                          activa
                            ? "bg-brand-600 text-white"
                            : "bg-surface-muted text-ink-muted"
                        )}
                      >
                        {activa ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : o.id || i + 1}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink">
                            {o.titulo}
                          </span>
                          <Badge tone="neutral" size="sm" className="shrink-0 capitalize">
                            {o.formato}
                          </Badge>
                        </span>
                        {o.hook && (
                          <span className="mt-1 block text-[12px] italic leading-relaxed text-ink-secondary">
                            “{o.hook}”
                          </span>
                        )}
                        {/* De qué trata y qué se ve, separados. Elegir entre
                            tres títulos a ciegas es media decisión: la otra
                            mitad de una publicación es la pieza visual. */}
                        {(o.angulo || o.imagen) && (
                          <span className="mt-2.5 block space-y-1.5 border-t border-line pt-2.5">
                            {o.angulo && (
                              <span className="block">
                                <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-faint">
                                  El posteo
                                </span>
                                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-muted">
                                  {o.angulo}
                                </span>
                              </span>
                            )}
                            {o.imagen && (
                              <span className="block">
                                <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-faint">
                                  La imagen
                                </span>
                                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-muted">
                                  {o.imagen}
                                </span>
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Generar / regenerar */}
            {elegida && (
              <section className="rounded-xl border border-line bg-surface-subtle p-4">
                <label htmlFor="ajuste" className="text-[12px] font-semibold text-ink">
                  {slot.contenido ? "Volver a generar con un ajuste" : "Algún ajuste antes de generar"}
                  <span className="ml-1 font-normal text-ink-muted">(opcional)</span>
                </label>
                <div className="mt-2 flex gap-2">
                  <Input
                    id="ajuste"
                    value={ajuste}
                    onChange={(e) => setAjuste(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !ocupado) onGenerar(slot.id, ajuste)
                    }}
                    placeholder="Ej: mencioná el caso de Andreani…"
                    disabled={ocupado}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => onGenerar(slot.id, ajuste)}
                    disabled={ocupado}
                    className="shrink-0"
                  >
                    {generando ? (
                      <Loader2 className="animate-spin" />
                    ) : slot.contenido ? (
                      <RotateCcw />
                    ) : (
                      <Sparkles />
                    )}
                    {slot.contenido ? "Regenerar" : "Generar contenido"}
                  </Button>
                </div>
              </section>
            )}

            {/* Contenido */}
            {generando && !slot.contenido && <EsqueletoContenido />}

            {slot.contenido && (
              <ContenidoGenerado
                contenido={slot.contenido}
                canal={CANAL_LABEL[slot.canal]}
                canalId={slot.canal}
                imagen={imagen}
                promptImagen={promptDeImagen(slot)}
                onImagen={(dataUrl) => onImagen(slot.id, dataUrl)}
              />
            )}

            {!elegida && !generando && (
              <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-line-strong bg-surface-subtle px-6 py-10 text-center">
                <MousePointerClick className="h-5 w-5 text-ink-faint" strokeWidth={1.8} />
                <p className="text-[12.5px] font-medium text-ink">Elegí una de las tres opciones</p>
                <p className="max-w-xs text-[11.5px] leading-relaxed text-ink-muted">
                  Recién ahí se genera el texto completo, los hashtags y el prompt de la imagen.
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

/* ── Contenido generado ───────────────────────────────────────────────────── */

function ContenidoGenerado({
  contenido,
  canal,
  canalId,
  imagen,
  promptImagen,
  onImagen,
}: {
  contenido: Contenido
  canal: string
  canalId: Canal
  imagen: string | null
  /**
   * El prompt real con el que se va a generar. Sale de la receta del template
   * cuando la pieza tiene uno asignado, y del texto libre del modelo cuando no
   * —los planes viejos—. Se pasa desde arriba y no se arma acá para que sea el
   * MISMO que usa la generación en lote: dos formas de armarlo son dos piezas
   * distintas saliendo del mismo botón.
   */
  promptImagen: string
  onImagen: (dataUrl: string) => void
}) {
  const [previa, setPrevia] = useState(false)

  const todo = [
    contenido.caption,
    contenido.cta,
    contenido.hashtags,
  ]
    .filter(Boolean)
    .join("\n\n")

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">Listo para publicar en {canal}</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setPrevia(true)}>
            <Eye />
            Ver cómo queda
          </Button>
          <BotonCopiar texto={todo} label="Copiar todo" variante="solido" />
        </div>
      </div>

      <Bloque
        icono={Type}
        titulo="Texto de la publicación"
        texto={contenido.caption}
        multilinea
      />
      {contenido.captionCorto && (
        <Bloque icono={Type} titulo="Versión corta (story / anuncio)" texto={contenido.captionCorto} multilinea />
      )}
      {contenido.cta && <Bloque icono={MousePointerClick} titulo="Call to action" texto={contenido.cta} />}
      {contenido.hashtags && <Bloque icono={Hash} titulo="Hashtags" texto={contenido.hashtags} />}
      {promptImagen && (
        <ImagenGenerada prompt={promptImagen} imagen={imagen} onImagen={onImagen} />
      )}

      {previa && (
        <VistaPrevia
          canal={canalId}
          contenido={contenido}
          imagen={imagen}
          onCerrar={() => setPrevia(false)}
        />
      )}
    </section>
  )
}

function Bloque({
  icono: Icono,
  titulo,
  texto,
  multilinea,
  mono,
  nota,
}: {
  icono: typeof Type
  titulo: string
  texto: string
  multilinea?: boolean
  mono?: boolean
  nota?: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-subtle px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Icono className="h-3.5 w-3.5 shrink-0 text-ink-faint" strokeWidth={2} />
          <p className="truncate text-[11.5px] font-semibold text-ink-secondary">{titulo}</p>
        </div>
        <BotonCopiar texto={texto} label="Copiar" />
      </div>
      <p
        className={cn(
          "px-4 py-3 text-[12.5px] leading-[1.7] text-ink",
          multilinea && "whitespace-pre-wrap",
          mono && "font-mono text-[11.5px] leading-relaxed text-ink-secondary"
        )}
      >
        {texto}
      </p>
      {nota && (
        <p className="border-t border-line-soft px-4 py-2 text-[10.5px] text-ink-muted">{nota}</p>
      )}
    </div>
  )
}

function BotonCopiar({
  texto,
  label,
  variante,
}: {
  texto: string
  label: string
  variante?: "solido"
}) {
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  return (
    <Button
      variant={variante === "solido" ? "default" : "ghost"}
      size="xs"
      onClick={copiar}
      className="shrink-0"
    >
      {copiado ? <Check /> : <Copy />}
      {copiado ? "Copiado" : label}
    </Button>
  )
}

function EsqueletoContenido() {
  return (
    <section className="space-y-3">
      {[3, 2, 1].map((lineas, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="border-b border-line bg-surface-subtle px-4 py-2.5">
            <div className="h-2.5 w-32 animate-pulse rounded bg-n-200" />
          </div>
          <div className="space-y-2 px-4 py-3.5">
            {Array.from({ length: lineas }).map((_, j) => (
              <div
                key={j}
                className="h-2.5 animate-pulse rounded bg-n-150"
                style={{ width: `${100 - j * 14}%` }}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
