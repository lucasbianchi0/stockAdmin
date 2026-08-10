"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import {
  Sparkles, Copy, Check, ArrowLeft, Wand2, Send, X, Loader2, RefreshCw,
  CalendarDays, Palette, Type, Film, Layers,
  Plus, Minus, RotateCcw, Save, Download, Image as ImageIcon,
} from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import {
  FORMATS_BY_PLATFORM, BRIEF_MAX_LEN, DESIGN_SYSTEM, REEL_FORMATS,
  MAX_SLIDES, MIN_SLIDES, DEFAULT_SLIDES, BRAND_PROMPT_MAX_LEN,
  ACCEDRA_BRAND_CONTEXT, VALID_PLAN_FORMATS, ACCENT_HEX,
} from "@/lib/contenido-context"
import {
  AUDIENCIA_GUIA, guiaDe, OBJETIVO_GUIA, PLATAFORMA_GUIA,
} from "@/lib/contenido-guia"
import { MARCA } from "@/components/admin/platform-icons"

// v1 sin historial: no persistimos las ideas generadas. Stub no-op para
// mantener los call-sites sin tocar la lógica de generación.
const saveContentHistoryAction = async (entry?: unknown): Promise<void> => { void entry }

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform       = "instagram" | "tiktok" | "linkedin" | "facebook"
type Audience       = "decisores" | "negocio" | "ambos"
type Objective      = "awareness" | "conversion" | "educacion" | "prueba_social"
type Phase          = "config" | "ideas" | "plan-view" | "copy" | "sistema"
type ContentMode    = "ideas" | "plan"
type PostCount      = 3 | 5 | 7
type OptionsPerPost = 3 | 4
type CopyKey        = "caption" | "captionCorto" | "hashtags" | "cta" | "promptImagen" | "guion"

interface Idea {
  id: string
  title: string
  hook: string
  format: "imagen" | "carrusel" | "reel" | "story" | "articulo"
  angle: string
}

interface PlanSlot {
  slot: number
  timing: string
  narrativeBeat: string
  options: Idea[]
}

interface ContentPlan {
  title: string
  arc: string
  posts: PlanSlot[]
}

interface CopyState {
  caption: string
  captionCorto: string
  hashtags: string
  cta: string
  promptImagen: string
  guion: string
  promptsCarrusel: string[]
}

interface CarouselConfig {
  slideCount: number
  instructions: string[]
}

const EMPTY_COPY: CopyState = {
  caption: "", captionCorto: "", hashtags: "", cta: "",
  promptImagen: "", guion: "", promptsCarrusel: [],
}

// ─── Static config ────────────────────────────────────────────────────────────

// LinkedIn va primero: para un negocio B2B es el canal de venta y los otros
// tres son mantenimiento de presencia. El orden de la fila es una recomendación.
const PLATFORMS: Array<{ id: Platform; label: string }> = [
  { id: "linkedin",  label: "LinkedIn"  },
  { id: "instagram", label: "Instagram" },
  { id: "facebook",  label: "Facebook"  },
  { id: "tiktok",    label: "TikTok"    },
]

const AUDIENCES = [
  { id: "decisores" as Audience, label: "Decisores IT",   desc: "CTOs, CIOs, gerentes de sistemas" },
  { id: "negocio"   as Audience, label: "Negocio",        desc: "Dueños y gerentes generales"      },
  { id: "ambos"     as Audience, label: "Ambos",          desc: "Toda la audiencia B2B"            },
]

const OBJECTIVES = [
  { id: "awareness"     as Objective, label: "Awareness",     desc: "Que sepan que Accedra existe" },
  { id: "conversion"    as Objective, label: "Conversión",    desc: "Que contacten a Accedra"      },
  { id: "educacion"     as Objective, label: "Educación",     desc: "Cómo funcionan sus soluciones" },
  { id: "prueba_social" as Objective, label: "Prueba social", desc: "Clientes y partners"          },
]

const FORMAT_CONFIG: Record<string, { label: string; cls: string }> = {
  imagen:   { label: "Imagen",   cls: "bg-blue-50   text-blue-700   border-blue-200"   },
  carrusel: { label: "Carrusel", cls: "bg-purple-50 text-purple-700 border-purple-200" },
  reel:     { label: "Reel",     cls: "bg-pink-50   text-pink-700   border-pink-200"   },
  story:    { label: "Story",    cls: "bg-amber-50  text-amber-700  border-amber-200"  },
  articulo: { label: "Artículo", cls: "bg-cyan-50   text-cyan-700   border-cyan-200"   },
}

const PLAN_FORMAT_OPTIONS = [
  { id: "mixto",    label: "Variado",  emoji: "🎲" },
  { id: "imagen",   label: "Imagen",   emoji: "🖼️" },
  { id: "carrusel", label: "Carrusel", emoji: "📑" },
  { id: "reel",     label: "Reel",     emoji: "🎬" },
  { id: "story",    label: "Story",    emoji: "⭕" },
]

function getCopySections(format: string): Array<{ key: CopyKey; label: string; placeholder: string; rows: number }> {
  const base: Array<{ key: CopyKey; label: string; placeholder: string; rows: number }> = [
    { key: "caption",      label: "Caption completo",   placeholder: "El caption aparecerá aquí...", rows: 8 },
    { key: "captionCorto", label: "Story / Reel",       placeholder: "Versión corta...",             rows: 3 },
    { key: "hashtags",     label: "Hashtags",           placeholder: "#tecnologia #ciberseguridad ...",  rows: 2 },
    { key: "cta",          label: "Call to action",     placeholder: "CTA con accedra.com.ar...",         rows: 2 },
  ]
  if (REEL_FORMATS.has(format)) {
    return [...base, { key: "guion", label: "Guión del Reel", placeholder: "El guión aparecerá aquí...", rows: 12 }]
  }
  if (format !== "carrusel") {
    return [...base, { key: "promptImagen", label: "Prompt imagen (DALL-E / Midjourney)", placeholder: "Prompt en inglés...", rows: 5 }]
  }
  return base
}

// ─── Streaming helper ─────────────────────────────────────────────────────────

async function readStream(response: Response, onText: (t: string) => void) {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    onText(decoder.decode(value, { stream: true }))
  }
}

// ─── Section parser (handles static + guion + carousel slides) ───────────────

function parseSections(text: string): Partial<CopyState> {
  const result: Partial<CopyState> = {}

  const singleMarkers: { key: "caption" | "captionCorto" | "hashtags" | "cta" | "promptImagen" | "guion"; marker: string }[] = [
    { key: "caption",      marker: "###CAPTION###"       },
    { key: "captionCorto", marker: "###CAPTION_CORTO###" },
    { key: "hashtags",     marker: "###HASHTAGS###"      },
    { key: "cta",          marker: "###CTA###"           },
    { key: "promptImagen", marker: "###PROMPT_IMAGEN###" },
    { key: "guion",        marker: "###GUION###"         },
  ]

  const allPositions: { pos: number; end: number; label: string }[] = []
  for (const { marker } of singleMarkers) {
    const pos = text.indexOf(marker)
    if (pos !== -1) allPositions.push({ pos, end: pos + marker.length, label: marker })
  }
  for (let i = 1; i <= MAX_SLIDES; i++) {
    const marker = `###SLIDE_${i}###`
    const pos = text.indexOf(marker)
    if (pos !== -1) allPositions.push({ pos, end: pos + marker.length, label: marker })
  }
  allPositions.sort((a, b) => a.pos - b.pos)

  for (let i = 0; i < allPositions.length; i++) {
    const { end, label } = allPositions[i]
    const nextPos = allPositions[i + 1]?.pos ?? text.length
    const content = text.slice(end, nextPos).trim()
    if (!content) continue
    const single = singleMarkers.find(m => m.marker === label)
    if (single) result[single.key] = content
  }

  const slidePositions = allPositions.filter(p => /^###SLIDE_\d+###$/.test(p.label))
  if (slidePositions.length > 0) {
    const slides: string[] = slidePositions.map(sp => {
      const idx = allPositions.indexOf(sp)
      const nextPos = allPositions[idx + 1]?.pos ?? text.length
      return text.slice(sp.end, nextPos).trim()
    }).filter(Boolean)
    if (slides.length > 0) result.promptsCarrusel = slides
  }

  return result
}

// ─── SlidePromptCard ──────────────────────────────────────────────────────────

function SlidePromptCard({ index, content, isGenerating, onChange, onRefine, imageUrl, imageLoading, onGenerateImage }: {
  index: number
  content: string
  isGenerating: boolean
  onChange: (v: string) => void
  onRefine: (instruction: string) => Promise<void>
  imageUrl?: string | null
  imageLoading?: boolean
  onGenerateImage?: () => void
}) {
  const [copied, setCopied]           = useState(false)
  const [showRefine, setShowRefine]   = useState(false)
  const [refineInput, setRefineInput] = useState("")
  const [isRefining, setIsRefining]   = useState(false)

  const handleCopy = () => {
    if (!content) return
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRefineSubmit = async () => {
    const instr = refineInput.trim()
    if (!instr) return
    setIsRefining(true)
    try { await onRefine(instr) } finally { setIsRefining(false); setRefineInput(""); setShowRefine(false) }
  }

  return (
    <div className="rounded-lg border border-zinc-100 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-50/80 border-b border-zinc-100">
        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Slide {index + 1}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowRefine(!showRefine)}
            className={cn("flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-all",
              showRefine ? "bg-brand-green/10 text-brand-green" : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100")}
          >
            <Wand2 className="h-2.5 w-2.5" /> Refinar
          </button>
          <button
            onClick={handleCopy}
            disabled={!content}
            className={cn("flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-all",
              copied ? "bg-emerald-50 text-emerald-600" : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100",
              !content && "opacity-30 cursor-not-allowed")}
          >
            {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
          </button>
        </div>
      </div>
      <div className="relative">
        <Textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="resize-none border-0 rounded-none focus-visible:ring-0 text-xs text-zinc-700 leading-relaxed bg-white placeholder:text-zinc-300"
          placeholder={isGenerating && !content ? "" : "Prompt en inglés..."}
        />
        {isGenerating && !content && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-1.5 text-zinc-300">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-xs">Generando...</span>
            </div>
          </div>
        )}
      </div>
      {onGenerateImage && content && (
        <div className="border-t border-zinc-100 p-3">
          {imageUrl ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={`Slide ${index + 1}`} className="w-full rounded-lg border border-zinc-200" />
              <div className="flex gap-1.5">
                <button onClick={onGenerateImage} disabled={imageLoading}
                  className="flex items-center gap-1 px-2 py-1 rounded-md border border-zinc-200 text-[11px] font-medium text-zinc-500 hover:text-zinc-700 disabled:opacity-40">
                  {imageLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />} Regenerar
                </button>
                <a href={imageUrl} download={`accedra-slide-${index + 1}.png`}
                  className="flex items-center gap-1 px-2 py-1 rounded-md border border-zinc-200 text-[11px] font-medium text-zinc-500 hover:text-zinc-700">
                  <Download className="h-2.5 w-2.5" /> Descargar
                </a>
              </div>
            </div>
          ) : (
            <button onClick={onGenerateImage} disabled={imageLoading}
              className="flex items-center justify-center gap-1.5 w-full h-9 rounded-lg border border-dashed border-brand-green/40 text-xs font-semibold text-brand-green hover:bg-brand-green/[0.04] disabled:opacity-50">
              {imageLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Generando imagen...</> : <><ImageIcon className="h-3 w-3" /> Generar imagen</>}
            </button>
          )}
        </div>
      )}
      {showRefine && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-brand-green/20 bg-brand-green/[0.03]">
          <Wand2 className="h-3 w-3 text-brand-green/50 shrink-0" />
          <input
            type="text"
            value={refineInput}
            onChange={(e) => setRefineInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleRefineSubmit() } }}
            placeholder="Ej: más abstracto, fondo más oscuro..."
            className="flex-1 text-xs bg-transparent outline-none placeholder:text-zinc-400 text-zinc-700"
            autoFocus
          />
          <button onClick={() => { setRefineInput(""); setShowRefine(false) }} className="text-zinc-300 hover:text-zinc-500 p-0.5">
            <X className="h-3 w-3" />
          </button>
          <button
            onClick={handleRefineSubmit}
            disabled={!refineInput.trim() || isRefining}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-brand-green text-white text-xs font-medium disabled:opacity-40"
          >
            {isRefining ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Send className="h-2.5 w-2.5" />}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── CopySectionCard ──────────────────────────────────────────────────────────

function CopySectionCard({ label, value, placeholder, rows, isGenerating, onChange, onRefine }: {
  sectionKey: CopyKey
  label: string
  value: string
  placeholder: string
  rows: number
  isGenerating: boolean
  onChange: (v: string) => void
  onRefine: (instruction: string) => Promise<void>
}) {
  const [copied, setCopied]           = useState(false)
  const [showRefine, setShowRefine]   = useState(false)
  const [refineInput, setRefineInput] = useState("")
  const [isRefining, setIsRefining]   = useState(false)

  const handleCopy = () => {
    if (!value) return
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRefineSubmit = async () => {
    const instruction = refineInput.trim()
    if (!instruction) return
    setIsRefining(true)
    try { await onRefine(instruction) }
    finally { setIsRefining(false); setRefineInput(""); setShowRefine(false) }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 bg-zinc-50/70">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{label}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowRefine(!showRefine)}
            className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
              showRefine ? "bg-brand-green/10 text-brand-green" : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100")}
          >
            <Wand2 className="h-3 w-3" /> Refinar con IA
          </button>
          <button
            onClick={handleCopy}
            disabled={!value}
            className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
              copied ? "bg-emerald-50 text-emerald-600" : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100",
              !value && "opacity-30 cursor-not-allowed")}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
      </div>
      <div className="relative">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isGenerating && !value ? "" : placeholder}
          rows={rows}
          className="resize-none border-0 rounded-none focus-visible:ring-0 text-sm text-zinc-800 leading-relaxed bg-white placeholder:text-zinc-300"
        />
        {isGenerating && !value && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 text-zinc-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="text-xs">Generando...</span>
            </div>
          </div>
        )}
      </div>
      {showRefine && (
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-brand-green/20 bg-brand-green/[0.03]">
          <Wand2 className="h-3.5 w-3.5 text-brand-green/50 shrink-0" />
          <input
            type="text"
            value={refineInput}
            onChange={(e) => setRefineInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleRefineSubmit() } }}
            placeholder='Ej: "hacé más gracioso", "más corto", "tono más formal"...'
            className="flex-1 text-xs bg-transparent outline-none placeholder:text-zinc-400 text-zinc-700"
            autoFocus
          />
          <button onClick={() => { setRefineInput(""); setShowRefine(false) }} className="text-zinc-300 hover:text-zinc-500 p-0.5">
            <X className="h-3 w-3" />
          </button>
          <button
            onClick={handleRefineSubmit}
            disabled={!refineInput.trim() || isRefining}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-green text-white text-xs font-medium disabled:opacity-40"
          >
            {isRefining ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── SelectorBtn ──────────────────────────────────────────────────────────────

function SelectorBtn({ active, onClick, children, className }: {
  active: boolean; onClick: () => void; children: React.ReactNode; className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left px-4 py-3 rounded-xl border-2 transition-all",
        active ? "border-brand-green bg-brand-green/[0.06]" : "border-zinc-200 bg-white hover:border-zinc-300",
        className
      )}
    >
      {children}
    </button>
  )
}

/** Etiqueta del peso que tiene un canal para un negocio B2B de infraestructura. */
function PrioridadCanal({ prioridad }: { prioridad: "alta" | "media" | "baja" }) {
  const cfg = {
    alta:  { texto: "Canal principal", cls: "bg-emerald-50 text-emerald-700" },
    media: { texto: "Secundario",      cls: "bg-zinc-100  text-zinc-500"    },
    baja:  { texto: "Poco relevante",  cls: "bg-zinc-100  text-zinc-400"    },
  }[prioridad]

  return (
    <span className={cn("mt-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold", cfg.cls)}>
      {cfg.texto}
    </span>
  )
}

/**
 * Qué va a salir del formato elegido, separado en los dos trabajos que después
 * hace gente distinta: la pieza gráfica y el texto.
 */
function FichaFormato({ guia }: { guia: { imagen: string; posteo: string } | null }) {
  if (!guia) {
    return (
      <p className="mt-2.5 text-xs leading-relaxed text-zinc-400">
        Sin formato elegido, la IA propone el que mejor le calce a cada idea.
      </p>
    )
  }

  return (
    <div className="mt-3 grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 sm:grid-cols-2">
      <div>
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          <ImageIcon className="h-3 w-3" /> La imagen
        </p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600">{guia.imagen}</p>
      </div>
      <div>
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          <Type className="h-3 w-3" /> El posteo
        </p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600">{guia.posteo}</p>
      </div>
    </div>
  )
}

// ─── CarouselConfigPanel ──────────────────────────────────────────────────────

function CarouselConfigPanel({ config, onChange, onGenerate, onCancel }: {
  config: CarouselConfig
  onChange: (c: CarouselConfig) => void
  onGenerate: () => void
  onCancel: () => void
}) {
  const setCount = (n: number) => {
    const clamped = Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, n))
    const instructions = config.instructions.slice(0, clamped)
    while (instructions.length < clamped) instructions.push("")
    onChange({ slideCount: clamped, instructions })
  }

  return (
    <div className="mt-2 rounded-xl border-2 border-purple-200 bg-purple-50/60 p-4" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-purple-700 uppercase tracking-wider">Configurar carrusel</p>
        <button onClick={onCancel} className="text-zinc-400 hover:text-zinc-600 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Slide count */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-semibold text-zinc-600 shrink-0">Slides:</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setCount(config.slideCount - 1)} disabled={config.slideCount <= MIN_SLIDES}
            className="h-6 w-6 rounded-md border border-zinc-300 bg-white flex items-center justify-center text-zinc-500 hover:border-zinc-400 disabled:opacity-40 transition-all">
            <Minus className="h-3 w-3" />
          </button>
          <span className="text-sm font-bold text-zinc-800 w-6 text-center">{config.slideCount}</span>
          <button onClick={() => setCount(config.slideCount + 1)} disabled={config.slideCount >= MAX_SLIDES}
            className="h-6 w-6 rounded-md border border-zinc-300 bg-white flex items-center justify-center text-zinc-500 hover:border-zinc-400 disabled:opacity-40 transition-all">
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <div className="flex gap-1 ml-1">
          {[3, 5, 7, 10].map(n => (
            <button key={n} onClick={() => setCount(n)}
              className={cn("px-2 py-0.5 rounded-md text-xs font-semibold transition-all",
                config.slideCount === n ? "bg-purple-200 text-purple-700" : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100")}
            >{n}</button>
          ))}
        </div>
      </div>

      {/* Per-slide instructions */}
      <div className="space-y-2 mb-4 max-h-60 overflow-y-auto pr-1">
        {config.instructions.map((instr, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-2.5 text-[10px] font-black text-purple-400 w-12 shrink-0">SLIDE {i + 1}</span>
            <input
              type="text"
              value={instr}
              onChange={(e) => {
                const next = [...config.instructions]
                next[i] = e.target.value
                onChange({ ...config, instructions: next })
              }}
              placeholder={`Ej: destacar un partner, título "Ciberseguridad"...`}
              className="flex-1 text-xs rounded-lg border border-zinc-200 bg-white px-3 py-2 outline-none focus:border-purple-400 placeholder:text-zinc-300 text-zinc-700 transition-all"
            />
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onGenerate}
          className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition-all"
        >
          <Sparkles className="h-3 w-3" /> Generar {config.slideCount} slides
        </button>
        <button onClick={onCancel} className="px-3 h-8 rounded-lg border border-zinc-200 bg-white text-xs text-zinc-500 hover:text-zinc-700 transition-all">
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ─── PlanSlotCard ─────────────────────────────────────────────────────────────

function PlanSlotCard({ slot, onSelectOption, onRegenerate, isRegenerating, getStatus }: {
  slot: PlanSlot
  onSelectOption: (idea: Idea) => void
  onRegenerate: () => void
  isRegenerating: boolean
  getStatus: (id: string) => "loading" | "ready" | undefined
}) {
  const optCount = slot.options.length
  const gridCols = optCount === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : optCount === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"
  const readyCount = slot.options.filter(o => getStatus(o.id) === "ready").length

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-50/80 border-b border-zinc-100">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-green/10 text-[12px] font-black text-brand-green">
            {slot.slot}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{slot.timing}</p>
            <p className="text-sm font-semibold text-zinc-800 leading-snug">{slot.narrativeBeat}</p>
          </div>
          {readyCount > 0 && (
            <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              {readyCount} listo{readyCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={onRegenerate}
          disabled={isRegenerating}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all disabled:opacity-40 shrink-0"
        >
          {isRegenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Regenerar
        </button>
      </div>

      {isRegenerating ? (
        <div className="flex items-center justify-center gap-2 py-10 text-zinc-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Generando opciones...</span>
        </div>
      ) : (
        <div className={cn("grid gap-3 p-4 grid-cols-1", gridCols)}>
          {slot.options.map((option, i) => {
            const fmt    = FORMAT_CONFIG[option.format] ?? { label: option.format, cls: "bg-zinc-100 text-zinc-600 border-zinc-200" }
            const letter = String.fromCharCode(65 + i)
            const status = getStatus(option.id)
            const isLoading = status === "loading"
            const isReady   = status === "ready"

            return (
              <div
                key={option.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectOption(option)}
                onKeyDown={(e) => { if (e.key === "Enter") onSelectOption(option) }}
                className={cn(
                  "relative group text-left rounded-xl border-2 p-4 transition-all cursor-pointer select-none",
                  isReady
                    ? "border-emerald-300 bg-emerald-50/30 shadow-[0_0_0_3px_rgba(16,185,129,0.06)]"
                    : isLoading
                      ? "border-brand-green/30 bg-brand-green/[0.02]"
                      : "border-zinc-100 bg-zinc-50/50 hover:border-brand-green hover:bg-white hover:shadow-[0_0_0_3px_rgba(43,106,200,0.06)]"
                )}
              >
                {/* Loading overlay */}
                {isLoading && (
                  <div className="absolute inset-0 rounded-xl flex items-center justify-center bg-white/70 z-10">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-green/10">
                      <Loader2 className="h-3 w-3 animate-spin text-brand-green" />
                      <span className="text-[10px] font-semibold text-brand-green">Generando...</span>
                    </div>
                  </div>
                )}

                {/* Ready badge */}
                {isReady && (
                  <div className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 z-10">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}

                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300">Opción {letter}</span>
                  <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border", fmt.cls)}>
                    {fmt.label}
                  </span>
                </div>
                <p className={cn(
                  "text-xs font-bold mb-1.5 transition-colors leading-snug",
                  isReady ? "text-emerald-700" : isLoading ? "text-zinc-400" : "text-zinc-800 group-hover:text-brand-green"
                )}>
                  {option.title}
                </p>
                <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">&ldquo;{option.hook}&rdquo;</p>
                {isReady
                  ? <p className="text-[10px] text-emerald-600 font-semibold mt-1.5">Listo · click para ver</p>
                  : <p className="text-[10px] text-zinc-300 italic mt-1.5 line-clamp-1">{option.angle}</p>
                }
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── DesignSystemView ─────────────────────────────────────────────────────────

function DesignSystemView({ promptDraft, onDraftChange, onSave, onReset, saved }: {
  customPrompt: string
  promptDraft: string
  onDraftChange: (v: string) => void
  onSave: () => void
  onReset: () => void
  saved: boolean
}) {
  const isModified = promptDraft.trim() !== ACCEDRA_BRAND_CONTEXT.trim()

  return (
    <div className="max-w-3xl space-y-8">

      {/* Prompt base */}
      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-green/10">
            <Wand2 className="h-3.5 w-3.5 text-brand-green" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Prompt base de marca</h2>
            <p className="text-xs text-zinc-400">Contexto inyectado en todas las generaciones de IA</p>
          </div>
          {isModified && (
            <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 border border-amber-200">
              Modificado
            </span>
          )}
        </div>
        <textarea
          value={promptDraft}
          onChange={(e) => onDraftChange(e.target.value.slice(0, BRAND_PROMPT_MAX_LEN))}
          rows={14}
          className="w-full resize-none rounded-xl border-2 border-zinc-200 bg-white px-4 py-3.5 text-sm text-zinc-700 font-mono leading-relaxed outline-none transition-all focus:border-brand-green/50 focus:ring-2 focus:ring-brand-green/10 placeholder:text-zinc-300"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-zinc-400">{promptDraft.length}/{BRAND_PROMPT_MAX_LEN} caracteres</span>
          <div className="flex gap-2">
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs font-medium text-zinc-500 hover:text-zinc-700 hover:border-zinc-300 transition-all"
            >
              <RotateCcw className="h-3 w-3" /> Restaurar original
            </button>
            <button
              onClick={onSave}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                saved
                  ? "bg-emerald-500 text-white"
                  : "bg-brand-green text-white hover:bg-brand-green/90 shadow-[0_0_12px_rgba(43,106,200,0.2)]"
              )}
            >
              {saved ? <Check className="h-3 w-3" /> : <Save className="h-3 w-3" />}
              {saved ? "Guardado" : "Guardar cambios"}
            </button>
          </div>
        </div>
        {isModified && (
          <p className="text-[11px] text-amber-600 mt-1.5">
            Tus cambios se aplican en esta sesión del navegador. Al restaurar se vuelve al prompt original.
          </p>
        )}
      </section>

      {/* Colores */}
      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100">
            <Palette className="h-3.5 w-3.5 text-zinc-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Paleta de colores</h2>
            <p className="text-xs text-zinc-400">Colores del sistema de diseño Accedra</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {DESIGN_SYSTEM.colors.map((color) => (
            <div key={color.hex} className="rounded-xl border border-zinc-200 overflow-hidden">
              <div
                className="h-16 flex items-end p-2.5"
                style={{ backgroundColor: color.hex }}
              >
                <span
                  className="text-[10px] font-mono font-bold opacity-90"
                  style={{ color: color.textColor }}
                >
                  {color.hex.toUpperCase()}
                </span>
              </div>
              <div className="px-3 py-2 bg-white">
                <p className="text-xs font-semibold text-zinc-800">{color.name}</p>
                <p className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{color.usage}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Fondos */}
      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100">
            <Layers className="h-3.5 w-3.5 text-zinc-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Fondos para publicaciones</h2>
            <p className="text-xs text-zinc-400">Dos opciones de fondo — siempre premium, sin degradados fuertes</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {DESIGN_SYSTEM.backgrounds.map((bg) => (
            <div key={bg.hex} className="rounded-xl overflow-hidden border border-zinc-200">
              <div
                className="h-28 flex flex-col items-center justify-center gap-2 relative"
                style={{ backgroundColor: bg.hex }}
              >
                <div className="w-12 h-1.5 rounded-full" style={{ backgroundColor: ACCENT_HEX }} />
                <span className="text-xs font-bold tracking-wide" style={{ color: bg.textColor }}>
                  Accedra
                </span>
                <span className="text-[10px]" style={{ color: bg.textColor, opacity: 0.6 }}>
                  accedra.com.ar
                </span>
                {bg.recommended && (
                  <span className="absolute top-2.5 right-2.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-green/20 text-brand-green border border-brand-green/30">
                    Default
                  </span>
                )}
              </div>
              <div className="px-3 py-2 bg-white">
                <p className="text-xs font-semibold text-zinc-800">{bg.name}</p>
                <p className="text-[10px] font-mono text-zinc-400 mb-0.5">{bg.hex}</p>
                <p className="text-[10px] text-zinc-400 leading-tight">{bg.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Composición */}
      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100">
            <Layers className="h-3.5 w-3.5 text-zinc-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Composición y estilo visual</h2>
            <p className="text-xs text-zinc-400 font-medium">{DESIGN_SYSTEM.composition.style}</p>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 overflow-hidden mb-3">
          <ul className="divide-y divide-zinc-50">
            {DESIGN_SYSTEM.composition.rules.map((rule, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-2.5">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-green/10 text-[9px] font-black text-brand-green">{i + 1}</span>
                <span className="text-sm text-zinc-600">{rule}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg bg-zinc-50 border border-zinc-100 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Referencias visuales</p>
          <p className="text-xs text-zinc-600">{DESIGN_SYSTEM.composition.references}</p>
        </div>
      </section>

      {/* Fórmula de prompt */}
      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-green/10">
            <Wand2 className="h-3.5 w-3.5 text-brand-green" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Fórmula de prompt visual</h2>
            <p className="text-xs text-zinc-400">Base reutilizable para DALL-E / Midjourney</p>
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(DESIGN_SYSTEM.imagePromptFormula); toast.success("Prompt copiado") }}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-500 hover:text-zinc-700 transition-all"
          >
            <Copy className="h-3 w-3" /> Copiar
          </button>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-3.5">
          <p className="text-xs font-mono text-zinc-600 leading-relaxed">{DESIGN_SYSTEM.imagePromptFormula}</p>
        </div>
        <p className="text-[11px] text-zinc-400 mt-2">
          Personalizá cambiando el objeto central, frase o producto — mantené el fondo, tipografía, spacing e iluminación para consistencia de marca.
        </p>
      </section>

      {/* Tipografía */}
      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100">
            <Type className="h-3.5 w-3.5 text-zinc-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Tipografía</h2>
            <p className="text-xs text-zinc-400 font-mono">{DESIGN_SYSTEM.typography.fontFamilyLabel}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5 italic">{DESIGN_SYSTEM.typography.philosophy}</p>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          {DESIGN_SYSTEM.typography.weights.map((w) => (
            <div key={w.value} className="flex items-baseline gap-4 px-4 py-3 rounded-xl border border-zinc-100 bg-zinc-50/50">
              <span className="text-[10px] font-mono text-zinc-400 w-16 shrink-0">{w.name}</span>
              <span className="flex-1 text-sm text-zinc-800 truncate" style={{ fontWeight: w.value }}>
                {w.sample}
              </span>
              <span className="text-[10px] font-mono text-zinc-300 shrink-0">{w.value}</span>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-zinc-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-100">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Escala tipográfica</span>
          </div>
          <div className="divide-y divide-zinc-50">
            {DESIGN_SYSTEM.typography.sizes.map((s) => (
              <div key={s.label} className="flex items-center gap-4 px-4 py-2.5">
                <span className="text-[10px] font-mono font-bold text-zinc-300 w-10 shrink-0">{s.label}</span>
                <span className="text-zinc-800 font-semibold leading-none shrink-0" style={{ fontSize: s.px }}>Aa</span>
                <span className="text-[11px] font-mono text-zinc-300 ml-auto shrink-0">{s.px}</span>
                <span className="text-[10px] text-zinc-400 text-right">{s.use}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Logo / Wordmark */}
      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100">
            <Film className="h-3.5 w-3.5 text-zinc-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Wordmark y logo</h2>
            <p className="text-xs text-zinc-400">Reglas de uso en publicaciones</p>
          </div>
          <a
            href="/marketing/brand#logos"
            className="ml-auto rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-500 transition-all hover:text-zinc-700"
          >
            Descargar en el Brand Kit
          </a>
        </div>

        {/* Los archivos reales, no la descripción de los archivos. Un manual que
            describe el logo sin mostrarlo obliga a ir a buscarlo a otro lado, y
            ahí es donde alguien termina usando el JPG viejo de un mail. */}
        <div className="mb-4 grid grid-cols-2 gap-2.5">
          <div className="flex h-20 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 px-6">
            <Image src="/brand/accedra-logo-navy.svg" alt="Logotipo Accedra sobre fondo claro" width={1073} height={160} className="h-5 w-auto" unoptimized />
          </div>
          <div className="flex h-20 items-center justify-center rounded-xl px-6" style={{ background: DESIGN_SYSTEM.backgrounds[1].hex }}>
            <Image src="/brand/accedra-logo-blanco.svg" alt="Logotipo Accedra sobre fondo oscuro" width={1073} height={160} className="h-5 w-auto" unoptimized />
          </div>
        </div>

        <ul className="space-y-2">
          {DESIGN_SYSTEM.logo.rules.map((rule, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-600">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-green/10 text-[9px] font-black text-brand-green">{i + 1}</span>
              {rule}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// ─── Session persistence ──────────────────────────────────────────────────────

const SESSION_KEY = "content-studio-v1"
const BRAND_PROMPT_KEY = "accedra-custom-brand-prompt"

function saveSession(data: object) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(data)) } catch { /* noop */ }
}

function loadSession(): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch { return null }
}

function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY) } catch { /* noop */ }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ContentStudioClient() {
  // ── Shared state ────────────────────────────────────────────────────────────
  const [phase, setPhase]             = useState<Phase>("config")
  const [prevPhase, setPrevPhase]     = useState<Phase>("config")
  const [contentMode, setContentMode] = useState<ContentMode>("ideas")
  const [platform, setPlatform]       = useState<Platform>("instagram")
  const [audience, setAudience]       = useState<Audience>("decisores")

  // ── Ideas-flow state ────────────────────────────────────────────────────────
  const [objective, setObjective]           = useState<Objective>("awareness")
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null)
  const [brief, setBrief]                   = useState("")
  const [ideas, setIdeas]                   = useState<Idea[]>([])
  const [loadingIdeas, setLoadingIdeas]     = useState(false)

  // ── Multi-select idea generation state ──────────────────────────────────────
  const [ideaGenState, setIdeaGenState]             = useState<Record<string, "loading" | "ready">>({})
  const [configuringCarousel, setConfiguringCarousel] = useState<string | null>(null)
  const [carouselConfig, setCarouselConfig]           = useState<CarouselConfig>({ slideCount: DEFAULT_SLIDES, instructions: Array(DEFAULT_SLIDES).fill("") })

  // ── Plan-flow state ─────────────────────────────────────────────────────────
  const [postCount, setPostCount]               = useState<PostCount>(3)
  const [optionsPerPost, setOptionsPerPost]     = useState<OptionsPerPost>(4)
  const [planBrief, setPlanBrief]               = useState("")
  const [postBriefs, setPostBriefs]             = useState<string[]>(Array(3).fill(""))
  const [planFormat, setPlanFormat]             = useState<string>("mixto")
  const [plan, setPlan]                         = useState<ContentPlan | null>(null)
  const [loadingPlan, setLoadingPlan]           = useState(false)
  const [regeneratingSlot, setRegeneratingSlot] = useState<number | null>(null)

  // ── Copy-flow state ─────────────────────────────────────────────────────────
  const [selectedIdea, setSelectedIdea]     = useState<Idea | null>(null)
  const [selectedSlot, setSelectedSlot]     = useState<PlanSlot | null>(null)
  const [copy, setCopy]                     = useState<CopyState>(EMPTY_COPY)
  const [generatingCopy, setGeneratingCopy] = useState(false)
  const [copiedAll, setCopiedAll]           = useState(false)
  const [copyCache, setCopyCache]           = useState<Record<string, { copy: CopyState; slot: PlanSlot | null }>>({})
  const rawTextRef      = useRef("")
  const savedHistoryIds = useRef(new Set<string>())

  // ── Imágenes generadas (Gemini) ─────────────────────────────────────────────
  const [heroImage, setHeroImage]                 = useState<string | null>(null)
  const [heroImageLoading, setHeroImageLoading]   = useState(false)
  const [slideImages, setSlideImages]             = useState<Record<number, string>>({})
  const [slideImageLoading, setSlideImageLoading] = useState<Record<number, boolean>>({})

  // ── Design system / brand prompt ────────────────────────────────────────────
  const [customBrandPrompt, setCustomBrandPrompt] = useState("")
  const [brandPromptDraft, setBrandPromptDraft]   = useState(ACCEDRA_BRAND_CONTEXT)
  const [brandPromptSaved, setBrandPromptSaved]   = useState(false)

  // ── Load brand prompt from localStorage on mount ─────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(BRAND_PROMPT_KEY)
      if (stored) {
        setCustomBrandPrompt(stored)
        setBrandPromptDraft(stored)
      }
    } catch { /* noop */ }
  }, [])

  // ── Reset generated images when switching to a different post ────────────────
  useEffect(() => {
    setHeroImage(null)
    setSlideImages({})
    setSlideImageLoading({})
  }, [selectedIdea?.id])

  // ── Sync copy changes back to cache ─────────────────────────────────────────
  useEffect(() => {
    if (!selectedIdea || generatingCopy) return
    const hasContent = copy.caption || copy.guion || copy.promptImagen || copy.promptsCarrusel.length > 0
    if (!hasContent) return
    setCopyCache(prev => ({ ...prev, [selectedIdea.id]: { copy, slot: selectedSlot } }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copy, selectedIdea, generatingCopy, selectedSlot])

  // ── Restore session on mount ─────────────────────────────────────────────────
  useEffect(() => {
    const s = loadSession()
    if (!s) return
    if (s.contentMode === "ideas" || s.contentMode === "plan") setContentMode(s.contentMode)
    if (PLATFORMS.some(p => p.id === s.platform)) setPlatform(s.platform as Platform)
    if (AUDIENCES.some(a => a.id === s.audience)) setAudience(s.audience as Audience)
    if (OBJECTIVES.some(o => o.id === s.objective)) setObjective(s.objective as Objective)
    if (s.selectedFormat === null || typeof s.selectedFormat === "string") setSelectedFormat(s.selectedFormat as string | null)
    if (typeof s.brief === "string") setBrief(s.brief)
    if (typeof s.planBrief === "string") setPlanBrief(s.planBrief)
    if (s.postCount === 3 || s.postCount === 5 || s.postCount === 7) setPostCount(s.postCount)
    if (s.optionsPerPost === 3 || s.optionsPerPost === 4) setOptionsPerPost(s.optionsPerPost)
    if (typeof s.planFormat === "string" && VALID_PLAN_FORMATS.has(s.planFormat)) setPlanFormat(s.planFormat)
    if (Array.isArray(s.ideas) && (s.ideas as unknown[]).length > 0) {
      setIdeas(s.ideas as Idea[])
      if (s.phase === "ideas") setPhase("ideas")
    }
    if (s.plan && typeof s.plan === "object" && !Array.isArray(s.plan)) {
      setPlan(s.plan as ContentPlan)
      if (s.phase === "plan-view") setPhase("plan-view")
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function handlePlatformChange(p: Platform) {
    setPlatform(p)
    setSelectedFormat(null)
  }

  function handleCopyAll() {
    const parts = [
      copy.caption      && `CAPTION\n${copy.caption}`,
      copy.captionCorto && `STORY / REEL\n${copy.captionCorto}`,
      copy.hashtags     && `HASHTAGS\n${copy.hashtags}`,
      copy.cta          && `CTA\n${copy.cta}`,
      copy.guion        && `GUIÓN\n${copy.guion}`,
      copy.promptImagen && `PROMPT IMAGEN\n${copy.promptImagen}`,
      ...copy.promptsCarrusel.map((p, i) => p && `SLIDE ${i + 1}\n${p}`),
    ].filter(Boolean).join("\n\n---\n\n")
    if (!parts) return
    navigator.clipboard.writeText(parts)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  // ── Generación de imagen (Gemini) ───────────────────────────────────────────

  function imageSizeForFormat(format: string): "square" | "portrait" {
    return format === "reel" || format === "video" || format === "story" ? "portrait" : "square"
  }

  async function requestImage(prompt: string, carousel?: { index: number; total: number }): Promise<string | null> {
    const size = imageSizeForFormat(selectedIdea?.format ?? "imagen")
    const res = await fetch("/api/contenido/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, size, carousel }),
    })
    if (!res.ok) throw new Error()
    const { image } = await res.json()
    return typeof image === "string" ? image : null
  }

  async function handleGenerateHeroImage() {
    const prompt = copy.promptImagen.trim()
    if (!prompt || heroImageLoading) return
    setHeroImageLoading(true)
    try {
      const img = await requestImage(prompt)
      if (img) setHeroImage(img)
    } catch {
      toast.error("Error al generar la imagen. Intentá de nuevo.")
    } finally {
      setHeroImageLoading(false)
    }
  }

  async function handleGenerateSlideImage(i: number) {
    const prompt = (copy.promptsCarrusel[i] ?? "").trim()
    if (!prompt || slideImageLoading[i]) return
    setSlideImageLoading(prev => ({ ...prev, [i]: true }))
    try {
      const img = await requestImage(prompt, { index: i + 1, total: copy.promptsCarrusel.length })
      if (img) setSlideImages(prev => ({ ...prev, [i]: img }))
    } catch {
      toast.error(`Error al generar la imagen de la slide ${i + 1}`)
    } finally {
      setSlideImageLoading(prev => ({ ...prev, [i]: false }))
    }
  }

  async function handleGenerateAllSlides() {
    await Promise.all(
      copy.promptsCarrusel.map((_, i) => (slideImages[i] ? Promise.resolve() : handleGenerateSlideImage(i)))
    )
  }

  // ── Generate ideas ──────────────────────────────────────────────────────────

  async function handleGenerateIdeas() {
    clearSession()
    setCopyCache({})
    setIdeaGenState({})
    setConfiguringCarousel(null)
    setLoadingIdeas(true)
    setIdeas([])
    try {
      const res = await fetch("/api/contenido/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform, audience, objective,
          formatPreference: selectedFormat ?? "sin-preferencia",
          brief: brief.trim(),
          customBrandPrompt: customBrandPrompt || undefined,
        }),
      })
      if (!res.ok) throw new Error()
      const { text } = await res.json()
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error("Invalid JSON")
      const parsed = JSON.parse(match[0])
      const newIdeas: Idea[] = parsed.ideas ?? []
      setIdeas(newIdeas)
      setPhase("ideas")
      saveSession({ contentMode: "ideas", phase: "ideas", platform, audience, objective, selectedFormat, brief, ideas: newIdeas })
    } catch {
      toast.error("Error al generar ideas. Intentá de nuevo.")
    } finally {
      setLoadingIdeas(false)
    }
  }

  // ── Generate plan ───────────────────────────────────────────────────────────

  async function handleGeneratePlan() {
    clearSession()
    setCopyCache({})
    setLoadingPlan(true)
    setPlan(null)
    try {
      const res = await fetch("/api/contenido/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "full",
          platform, audience, postCount, optionsPerPost,
          brief: planBrief.trim(),
          postBriefs: postBriefs.map(b => b.trim()),
          formatPreference: planFormat,
          customBrandPrompt: customBrandPrompt || undefined,
        }),
      })
      if (!res.ok) throw new Error()
      const { plan: planData } = await res.json()
      setPlan(planData)
      setPhase("plan-view")
      saveSession({ contentMode: "plan", phase: "plan-view", platform, audience, postCount, optionsPerPost, planBrief, postBriefs, planFormat, plan: planData })
    } catch {
      toast.error("Error al generar el plan. Intentá de nuevo.")
    } finally {
      setLoadingPlan(false)
    }
  }

  // ── Regenerate single slot ──────────────────────────────────────────────────

  async function handleRegenerateSlot(slot: PlanSlot) {
    if (!plan || regeneratingSlot !== null) return
    setRegeneratingSlot(slot.slot)
    try {
      const res = await fetch("/api/contenido/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "slot",
          platform, audience, optionsPerPost,
          brief: planBrief.trim(),
          formatPreference: planFormat,
          customBrandPrompt: customBrandPrompt || undefined,
          slot: {
            index: slot.slot,
            timing: slot.timing,
            narrativeBeat: slot.narrativeBeat,
            planArc: plan.arc,
          },
        }),
      })
      if (!res.ok) throw new Error()
      const { options } = await res.json()
      if (!Array.isArray(options)) throw new Error()
      const updatedPlan = { ...plan, posts: plan.posts.map(p => p.slot === slot.slot ? { ...p, options } : p) }
      setPlan(updatedPlan)
      saveSession({ contentMode: "plan", phase: "plan-view", platform, audience, postCount, optionsPerPost, planBrief, planFormat, plan: updatedPlan })
    } catch {
      toast.error("Error al regenerar. Intentá de nuevo.")
    } finally {
      setRegeneratingSlot(null)
    }
  }

  // ── Background idea generation (multi-select) ───────────────────────────────

  async function generateIdeaBackground(idea: Idea, slideCount?: number, slideInstructions?: string[]) {
    if (ideaGenState[idea.id]) return

    setIdeaGenState(prev => ({ ...prev, [idea.id]: "loading" }))

    if (!savedHistoryIds.current.has(idea.id)) {
      savedHistoryIds.current.add(idea.id)
      saveContentHistoryAction({
        platform, format: idea.format,
        title: idea.title, hook: idea.hook, angle: idea.angle,
      }).catch(() => { /* noop */ })
    }

    if (copyCache[idea.id]) {
      setIdeaGenState(prev => ({ ...prev, [idea.id]: "ready" }))
      return
    }

    let accumulated = ""
    try {
      const res = await fetch("/api/contenido/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea, platform, audience, objective,
          brief: brief.trim(),
          slideCount: slideCount ?? DEFAULT_SLIDES,
          slideInstructions: slideInstructions ?? [],
          customBrandPrompt: customBrandPrompt || undefined,
        }),
      })
      if (!res.ok) throw new Error()
      let localCopy: CopyState = { ...EMPTY_COPY }
      await readStream(res, (text) => {
        accumulated += text
        const parsed = parseSections(accumulated)
        localCopy = { ...localCopy, ...parsed }
      })
      setCopyCache(prev => ({ ...prev, [idea.id]: { copy: localCopy, slot: null } }))
      setIdeaGenState(prev => ({ ...prev, [idea.id]: "ready" }))
    } catch {
      toast.error(`Error al generar "${idea.title}"`)
      setIdeaGenState(prev => { const n = { ...prev }; delete n[idea.id]; return n })
    }
  }

  function handleSelectIdea(idea: Idea) {
    const status = ideaGenState[idea.id]

    // Already ready → navigate to copy view
    if (status === "ready") {
      const cached = copyCache[idea.id]
      setSelectedIdea(idea)
      setSelectedSlot(null)
      setCopy(cached?.copy ?? EMPTY_COPY)
      setPhase("copy")
      return
    }

    // Loading → do nothing
    if (status === "loading") return

    // Carousel → show config panel
    if (idea.format === "carrusel") {
      if (configuringCarousel === idea.id) {
        setConfiguringCarousel(null)
      } else {
        setConfiguringCarousel(idea.id)
        setCarouselConfig({ slideCount: DEFAULT_SLIDES, instructions: Array(DEFAULT_SLIDES).fill("") })
      }
      return
    }

    // Others → start background generation
    generateIdeaBackground(idea)
  }

  // ── Generate copy (plan flow — immediate navigation) ─────────────────────────

  async function generateCopy(idea: Idea, slot: PlanSlot | null, briefOverride?: string) {
    setSelectedIdea(idea)
    setSelectedSlot(slot)
    setPhase("copy")
    rawTextRef.current = ""

    if (!savedHistoryIds.current.has(idea.id)) {
      savedHistoryIds.current.add(idea.id)
      saveContentHistoryAction({
        platform, format: idea.format,
        title: idea.title, hook: idea.hook, angle: idea.angle,
      }).catch(() => { /* noop */ })
    }

    const cached = copyCache[idea.id]
    if (cached) {
      setCopy(cached.copy)
      return
    }

    setCopy(EMPTY_COPY)
    setGeneratingCopy(true)
    try {
      const res = await fetch("/api/contenido/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea, platform, audience, objective,
          brief: briefOverride ?? brief.trim(),
          customBrandPrompt: customBrandPrompt || undefined,
        }),
      })
      if (!res.ok) throw new Error()
      await readStream(res, (text) => {
        rawTextRef.current += text
        setCopy(prev => ({ ...prev, ...parseSections(rawTextRef.current) }))
      })
    } catch {
      toast.error("Error al generar el contenido.")
    } finally {
      setGeneratingCopy(false)
    }
  }

  async function generatePlanOptionBackground(idea: Idea, slot: PlanSlot) {
    if (ideaGenState[idea.id]) return

    setIdeaGenState(prev => ({ ...prev, [idea.id]: "loading" }))

    if (!savedHistoryIds.current.has(idea.id)) {
      savedHistoryIds.current.add(idea.id)
      saveContentHistoryAction({
        platform, format: idea.format,
        title: idea.title, hook: idea.hook, angle: idea.angle,
      }).catch(() => { /* noop */ })
    }

    if (copyCache[idea.id]) {
      setIdeaGenState(prev => ({ ...prev, [idea.id]: "ready" }))
      return
    }

    const contextBrief = [
      planBrief.trim(),
      `Post ${slot.slot} del plan — ${slot.narrativeBeat} (${slot.timing})`,
    ].filter(Boolean).join(". ").slice(0, BRIEF_MAX_LEN)

    let accumulated = ""
    try {
      const res = await fetch("/api/contenido/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea, platform, audience, objective,
          brief: contextBrief,
          customBrandPrompt: customBrandPrompt || undefined,
        }),
      })
      if (!res.ok) throw new Error()
      let localCopy: CopyState = { ...EMPTY_COPY }
      await readStream(res, (text) => {
        accumulated += text
        const parsed = parseSections(accumulated)
        localCopy = { ...localCopy, ...parsed }
      })
      setCopyCache(prev => ({ ...prev, [idea.id]: { copy: localCopy, slot } }))
      setIdeaGenState(prev => ({ ...prev, [idea.id]: "ready" }))
    } catch {
      toast.error(`Error al generar "${idea.title}"`)
      setIdeaGenState(prev => { const n = { ...prev }; delete n[idea.id]; return n })
    }
  }

  function handleSelectPlanOption(idea: Idea, slot: PlanSlot) {
    const status = ideaGenState[idea.id]

    // Already ready → navigate to copy view
    if (status === "ready") {
      const cached = copyCache[idea.id]
      setSelectedIdea(idea)
      setSelectedSlot(cached?.slot ?? slot)
      setCopy(cached?.copy ?? EMPTY_COPY)
      setPhase("copy")
      return
    }

    // Loading → do nothing
    if (status === "loading") return

    // Others → start background generation
    generatePlanOptionBackground(idea, slot)
  }

  // ── Refine ──────────────────────────────────────────────────────────────────

  const handleRefine = useCallback(async (sectionKey: CopyKey, instruction: string) => {
    const currentContent = copy[sectionKey] as string
    const context = selectedIdea
      ? `Post "${selectedIdea.title}" para ${platform}, audiencia: ${audience}`
      : ""
    let refined = ""
    try {
      const res = await fetch("/api/contenido/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: sectionKey, currentContent, instruction, context, customBrandPrompt: customBrandPrompt || undefined }),
      })
      if (!res.ok) throw new Error()
      setCopy(prev => ({ ...prev, [sectionKey]: "" }))
      await readStream(res, (text) => {
        refined += text
        setCopy(prev => ({ ...prev, [sectionKey]: refined }))
      })
    } catch {
      toast.error("Error al refinar.")
      setCopy(prev => ({ ...prev, [sectionKey]: currentContent }))
    }
  }, [copy, selectedIdea, platform, audience, customBrandPrompt])

  const handleRefineSlide = useCallback(async (slideIndex: number, instruction: string) => {
    const currentContent = copy.promptsCarrusel[slideIndex] ?? ""
    const context = selectedIdea
      ? `Slide ${slideIndex + 1} del carrusel "${selectedIdea.title}" para ${platform}`
      : ""
    let refined = ""
    try {
      const res = await fetch("/api/contenido/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "promptImagen", currentContent, instruction, context, customBrandPrompt: customBrandPrompt || undefined }),
      })
      if (!res.ok) throw new Error()
      setCopy(prev => { const s = [...prev.promptsCarrusel]; s[slideIndex] = ""; return { ...prev, promptsCarrusel: s } })
      await readStream(res, (text) => {
        refined += text
        setCopy(prev => { const s = [...prev.promptsCarrusel]; s[slideIndex] = refined; return { ...prev, promptsCarrusel: s } })
      })
    } catch {
      toast.error("Error al refinar.")
      setCopy(prev => { const s = [...prev.promptsCarrusel]; s[slideIndex] = currentContent; return { ...prev, promptsCarrusel: s } })
    }
  }, [copy, selectedIdea, platform, customBrandPrompt])

  // ─── Sistema tab ─────────────────────────────────────────────────────────────

  function goToSistema() {
    setPrevPhase(phase)
    setPhase("sistema")
  }

  function handleSaveBrandPrompt() {
    setCustomBrandPrompt(brandPromptDraft)
    try { localStorage.setItem(BRAND_PROMPT_KEY, brandPromptDraft) } catch { /* noop */ }
    setBrandPromptSaved(true)
    setTimeout(() => setBrandPromptSaved(false), 2000)
  }

  if (phase === "sistema") {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setPhase(prevPhase)} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-700 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Volver
          </button>
          <span className="text-zinc-300">·</span>
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-zinc-500" />
            <h1 className="text-sm font-semibold text-zinc-700">Sistema de diseño</h1>
          </div>
        </div>
        <DesignSystemView
          customPrompt={customBrandPrompt}
          promptDraft={brandPromptDraft}
          onDraftChange={setBrandPromptDraft}
          onSave={handleSaveBrandPrompt}
          onReset={() => setBrandPromptDraft(ACCEDRA_BRAND_CONTEXT)}
          saved={brandPromptSaved}
        />
      </div>
    )
  }

  // ─── Sistema button (persistent across phases) ───────────────────────────────

  const sistemaBtn = (
    <button
      onClick={goToSistema}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-500 hover:text-zinc-700 hover:border-zinc-300 transition-all bg-white"
    >
      <Palette className="h-3.5 w-3.5" />
      Sistema
    </button>
  )

  // ── Phase: config ────────────────────────────────────────────────────────────

  if (phase === "config") {
    const platformFormats = FORMATS_BY_PLATFORM[platform] ?? []
    const briefLen     = brief.length
    const planBriefLen = planBrief.length

    return (
      <div className="max-w-2xl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-green/10">
                <Sparkles className="h-4 w-4 text-brand-green" />
              </div>
              <h1 className="text-xl font-bold text-zinc-900">Content Studio</h1>
            </div>
            <div className="flex items-center gap-2">
              {sistemaBtn}
            </div>
          </div>
          <p className="text-sm text-zinc-400 ml-[42px]">Generá contenido para redes con IA. Contexto de Accedra ya cargado.</p>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1.5 mb-7 p-1 rounded-xl bg-zinc-100 w-fit">
          <button
            onClick={() => setContentMode("ideas")}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              contentMode === "ideas" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700")}
          >
            <Sparkles className="h-3.5 w-3.5" /> Publicación
          </button>
          <button
            onClick={() => setContentMode("plan")}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              contentMode === "plan" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700")}
          >
            <CalendarDays className="h-3.5 w-3.5" /> Plan de contenido
          </button>
        </div>

        <div className="space-y-6">
          {/* Platform */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 block">Plataforma</label>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {PLATFORMS.map((p) => {
                const { Icon, hex } = MARCA[p.id]
                const activo = platform === p.id
                const guia = PLATAFORMA_GUIA[p.id]
                return (
                  <button
                    key={p.id}
                    onClick={() => handlePlatformChange(p.id)}
                    className={cn(
                      "flex flex-col items-start rounded-xl border-2 p-4 text-left transition-all",
                      activo
                        ? "border-brand-green bg-brand-green/[0.06]"
                        : "border-zinc-200 bg-white hover:border-zinc-300"
                    )}
                  >
                    {/* El logo en color solo cuando está elegido: cuatro marcas a
                        todo color compitiendo convierten la fila en un semáforo. */}
                    <Icon
                      className="h-11 w-11 shrink-0 transition-colors"
                      style={{ color: activo ? hex : "var(--n-400)" }}
                    />
                    <p className={cn("mt-3.5 text-sm font-semibold", activo ? "text-brand-green" : "text-zinc-700")}>
                      {p.label}
                    </p>
                    <PrioridadCanal prioridad={guia.prioridad} />
                  </button>
                )
              })}
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-zinc-500">
              {PLATAFORMA_GUIA[platform].rol}{" "}
              <span className="text-zinc-400">Quién está ahí: {PLATAFORMA_GUIA[platform].quien}</span>
            </p>
          </div>

          {contentMode === "ideas" ? (
            <>
              {/* Format */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 block">Formato</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedFormat(null)}
                    className={cn("flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 text-sm font-medium transition-all",
                      selectedFormat === null
                        ? "border-brand-green bg-brand-green/[0.06] text-brand-green"
                        : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300")}
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Sin preferencia
                  </button>
                  {platformFormats.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFormat(f.id)}
                      className={cn("flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 text-sm font-medium transition-all",
                        selectedFormat === f.id
                          ? "border-brand-green bg-brand-green/[0.06] text-brand-green"
                          : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300")}
                    >
                      <span className="text-base leading-none">{f.emoji}</span>
                      <span>{f.label}</span>
                    </button>
                  ))}
                </div>

                {/* Qué sale de esta elección. Sin esto, "carrusel" es una palabra:
                    que son ocho slides verticales se descubre después de generar. */}
                <FichaFormato guia={guiaDe(platform, selectedFormat)} />
              </div>

              {/* Audience */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 block">Audiencia</label>
                <div className="grid grid-cols-3 gap-2.5">
                  {AUDIENCES.map((a) => (
                    <SelectorBtn key={a.id} active={audience === a.id} onClick={() => setAudience(a.id)}>
                      <p className={cn("text-sm font-semibold", audience === a.id ? "text-brand-green" : "text-zinc-700")}>{a.label}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{a.desc}</p>
                    </SelectorBtn>
                  ))}
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-zinc-500">
                  {AUDIENCIA_GUIA[audience].que}{" "}
                  <span className="text-zinc-400">{AUDIENCIA_GUIA[audience].comoLeHablo}</span>
                </p>
              </div>

              {/* Objective */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 block">Objetivo</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {OBJECTIVES.map((o) => (
                    <SelectorBtn key={o.id} active={objective === o.id} onClick={() => setObjective(o.id)}>
                      <p className={cn("text-sm font-semibold", objective === o.id ? "text-brand-green" : "text-zinc-700")}>{o.label}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{OBJETIVO_GUIA[o.id].que}</p>
                    </SelectorBtn>
                  ))}
                </div>
                <div className="mt-2.5 space-y-1.5">
                  <p className="text-xs leading-relaxed text-zinc-500">
                    {OBJETIVO_GUIA[objective].comoSeNota}
                  </p>
                  <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs italic leading-relaxed text-zinc-500">
                    Así suena: {OBJETIVO_GUIA[objective].ejemplo}
                  </p>
                </div>
              </div>

              {/* Brief */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Idea o concepto <span className="normal-case font-normal tracking-normal text-zinc-300">(opcional)</span>
                  </label>
                  <span className={cn("text-[10px] tabular-nums transition-colors", briefLen > 450 ? "text-amber-500 font-semibold" : "text-zinc-300")}>
                    {briefLen}/{BRIEF_MAX_LEN}
                  </span>
                </div>
                <textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value.slice(0, BRIEF_MAX_LEN))}
                  placeholder="Ej: quiero explicar cómo la firma digital agiliza los contratos de una empresa..."
                  rows={3}
                  className="w-full resize-none rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 placeholder-zinc-300 outline-none transition-all focus:border-brand-green/50 focus:ring-2 focus:ring-brand-green/10"
                />
                <p className="text-[11px] text-zinc-400 mt-1.5">
                  Si lo dejás vacío, la IA genera ideas variadas. Si ponés un concepto, genera 6 variaciones.
                </p>
              </div>

              <button
                onClick={handleGenerateIdeas}
                disabled={loadingIdeas}
                className="w-full flex items-center justify-center gap-2.5 h-12 rounded-xl bg-brand-green text-white font-semibold text-sm shadow-[0_0_24px_rgba(43,106,200,0.2)] hover:bg-brand-green/90 transition-all disabled:opacity-60"
              >
                {loadingIdeas
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando ideas...</>
                  : <><Sparkles className="h-4 w-4" /> Generar ideas</>}
              </button>
            </>
          ) : (
            <>
              {/* Audience — plan */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 block">Audiencia</label>
                <div className="grid grid-cols-3 gap-2.5">
                  {AUDIENCES.map((a) => (
                    <SelectorBtn key={a.id} active={audience === a.id} onClick={() => setAudience(a.id)}>
                      <p className={cn("text-sm font-semibold", audience === a.id ? "text-brand-green" : "text-zinc-700")}>{a.label}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{a.desc}</p>
                    </SelectorBtn>
                  ))}
                </div>
              </div>

              {/* Format preference for plan */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 block">Formato del plan</label>
                <div className="flex flex-wrap gap-2">
                  {PLAN_FORMAT_OPTIONS.filter(f => {
                    if (f.id === "mixto") return true
                    const pf = FORMATS_BY_PLATFORM[platform] ?? []
                    return pf.some(pff => pff.id === f.id || (f.id === "reel" && pff.id === "video"))
                  }).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setPlanFormat(f.id)}
                      className={cn("flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 text-sm font-medium transition-all",
                        planFormat === f.id
                          ? "border-brand-green bg-brand-green/[0.06] text-brand-green"
                          : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300")}
                    >
                      <span className="text-base leading-none">{f.emoji}</span>
                      <span>{f.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Post count + options per post */}
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 block">Publicaciones</label>
                  <div className="flex gap-2">
                    {([3, 5, 7] as const).map((n) => (
                      <button key={n} onClick={() => {
                        setPostCount(n)
                        setPostBriefs(prev => {
                          const next = [...prev]
                          while (next.length < n) next.push("")
                          return next.slice(0, n)
                        })
                      }}
                        className={cn("flex-1 h-10 rounded-xl border-2 text-sm font-bold transition-all",
                          postCount === n ? "border-brand-green bg-brand-green/[0.06] text-brand-green" : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300")}
                      >{n}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 block">Opciones por post</label>
                  <div className="flex gap-2">
                    {([3, 4] as const).map((n) => (
                      <button key={n} onClick={() => setOptionsPerPost(n)}
                        className={cn("flex-1 h-10 rounded-xl border-2 text-sm font-bold transition-all",
                          optionsPerPost === n ? "border-brand-green bg-brand-green/[0.06] text-brand-green" : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300")}
                      >{n}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Per-post briefs */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1 block">
                  Contexto por publicación{" "}
                  <span className="normal-case font-normal tracking-normal text-zinc-300">(opcional)</span>
                </label>
                <p className="text-[11px] text-zinc-400 mb-3">
                  Podés especificar qué querés en cada post. Dejá vacíos los que no tengan preferencia.
                </p>
                <div className="space-y-2">
                  {Array.from({ length: postCount }, (_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider w-12 shrink-0 text-right">
                        Post {i + 1}
                      </span>
                      <input
                        type="text"
                        value={postBriefs[i] ?? ""}
                        onChange={(e) => {
                          const next = [...postBriefs]
                          next[i] = e.target.value.slice(0, 200)
                          setPostBriefs(next)
                        }}
                        placeholder={i === 0 ? "Ej: imagen sobre una solución de ciberseguridad..." : i === 1 ? "Ej: reel explicando la firma biométrica..." : "Sin preferencia"}
                        className="flex-1 text-sm rounded-xl border-2 border-zinc-200 bg-white px-3.5 py-2.5 outline-none transition-all focus:border-brand-green/50 focus:ring-2 focus:ring-brand-green/10 placeholder:text-zinc-300 text-zinc-700"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Plan brief */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Brief general del plan{" "}
                    <span className="normal-case font-normal tracking-normal text-zinc-300">(opcional)</span>
                  </label>
                  <span className={cn("text-[10px] tabular-nums transition-colors", planBriefLen > 450 ? "text-amber-500 font-semibold" : "text-zinc-300")}>
                    {planBriefLen}/{BRIEF_MAX_LEN}
                  </span>
                </div>
                <textarea
                  value={planBrief}
                  onChange={(e) => setPlanBrief(e.target.value.slice(0, BRIEF_MAX_LEN))}
                  placeholder="Ej: lanzamos un nuevo servicio de ciberseguridad, quiero cubrir la semana para generar awareness..."
                  rows={4}
                  className="w-full resize-none rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 placeholder-zinc-300 outline-none transition-all focus:border-brand-green/50 focus:ring-2 focus:ring-brand-green/10"
                />
                <p className="text-[11px] text-zinc-400 mt-1.5">Cuanto más contexto des, mejor será el arco narrativo del plan.</p>
              </div>

              <button
                onClick={handleGeneratePlan}
                disabled={loadingPlan}
                className="w-full flex items-center justify-center gap-2.5 h-12 rounded-xl bg-brand-green text-white font-semibold text-sm shadow-[0_0_24px_rgba(43,106,200,0.2)] hover:bg-brand-green/90 transition-all disabled:opacity-60"
              >
                {loadingPlan
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Armando plan...</>
                  : <><CalendarDays className="h-4 w-4" /> Armar plan</>}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Phase: ideas ─────────────────────────────────────────────────────────────

  if (phase === "ideas") {
    const platformLabel  = PLATFORMS.find(p => p.id === platform)?.label ?? platform
    const audienceLabel  = AUDIENCES.find(a => a.id === audience)?.label ?? audience
    const objectiveLabel = OBJECTIVES.find(o => o.id === objective)?.label ?? objective
    const formatLabel    = selectedFormat
      ? (FORMATS_BY_PLATFORM[platform]?.find(f => f.id === selectedFormat)?.label ?? selectedFormat)
      : null

    const anyLoading = Object.values(ideaGenState).some(s => s === "loading")

    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-3 mb-1.5 flex-wrap justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setPhase("config")} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-700 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Volver
            </button>
            <span className="text-zinc-300">·</span>
            <span className="text-sm text-zinc-500">
              <strong className="text-zinc-700">{platformLabel}</strong>
              {" · "}{audienceLabel}
              {" · "}{objectiveLabel}
              {formatLabel && <span className="text-brand-green"> · {formatLabel}</span>}
            </span>
          </div>
          {sistemaBtn}
        </div>

        {brief.trim() && (
          <div className="mt-3 mb-1 flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-2.5">
            <Wand2 className="h-3.5 w-3.5 text-brand-green mt-0.5 shrink-0" />
            <p className="text-xs text-zinc-500 leading-relaxed">
              <span className="font-semibold text-zinc-700">Concepto: </span>{brief.trim()}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between mt-4 mb-5">
          <p className="text-xs text-zinc-400">
            Hacé click en una idea para generar · para <strong className="text-purple-600">carrusel</strong> podés configurar cada slide
          </p>
          {anyLoading && (
            <div className="flex items-center gap-1.5 text-xs text-brand-green font-medium">
              <Loader2 className="h-3 w-3 animate-spin" /> Generando en paralelo...
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ideas.map((idea) => {
            const genStatus     = ideaGenState[idea.id]
            const isLoading     = genStatus === "loading"
            const isReady       = genStatus === "ready"
            const isCarousel    = idea.format === "carrusel"
            const isConfiguring = configuringCarousel === idea.id
            const fmt = FORMAT_CONFIG[idea.format] ?? { label: idea.format, cls: "bg-zinc-100 text-zinc-600 border-zinc-200" }

            return (
              <div key={idea.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectIdea(idea)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSelectIdea(idea) }}
                  className={cn(
                    "group relative text-left rounded-2xl border-2 bg-white p-5 transition-all cursor-pointer select-none",
                    isReady
                      ? "border-emerald-300 bg-emerald-50/30 shadow-[0_0_0_3px_rgba(16,185,129,0.08)]"
                      : isLoading
                        ? "border-brand-green/40 bg-brand-green/[0.02]"
                        : isConfiguring
                          ? "border-purple-300 bg-purple-50/30"
                          : "border-zinc-200 hover:border-brand-green hover:shadow-[0_0_0_3px_rgba(43,106,200,0.08)]"
                  )}
                >
                  {/* Loading overlay */}
                  {isLoading && (
                    <div className="absolute inset-0 rounded-2xl flex items-center justify-center bg-white/70 z-10">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-green/10">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-green" />
                        <span className="text-xs font-semibold text-brand-green">Generando...</span>
                      </div>
                    </div>
                  )}

                  {/* Ready badge */}
                  {isReady && (
                    <div className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 z-10">
                      <Check className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}

                  <div className="mb-3 flex items-center gap-2">
                    <span className={cn("inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border", fmt.cls)}>
                      {fmt.label}
                    </span>
                    {isCarousel && !isLoading && !isReady && (
                      <span className="text-[10px] text-purple-500 font-semibold">
                        {isConfiguring ? "▲ Configurando" : "▼ Click para configurar"}
                      </span>
                    )}
                    {isReady && (
                      <span className="text-[10px] text-emerald-600 font-semibold">Listo · Click para ver</span>
                    )}
                  </div>

                  <h3 className={cn(
                    "text-sm font-bold mb-2 transition-colors leading-snug",
                    isReady ? "text-emerald-700" : isLoading ? "text-zinc-400" : "text-zinc-900 group-hover:text-brand-green"
                  )}>
                    {idea.title}
                  </h3>
                  <p className="text-xs text-zinc-500 leading-relaxed mb-2.5">&ldquo;{idea.hook}&rdquo;</p>
                  <p className="text-[11px] text-zinc-400 italic">{idea.angle}</p>
                </div>

                {/* Carousel config panel */}
                {isConfiguring && (
                  <CarouselConfigPanel
                    config={carouselConfig}
                    onChange={setCarouselConfig}
                    onGenerate={() => {
                      setConfiguringCarousel(null)
                      generateIdeaBackground(idea, carouselConfig.slideCount, carouselConfig.instructions)
                    }}
                    onCancel={() => setConfiguringCarousel(null)}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Phase: plan-view ──────────────────────────────────────────────────────────

  if (phase === "plan-view" && plan) {
    const platformLabel = PLATFORMS.find(p => p.id === platform)?.label ?? platform
    const audienceLabel = AUDIENCES.find(a => a.id === audience)?.label ?? audience
    const planFmtLabel  = PLAN_FORMAT_OPTIONS.find(f => f.id === planFormat)?.label ?? planFormat

    return (
      <div className="max-w-4xl">
        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => setPhase("config")} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-700 transition-colors">
                <ArrowLeft className="h-4 w-4" /> Volver
              </button>
              <span className="text-zinc-300">·</span>
              <span className="text-sm text-zinc-500">
                <strong className="text-zinc-700">{platformLabel}</strong>
                {" · "}{audienceLabel}
                {" · "}{postCount} posts · {optionsPerPost} opciones
                {planFormat !== "mixto" && <span className="text-brand-green"> · {planFmtLabel}</span>}
              </span>
            </div>
            <div className="rounded-xl border border-brand-green/20 bg-brand-green/[0.04] px-4 py-3">
              <p className="text-sm font-bold text-zinc-900">{plan.title}</p>
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{plan.arc}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {sistemaBtn}
            <button
              onClick={handleGeneratePlan}
              disabled={loadingPlan}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-500 hover:text-zinc-800 hover:border-zinc-300 transition-all disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Nuevo plan
            </button>
          </div>
        </div>

        {planBrief.trim() && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-2.5">
            <Wand2 className="h-3.5 w-3.5 text-brand-green mt-0.5 shrink-0" />
            <p className="text-xs text-zinc-500 leading-relaxed">
              <span className="font-semibold text-zinc-700">Brief: </span>{planBrief.trim()}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-zinc-400">
            Seleccioná las opciones que querés generar — podés elegir varias. Cuando estén listas, entrá a cada una.
          </p>
          {Object.values(ideaGenState).some(s => s === "loading") && (
            <div className="flex items-center gap-1.5 text-xs text-brand-green font-medium shrink-0">
              <Loader2 className="h-3 w-3 animate-spin" /> Generando en paralelo...
            </div>
          )}
        </div>

        <div className="space-y-4">
          {plan.posts.map((slot) => (
            <PlanSlotCard
              key={slot.slot}
              slot={slot}
              onSelectOption={(idea) => handleSelectPlanOption(idea, slot)}
              onRegenerate={() => handleRegenerateSlot(slot)}
              isRegenerating={regeneratingSlot === slot.slot}
              getStatus={(id) => ideaGenState[id]}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── Phase: copy ───────────────────────────────────────────────────────────────

  if (phase === "copy" && selectedIdea) {
    const fmt        = FORMAT_CONFIG[selectedIdea.format] ?? { label: selectedIdea.format, cls: "bg-zinc-100 text-zinc-600 border-zinc-200" }
    const fromPlan   = selectedSlot !== null
    const isCarrusel = selectedIdea.format === "carrusel"
    const copySections = getCopySections(selectedIdea.format)

    return (
      <div className="max-w-2xl">
        <div className="flex items-center gap-2.5 mb-6 flex-wrap justify-between">
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setPhase(fromPlan ? "plan-view" : "ideas")}
              className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {fromPlan ? "Plan" : "Ideas"}
            </button>
            <span className="text-zinc-300">·</span>
            {fromPlan && selectedSlot && (
              <>
                <span className="text-xs text-zinc-400">{selectedSlot.narrativeBeat}</span>
                <span className="text-zinc-300">·</span>
              </>
            )}
            <span className="text-sm font-semibold text-zinc-700">{selectedIdea.title}</span>
            <span className={cn("inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border", fmt.cls)}>
              {fmt.label}
            </span>
            {generatingCopy && (
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-green" />
                Generando...
              </div>
            )}
          </div>
          {sistemaBtn}
        </div>

        <div className="space-y-3">
          {/* Standard sections (caption, captionCorto, hashtags, cta + reel guion or imagen prompt) */}
          {copySections.map(({ key, label, placeholder, rows }) => (
            <CopySectionCard
              key={key}
              sectionKey={key}
              label={label}
              value={copy[key] as string}
              placeholder={placeholder}
              rows={rows}
              isGenerating={generatingCopy}
              onChange={(v) => setCopy(prev => ({ ...prev, [key]: v }))}
              onRefine={(instruction) => handleRefine(key, instruction)}
            />
          ))}

          {/* Hero image — single-image formats (imagen / story / artículo) */}
          {copySections.some(s => s.key === "promptImagen") && copy.promptImagen.trim() && (
            <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 bg-zinc-50/70">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Imagen generada</span>
                {heroImage && (
                  <a href={heroImage} download="accedra-imagen.png"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all">
                    <Download className="h-3 w-3" /> Descargar
                  </a>
                )}
              </div>
              <div className="p-3">
                {heroImage ? (
                  <div className="space-y-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={heroImage} alt="Imagen generada" className="w-full rounded-lg border border-zinc-200" />
                    <button onClick={handleGenerateHeroImage} disabled={heroImageLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-500 hover:text-zinc-700 disabled:opacity-40">
                      {heroImageLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Regenerar imagen
                    </button>
                  </div>
                ) : (
                  <button onClick={handleGenerateHeroImage} disabled={heroImageLoading || generatingCopy}
                    className="flex items-center justify-center gap-2 w-full h-11 rounded-lg border border-dashed border-brand-green/40 text-sm font-semibold text-brand-green hover:bg-brand-green/[0.04] disabled:opacity-50">
                    {heroImageLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando imagen...</> : <><ImageIcon className="h-4 w-4" /> Generar imagen con IA</>}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Carousel slides section */}
          {isCarrusel && (
            <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 bg-zinc-50/70">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Prompts por slide
                  {copy.promptsCarrusel.length > 0 && (
                    <span className="ml-1.5 text-zinc-300">({copy.promptsCarrusel.length} slides)</span>
                  )}
                </span>
                {copy.promptsCarrusel.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleGenerateAllSlides}
                      disabled={Object.values(slideImageLoading).some(Boolean)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-brand-green hover:bg-brand-green/[0.06] transition-all disabled:opacity-40"
                    >
                      {Object.values(slideImageLoading).some(Boolean)
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <ImageIcon className="h-3 w-3" />}
                      Generar imágenes
                    </button>
                    <button
                      onClick={() => {
                        const all = copy.promptsCarrusel.join("\n\n---\n\n")
                        navigator.clipboard.writeText(all)
                        toast.success("Todos los prompts copiados")
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all"
                    >
                      <Copy className="h-3 w-3" /> Copiar todos
                    </button>
                  </div>
                )}
              </div>
              <div className="p-3 space-y-2.5">
                {copy.promptsCarrusel.length > 0
                  ? copy.promptsCarrusel.map((prompt, i) => (
                    <SlidePromptCard
                      key={i}
                      index={i}
                      content={prompt}
                      isGenerating={generatingCopy}
                      onChange={(v) => setCopy(prev => {
                        const s = [...prev.promptsCarrusel]; s[i] = v
                        return { ...prev, promptsCarrusel: s }
                      })}
                      onRefine={(instruction) => handleRefineSlide(i, instruction)}
                      imageUrl={slideImages[i]}
                      imageLoading={slideImageLoading[i]}
                      onGenerateImage={() => handleGenerateSlideImage(i)}
                    />
                  ))
                  : generatingCopy
                    ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-zinc-300">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Generando prompts de slides...</span>
                      </div>
                    )
                    : (
                      <p className="text-xs text-zinc-300 text-center py-4">Sin slides generados</p>
                    )
                }
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2.5 flex-wrap">
          <button
            onClick={handleCopyAll}
            disabled={generatingCopy || !(copy.caption || copy.guion || copy.promptImagen || copy.promptsCarrusel.length > 0)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40",
              copiedAll ? "bg-emerald-500 text-white" : "bg-zinc-900 text-white hover:bg-zinc-800"
            )}
          >
            {copiedAll ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedAll ? "Copiado" : "Copiar todo"}
          </button>
          <button
            onClick={() => {
              if (!selectedIdea) return
              setCopyCache(prev => { const n = { ...prev }; delete n[selectedIdea.id]; return n })
              const briefCtx = fromPlan && selectedSlot
                ? [planBrief.trim(), `Post ${selectedSlot.slot} del plan — ${selectedSlot.narrativeBeat} (${selectedSlot.timing})`].filter(Boolean).join(". ").slice(0, BRIEF_MAX_LEN)
                : brief.trim()
              generateCopy(selectedIdea, selectedSlot, briefCtx)
            }}
            disabled={generatingCopy}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-500 hover:text-zinc-800 hover:border-zinc-300 transition-all disabled:opacity-40"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Regenerar
          </button>
          <button
            onClick={() => { clearSession(); setPhase("config"); setIdeas([]); setPlan(null); setCopyCache({}); setIdeaGenState({}) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-400 hover:text-zinc-700 hover:border-zinc-300 transition-all"
          >
            <Sparkles className="h-3.5 w-3.5" /> Nuevo
          </button>
        </div>
      </div>
    )
  }

  return null
}
