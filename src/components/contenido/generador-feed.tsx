"use client"

import { useEffect, useState } from "react"
import { LayoutTemplate } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Campo, Modal } from "@/components/contenido/generador-ui"
import { FAMILIA_LABEL, TEMPLATES_FEED, type FamiliaFeed, type TemplateFeed } from "@/lib/templates-feed"
import { cn } from "@/lib/utils"

/**
 * Los templates del generador de imágenes son los del banco: los quince del
 * sistema del feed. Se elige uno, se escribe el texto y la pieza sale por el
 * mismo camino que el banco (fondo generado o foto propia + texto compuesto).
 */

/** Lo que la persona escribe para la pieza. Es un recorte de `VariablesFeed`. */
export type TextoFeed = {
  titular: string
  destacado: string
  rotulo: string
  bajada: string
  items: string
  fecha: string
  lugar: string
  codigo: string
  cta: string
}

export const TEXTO_FEED_VACIO: TextoFeed = {
  titular: "",
  destacado: "",
  rotulo: "",
  bajada: "",
  items: "",
  fecha: "",
  lugar: "",
  codigo: "",
  cta: "",
}

/** Lo que entiende `normalizarVariables` en el servidor. */
export function aVariables(t: TextoFeed) {
  const lineas = (s: string) =>
    s
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
  return {
    headline: lineas(t.titular),
    destacado: t.destacado.trim(),
    category: t.rotulo.trim().toUpperCase(),
    bajada: t.bajada.trim(),
    servicios: lineas(t.items),
    fecha: t.fecha.trim(),
    lugar: t.lugar.trim(),
    codigo: t.codigo.trim(),
    cta: t.cta.trim(),
  }
}

/** Al revés: las variables guardadas en el historial, de vuelta al formulario. */
export function deVariables(v: Record<string, unknown> | undefined): TextoFeed {
  const s = (x: unknown) => (typeof x === "string" ? x : "")
  const l = (x: unknown) => (Array.isArray(x) ? x.filter((i) => typeof i === "string").join("\n") : "")
  if (!v) return TEXTO_FEED_VACIO
  return {
    titular: l(v.headline),
    destacado: s(v.destacado),
    rotulo: s(v.category),
    bajada: s(v.bajada),
    items: l(v.servicios) || l(v.features),
    fecha: s(v.fecha),
    lugar: s(v.lugar),
    codigo: s(v.codigo),
    cta: s(v.cta),
  }
}

const GRADIENTE: Record<FamiliaFeed, string> = {
  tecnologia: "from-navy-950 via-navy-900 to-brand-700",
  "foto-real": "from-n-700 via-n-600 to-n-400",
  editorial: "from-navy-950 to-navy-800",
}

/** La muestra de un template: la última pieza real, o un placeholder con su número. */
export function MuestraTemplate({
  template,
  url,
  className,
}: {
  template: TemplateFeed
  url?: string
  className?: string
}) {
  return (
    <div className={cn("relative overflow-hidden bg-gradient-to-br", GRADIENTE[template.familia], className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={template.nombre} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col justify-end p-3">
          <span className="text-[28px] font-semibold leading-none text-white/25 tabular-nums">
            {String(template.numero).padStart(2, "0")}
          </span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-brand-300">
            {template.rubro}
          </span>
        </div>
      )}
    </div>
  )
}

/** Carga una vez las muestras de la galería. */
export function useMuestras() {
  const [muestras, setMuestras] = useState<Record<string, string>>({})
  useEffect(() => {
    fetch("/api/contenido/generador/feed")
      .then((r) => (r.ok ? r.json() : { muestras: {} }))
      .then((d) => setMuestras(d.muestras ?? {}))
      .catch(() => {})
  }, [])
  return muestras
}

export function GaleriaFeed({
  abierta,
  muestras,
  elegido,
  onElegir,
  onCerrar,
}: {
  abierta: boolean
  muestras: Record<string, string>
  elegido: string | null
  onElegir: (t: TemplateFeed) => void
  onCerrar: () => void
}) {
  const [familia, setFamilia] = useState<FamiliaFeed | "">("")
  const visibles = TEMPLATES_FEED.filter((t) => !familia || t.familia === familia)

  return (
    <Modal
      abierto={abierta}
      titulo="Templates del feed"
      descripcion="Los mismos del banco de piezas. Elegí uno, escribí el texto y la pieza sale con el sistema visual de Accedra."
      onCerrar={onCerrar}
      ancho="max-w-6xl"
    >
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(["", "foto-real", "tecnologia", "editorial"] as const).map((f) => (
          <button
            key={f || "todos"}
            type="button"
            onClick={() => setFamilia(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
              familia === f
                ? "border-brand-400 bg-brand-50 text-brand-700"
                : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
            )}
          >
            {f ? FAMILIA_LABEL[f] : "Todos"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {visibles.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onElegir(t)}
            className={cn(
              "group overflow-hidden rounded-xl border bg-surface text-left shadow-e1 transition-[box-shadow,border-color] hover:shadow-e2",
              elegido === t.id ? "border-brand-400 ring-2 ring-brand-200" : "border-line"
            )}
          >
            <MuestraTemplate template={t} url={muestras[t.id]} className="aspect-square" />
            <div className="space-y-1 p-2.5">
              <div className="flex items-start justify-between gap-1.5">
                <span className="text-[12.5px] font-semibold leading-snug text-ink">
                  <span className="text-ink-faint tabular-nums">{t.numero}.</span> {t.nombre}
                </span>
              </div>
              <Badge size="sm" tone={t.familia === "tecnologia" ? "brand" : "neutral"}>
                {FAMILIA_LABEL[t.familia]}
              </Badge>
              <p className="line-clamp-3 text-[11px] leading-snug text-ink-muted">{t.cuandoUsar}</p>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  )
}

/** El texto de la pieza. Los campos dependen de lo que el template sabe mostrar. */
export function CamposFeed({
  template,
  valor,
  onCambio,
}: {
  template: TemplateFeed
  valor: TextoFeed
  onCambio: (t: TextoFeed) => void
}) {
  const set = (k: keyof TextoFeed) => (e: { target: { value: string } }) => onCambio({ ...valor, [k]: e.target.value })
  const esEvento = template.pide.includes("evento")
  const pideLista = template.pide.includes("servicios") || template.pide.includes("features")

  return (
    <div className="space-y-3">
      <Campo etiqueta="Titular" ayuda="Cada renglón es una línea">
        <Textarea
          rows={3}
          value={valor.titular}
          onChange={set("titular")}
          placeholder={"Firmá desde cualquier\nsucursal, con validez legal"}
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Palabras en azul" ayuda="Opcional">
          <Input value={valor.destacado} onChange={set("destacado")} placeholder="validez legal" />
        </Campo>
        <Campo etiqueta="Rótulo" ayuda="Opcional">
          <Input value={valor.rotulo} onChange={set("rotulo")} placeholder={template.rubro} />
        </Campo>
      </div>

      {esEvento ? (
        <div className="grid grid-cols-3 gap-2">
          <Campo etiqueta="Fecha">
            <Input value={valor.fecha} onChange={set("fecha")} placeholder="20 de octubre" />
          </Campo>
          <Campo etiqueta="Lugar">
            <Input value={valor.lugar} onChange={set("lugar")} placeholder="La Rural" />
          </Campo>
          <Campo etiqueta="Stand / sala">
            <Input value={valor.codigo} onChange={set("codigo")} placeholder="Stand 214" />
          </Campo>
        </div>
      ) : (
        <>
          <Campo etiqueta="Ítems" ayuda={pideLista ? "Uno por renglón" : "Opcional · uno por renglón"}>
            <Textarea
              rows={3}
              value={valor.items}
              onChange={set("items")}
              placeholder={"Firma biométrica\nValidez legal\nSin papel"}
            />
          </Campo>
          <Campo etiqueta="Bajada" ayuda={valor.items.trim() ? "No se muestra si hay ítems" : "Opcional"}>
            <Textarea
              rows={2}
              value={valor.bajada}
              onChange={set("bajada")}
              disabled={Boolean(valor.items.trim())}
              placeholder="Una o dos frases que desarrollan el titular."
            />
          </Campo>
        </>
      )}

      <Campo etiqueta="Llamado a la acción" ayuda="Opcional">
        <Input value={valor.cta} onChange={set("cta")} placeholder="accedra.com.ar" />
      </Campo>
    </div>
  )
}

/** El chip del template elegido, arriba del panel. */
export function TemplateElegido({
  template,
  muestra,
  onCambiar,
  onQuitar,
}: {
  template: TemplateFeed
  muestra?: string
  onCambiar: () => void
  onQuitar: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 p-2.5">
      <MuestraTemplate template={template} url={muestra} className="h-12 w-12 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-semibold text-ink">
          {template.numero}. {template.nombre}
        </p>
        <p className="text-[11.5px] text-ink-muted">{FAMILIA_LABEL[template.familia]}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <button type="button" onClick={onCambiar} className="text-[11.5px] font-medium text-brand-700 hover:underline">
          Cambiar
        </button>
        <button type="button" onClick={onQuitar} className="text-[11.5px] text-ink-muted hover:text-ink">
          Quitar
        </button>
      </div>
    </div>
  )
}

export function BotonTemplates({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-dashed border-line-strong p-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
        <LayoutTemplate className="h-4 w-4" />
      </span>
      <span>
        <span className="block text-[12.5px] font-semibold text-ink">Usar un template del feed</span>
        <span className="block text-[11.5px] text-ink-muted">Los 15 del banco: texto compuesto y logo oficial.</span>
      </span>
    </button>
  )
}
