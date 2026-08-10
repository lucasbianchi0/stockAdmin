"use client"

import { useState } from "react"
import { AlertTriangle, Check, ChevronDown, ImageOff, Loader2, Shapes } from "lucide-react"

import { cn } from "@/lib/utils"
import { TEMPLATES, templatePorId, type Densidad, type TemplatePieza } from "@/lib/templates-pieza"

/**
 * Qué formato tiene esta pieza.
 *
 * El template se decide al armar el plan y no al generar la imagen: es lo que
 * permite dibujar el feed antes de gastar una sola generación. Pero la propuesta
 * del sistema no puede ser una imposición — el que arma el plan sabe cosas que
 * el algoritmo no, como que esa semana hay fotos del evento.
 *
 * La miniatura es la última pieza generada con ese template. Un nombre como
 * "Mitad y mitad" no dice nada hasta que se ve una.
 */

const ETIQUETA_DENSIDAD: Record<Densidad, string> = {
  foto: "La foto manda",
  mixta: "Foto y texto",
  texto: "Solo texto",
}

const TONO_DENSIDAD: Record<Densidad, string> = {
  foto: "bg-success-soft text-success-text",
  mixta: "bg-brand-50 text-brand-700",
  texto: "bg-surface-muted text-ink-secondary",
}

export function SelectorTemplate({
  templateSlug,
  miniaturas,
  guardando,
  yaTieneImagen,
  onElegir,
}: {
  templateSlug: string | null
  /** Última pieza generada con cada template, para las miniaturas. */
  miniaturas: Record<string, string>
  guardando: boolean
  /**
   * La pieza ya tiene la imagen generada.
   *
   * No bloquea el cambio, avisa. Bloquearlo era un callejón sin salida: la
   * imagen vieja solo se arregla generando otra, y generar otra exige haber
   * cambiado el formato primero. Y no hay nada que mentir — el feed muestra la
   * imagen real cuando existe, así que la miniatura del template nuevo no
   * aparece en ningún lado hasta que se regenere.
   */
  yaTieneImagen?: boolean
  onElegir: (slug: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const actual = templatePorId(templateSlug)

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5 text-left transition-colors hover:border-brand-200 hover:bg-surface-subtle"
      >
        <Miniatura template={actual} url={actual ? miniaturas[actual.id] : undefined} />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11.5px] font-medium text-ink">
            {actual ? actual.nombre : "Sin formato asignado"}
          </span>
          <span className="block truncate text-[10px] text-ink-muted">
            {actual ? ETIQUETA_DENSIDAD[actual.densidad] : "Elegí uno para verlo en el feed"}
          </span>
        </span>

        {guardando ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-600" />
        ) : (
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform",
              abierto && "rotate-180"
            )}
          />
        )}
      </button>

      {yaTieneImagen && (
        <p className="mt-1 flex items-start gap-1 text-[10px] leading-tight text-warning-text">
          <AlertTriangle className="mt-px h-2.5 w-2.5 shrink-0" strokeWidth={2.5} />
          La imagen ya generada salió con el formato anterior. Si cambiás de formato, generala de
          nuevo.
        </p>
      )}

      {abierto && (
        <div className="mt-2 rounded-xl border border-line bg-surface-subtle p-2">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {TEMPLATES.map((t) => (
              <OpcionTemplate
                key={t.id}
                template={t}
                url={miniaturas[t.id]}
                activo={t.id === templateSlug}
                onElegir={() => {
                  onElegir(t.id)
                  setAbierto(false)
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function OpcionTemplate({
  template,
  url,
  activo,
  onElegir,
}: {
  template: TemplatePieza
  url?: string
  activo: boolean
  onElegir: () => void
}) {
  return (
    <button
      type="button"
      onClick={onElegir}
      title={template.cuandoUsar}
      className={cn(
        "flex items-center gap-2 rounded-lg border p-1.5 text-left transition-all",
        activo
          ? "border-brand-300 bg-brand-50 shadow-e1"
          : "border-line bg-surface hover:border-brand-200 hover:shadow-e1"
      )}
    >
      <Miniatura template={template} url={url} activo={activo} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-medium leading-tight text-ink">
          {template.nombre}
        </span>
        <span
          className={cn(
            "mt-0.5 inline-block rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide",
            TONO_DENSIDAD[template.densidad]
          )}
        >
          {ETIQUETA_DENSIDAD[template.densidad]}
        </span>
      </span>
      {activo && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" strokeWidth={3} />}
    </button>
  )
}

/**
 * La muestra del template.
 *
 * Si nunca se generó una pieza con él no hay nada que mostrar, y ahí va un
 * cartel y no un cuadro vacío: un hueco gris se lee como una imagen que no
 * cargó, y manda a buscar un bug que no existe.
 */
export function Miniatura({
  template,
  url,
  activo,
  className,
}: {
  template: TemplatePieza | null
  url?: string
  activo?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-surface-muted",
        activo ? "border-brand-300" : "border-line",
        className
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : template ? (
        <ImageOff className="h-3.5 w-3.5 text-ink-faint" strokeWidth={1.8} />
      ) : (
        <Shapes className="h-3.5 w-3.5 text-ink-faint" strokeWidth={1.8} />
      )}
    </span>
  )
}
