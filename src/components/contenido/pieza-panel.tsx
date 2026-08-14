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
  Target,
  Type,
  Users,
  Wand2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ImagenGenerada } from "@/components/contenido/imagen-generada"
import { VistaPrevia } from "@/components/contenido/vista-previa"
import {
  pedirPromptFeed,
  proporcionDe,
  SISTEMA_LABEL,
  type SistemaVisual,
} from "@/lib/sistema-visual"
import { templateFeedPorId } from "@/lib/templates-feed"
import {
  AUDIENCIAS,
  AUDIENCIA_CORTO,
  AUDIENCIA_LABEL,
  CANAL_CORTO,
  CANAL_LABEL,
  OBJETIVOS,
  OBJETIVO_DESC,
  OBJETIVO_LABEL,
  fechaLarga,
  type Audiencia,
  type Canal,
  type Contenido,
  type Objetivo,
  type Opcion,
  type Slot,
} from "@/lib/calendario-context"

/** Los campos con los que se regenera una idea. */
export type CamposRegenerar = {
  titulo: string
  angulo: string
  objetivo: Objetivo
  audiencia: Audiencia
  instruccion: string
}

/** Los perfiles que puede tener UNA pieza: "todos" es del plan, no de una pieza. */
const AUDIENCIAS_PIEZA = AUDIENCIAS.filter((a) => a !== "todos")

/** El color del chip de objetivo, reusando los tonos del sistema. */
function tonoObjetivo(o: Objetivo): "brand" | "warning" | "success" {
  return o === "conversion" ? "success" : o === "educacion" ? "warning" : "brand"
}

/**
 * Panel lateral de una pieza del feed.
 *
 * Muestra la única idea que propuso el estratega —con su objetivo y a quién le
 * habla bien a la vista— y deja dos caminos: regenerarla con campos editables si
 * no convence, o generar el contenido y la imagen. Ya no hay tres opciones que
 * elegir: el plan nace con la recomendada puesta.
 */
export function PiezaPanel({
  slot,
  generando,
  regenerando,
  imagen,
  onImagen,
  onCerrar,
  onGenerar,
  onRegenerar,
  feedTemplateId,
}: {
  slot: Slot | null
  /** Se está generando el contenido (caption) de esta pieza. */
  generando: boolean
  /** Se está regenerando la idea de esta pieza. */
  regenerando: boolean
  /** El template del camino 2 que le tocó a esta pieza. */
  feedTemplateId: string | null
  /** La imagen vive en el calendario: el panel se cierra y ella sigue estando. */
  imagen: string | null
  onImagen: (slotId: string, dataUrl: string) => void
  onCerrar: () => void
  onGenerar: (slotId: string, ajuste: string) => void
  onRegenerar: (slotId: string, campos: CamposRegenerar) => void
}) {
  const sistema: SistemaVisual = "feed"
  const [ajuste, setAjuste] = useState("")
  const [reabrir, setReabrir] = useState(false)
  const idAnterior = useRef<string | null>(null)
  /**
   * El prompt del camino 2, que se pide al servidor. Se guarda junto al slot que
   * lo generó: sin eso, abrir otra pieza mientras este viaja mostraría el prompt
   * de la anterior, que genera la imagen equivocada con cara de correcta.
   */
  const [promptFeed, setPromptFeed] = useState<{
    slotId: string
    caption: string
    prompt: string
  } | null>(null)
  const [armandoFeed, setArmandoFeed] = useState(false)

  const slotId = slot?.id ?? null
  const caption = slot?.contenido?.caption ?? ""

  useEffect(() => {
    if (!slotId || !caption || !feedTemplateId) return
    if (promptFeed?.slotId === slotId && promptFeed.caption === caption) return

    let vigente = true
    setArmandoFeed(true)
    pedirPromptFeed(slotId, feedTemplateId)
      .then(({ prompt }) => vigente && setPromptFeed({ slotId, caption, prompt }))
      .catch((e: Error) => vigente && toast.error(e.message))
      .finally(() => vigente && setArmandoFeed(false))

    return () => {
      vigente = false
    }
  }, [slotId, caption, feedTemplateId, promptFeed])

  // El ajuste y el panel de regenerar son de la pieza, no del panel: si no se
  // limpian al cambiar de slot, lo de una se aplica a la siguiente sin avisar.
  useEffect(() => {
    if (slot && slot.id !== idAnterior.current) {
      idAnterior.current = slot.id
      setAjuste("")
      setReabrir(false)
    }
  }, [slot])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !generando && !regenerando) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar, generando, regenerando])

  if (!slot) return null

  const idea = slot.opciones.find((o) => o.id === slot.elegida) ?? slot.opciones[0] ?? null
  const ocupado = generando || regenerando

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
              {idea?.titulo ?? "Pieza"}
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
            {idea && <IdeaResumen idea={idea} />}

            {/* Regenerar la idea con campos editables */}
            {idea && (reabrir || !slot.contenido) && (
              <RegenerarIdea
                idea={idea}
                regenerando={regenerando}
                tieneContenido={Boolean(slot.contenido)}
                onRegenerar={(campos) => onRegenerar(slot.id, campos)}
              />
            )}

            {/* Generar / regenerar el contenido */}
            {idea && (
              <section className="rounded-xl border border-line bg-surface-subtle p-4">
                <label htmlFor="ajuste" className="text-[12px] font-semibold text-ink">
                  {slot.contenido ? "Volver a generar el texto con un ajuste" : "Algún ajuste antes de generar"}
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
                  <Button onClick={() => onGenerar(slot.id, ajuste)} disabled={ocupado} className="shrink-0">
                    {generando ? (
                      <Loader2 className="animate-spin" />
                    ) : slot.contenido ? (
                      <RotateCcw />
                    ) : (
                      <Sparkles />
                    )}
                    {slot.contenido ? "Regenerar texto" : "Generar contenido"}
                  </Button>
                </div>
                {slot.contenido && !reabrir && (
                  <button
                    type="button"
                    onClick={() => setReabrir(true)}
                    disabled={ocupado}
                    className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
                  >
                    <Wand2 className="h-3 w-3" />
                    ¿No te gusta la idea? Regenerala con otros campos
                  </button>
                )}
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
                armandoPrompt={armandoFeed}
                nombreTemplateFeed={templateFeedPorId(feedTemplateId)?.nombre ?? null}
                promptImagen={promptFeed?.slotId === slot.id ? promptFeed.prompt : ""}
                onImagen={(dataUrl) => onImagen(slot.id, dataUrl)}
                sistema={sistema}
              />
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

/* ── Resumen de la idea ───────────────────────────────────────────────────── */

/**
 * La idea recomendada, con su objetivo y a quién le habla bien a la vista.
 *
 * Es lo que el usuario pidió que fuera visible: entender de un vistazo qué busca
 * la pieza —dar a conocer, educar o convertir— y a qué perfil apunta.
 */
function IdeaResumen({ idea }: { idea: Opcion }) {
  const objetivo: Objetivo | null =
    idea.objetivo === "awareness" || idea.objetivo === "educacion" || idea.objetivo === "conversion"
      ? idea.objetivo
      : null

  return (
    <section className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
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

      {objetivo && (
        <p className="mt-2 text-[11px] leading-relaxed text-brand-700/90">
          Busca <b>{OBJETIVO_DESC[objetivo].toLowerCase()}</b>
          {idea.audiencia ? ` · le habla a ${AUDIENCIA_LABEL[idea.audiencia].toLowerCase()}` : ""}.
        </p>
      )}

      {idea.hook && (
        <p className="mt-2.5 text-[12px] italic leading-relaxed text-ink-secondary">“{idea.hook}”</p>
      )}

      <dl className="mt-2.5 space-y-1.5 border-t border-brand-200/70 pt-2.5">
        {idea.angulo && (
          <div>
            <dt className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-faint">El posteo</dt>
            <dd className="text-[11.5px] leading-relaxed text-ink-muted">{idea.angulo}</dd>
          </div>
        )}
        {idea.imagen && (
          <div>
            <dt className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-faint">La imagen</dt>
            <dd className="text-[11.5px] leading-relaxed text-ink-muted">{idea.imagen}</dd>
          </div>
        )}
      </dl>

      {idea.porQue && (
        <p className="mt-2.5 rounded-lg bg-surface px-2.5 py-1.5 text-[10.5px] leading-relaxed text-ink-secondary">
          {idea.porQue}
        </p>
      )}
    </section>
  )
}

/* ── Regenerar la idea ────────────────────────────────────────────────────── */

function RegenerarIdea({
  idea,
  regenerando,
  tieneContenido,
  onRegenerar,
}: {
  idea: Opcion
  regenerando: boolean
  tieneContenido: boolean
  onRegenerar: (campos: CamposRegenerar) => void
}) {
  const [titulo, setTitulo] = useState(idea.titulo)
  const [angulo, setAngulo] = useState(idea.angulo)
  const [objetivo, setObjetivo] = useState<Objetivo>(
    idea.objetivo === "educacion" || idea.objetivo === "conversion" ? idea.objetivo : "awareness"
  )
  const [audiencia, setAudiencia] = useState<Audiencia>(
    idea.audiencia && idea.audiencia !== "todos" ? idea.audiencia : "decisores"
  )
  const [instruccion, setInstruccion] = useState("")

  // Al cambiar de idea (otro slot), rearmar el formulario con sus valores.
  const idRef = useRef(idea)
  useEffect(() => {
    if (idRef.current !== idea) {
      idRef.current = idea
      setTitulo(idea.titulo)
      setAngulo(idea.angulo)
      setObjetivo(
        idea.objetivo === "educacion" || idea.objetivo === "conversion" ? idea.objetivo : "awareness"
      )
      setAudiencia(idea.audiencia && idea.audiencia !== "todos" ? idea.audiencia : "decisores")
      setInstruccion("")
    }
  }, [idea])

  return (
    <section className="rounded-xl border border-line bg-surface-subtle p-4">
      <p className="eyebrow mb-3 flex items-center gap-1.5">
        <Wand2 className="h-3 w-3" />
        Regenerar esta pieza
      </p>

      <div className="space-y-3">
        <Campo label="Título">
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={regenerando} />
        </Campo>
        <Campo label="Ángulo">
          <textarea
            value={angulo}
            onChange={(e) => setAngulo(e.target.value)}
            disabled={regenerando}
            rows={2}
            className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] text-ink outline-none transition-colors focus:border-brand-400 disabled:opacity-60"
          />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Objetivo">
            <Select value={objetivo} onChange={(v) => setObjetivo(v as Objetivo)} disabled={regenerando}>
              {OBJETIVOS.map((o) => (
                <option key={o} value={o}>
                  {OBJETIVO_LABEL[o]}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo label="Audiencia">
            <Select value={audiencia} onChange={(v) => setAudiencia(v as Audiencia)} disabled={regenerando}>
              {AUDIENCIAS_PIEZA.map((a) => (
                <option key={a} value={a}>
                  {AUDIENCIA_CORTO[a]}
                </option>
              ))}
            </Select>
          </Campo>
        </div>

        <Campo label="Instrucción (opcional)">
          <Input
            value={instruccion}
            onChange={(e) => setInstruccion(e.target.value)}
            disabled={regenerando}
            placeholder="Ej: hacela más técnica, citá un caso real…"
          />
        </Campo>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => onRegenerar({ titulo, angulo, objetivo, audiencia, instruccion })}
            disabled={regenerando}
          >
            {regenerando ? <Loader2 className="animate-spin" /> : <Wand2 />}
            {regenerando ? "Regenerando…" : "Regenerar idea"}
          </Button>
          {tieneContenido && (
            <span className="text-[10.5px] leading-tight text-ink-muted">
              Regenerar la idea borra el texto y la imagen actuales.
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </span>
      {children}
    </label>
  )
}

function Select({
  value,
  onChange,
  disabled,
  children,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none transition-colors focus:border-brand-400 disabled:opacity-60"
    >
      {children}
    </select>
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
  armandoPrompt,
  nombreTemplateFeed,
  sistema,
}: {
  contenido: Contenido
  canal: string
  canalId: Canal
  imagen: string | null
  /** El camino 2 pasa por el servidor a traducir la pieza a variables: tarda. */
  armandoPrompt: boolean
  nombreTemplateFeed: string | null
  promptImagen: string
  onImagen: (dataUrl: string) => void
  sistema: SistemaVisual
}) {
  const [previa, setPrevia] = useState(false)

  const todo = [contenido.caption, contenido.cta, contenido.hashtags].filter(Boolean).join("\n\n")

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

      <Bloque icono={Type} titulo="Texto de la publicación" texto={contenido.caption} multilinea />
      {contenido.captionCorto && (
        <Bloque icono={Type} titulo="Versión corta (story / anuncio)" texto={contenido.captionCorto} multilinea />
      )}
      {contenido.cta && <Bloque icono={MousePointerClick} titulo="Call to action" texto={contenido.cta} />}
      {contenido.hashtags && <Bloque icono={Hash} titulo="Hashtags" texto={contenido.hashtags} />}
      {promptImagen ? (
        <ImagenGenerada
          prompt={promptImagen}
          imagen={imagen}
          onImagen={onImagen}
          proporcionFija={proporcionDe(canalId)}
        />
      ) : (
        armandoPrompt && (
          <p className="flex items-center gap-1.5 rounded-xl border border-line bg-surface-subtle px-4 py-3 text-[11.5px] text-ink-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            Traduciendo la pieza a las variables de {SISTEMA_LABEL[sistema]}
            {nombreTemplateFeed ? ` · ${nombreTemplateFeed}` : ""}…
          </p>
        )
      )}

      {previa && (
        <VistaPrevia canal={canalId} contenido={contenido} imagen={imagen} onCerrar={() => setPrevia(false)} />
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
