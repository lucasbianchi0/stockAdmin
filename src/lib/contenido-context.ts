// ─── Brand identity ─────────────────────────────────────────────────────────
// Nada de marca se define acá: todo se DERIVA de `@/lib/brand-kit`, que es la
// fuente única. Antes este archivo tenía su propia copia de la paleta, del tono
// y del prompt, y ya había divergido —seguía usando el azul viejo #2B6AC8 y
// listaba Inter como única tipografía— mientras el Brand Kit decía otra cosa.

import {
  BLOQUES_CONTEXTO,
  COMPOSICION,
  EMPRESA,
  PALETA,
  PROMPTS,
  REGLAS_LOGO,
  TIPOGRAFIA,
  armarPrompt,
} from "@/lib/brand-kit"

export const BRAND_NAME = EMPRESA.nombreComercial
export const BRAND_DOMAIN = EMPRESA.dominio

const color = (nombre: string) => PALETA.find((c) => c.nombre === nombre)!

const AZUL = color("Azul Accedra")
const NAVY_FONDO = color("Navy fondo")
const GRIS_SUPERFICIE = color("Gris superficie")

export const ACCENT_HEX = AZUL.hex

/**
 * El contexto de marca que se inyecta en cada generación.
 *
 * Es el prompt de la disciplina "Contenido" del Brand Kit: identidad,
 * servicios, buyer personas, tono con pares mal/bien, boilerplate, prueba
 * social citable y los claims prohibidos. Reemplaza al resumen escrito a mano
 * que vivía en este archivo — el mismo que decía "profesional pero ameno" y
 * nada más, que es demasiado poco para corregir a un modelo.
 */
export const ACCEDRA_BRAND_CONTEXT = armarPrompt(
  PROMPTS.find((p) => p.id === "contenido") ?? PROMPTS[0]
)

// Alias histórico, para no romper referencias sueltas.
export const REFII_BRAND_CONTEXT = ACCEDRA_BRAND_CONTEXT

export const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  facebook: "Facebook",
}

export const AUDIENCE_LABELS: Record<string, string> = {
  decisores: "decisores de tecnología (CTOs, CIOs, gerentes de IT, infraestructura y sistemas de empresas medianas y grandes en Argentina)",
  negocio: "líderes de negocio (dueños, directores y gerentes generales que evalúan inversiones en tecnología para su empresa)",
  ambos: "toda la audiencia B2B de Accedra: tanto decisores técnicos como líderes de negocio",
}

export const OBJECTIVE_LABELS: Record<string, string> = {
  awareness: "awareness — que las empresas sepan que Accedra existe y qué problemas de tecnología resuelve",
  conversion: "conversión — que contacten a Accedra (WhatsApp, formulario o reunión) para su proyecto de IT",
  educacion: "educación — explicar de forma simple cómo funcionan sus soluciones (firma digital, redes, ciberseguridad, servicios gestionados)",
  prueba_social: "prueba social — mostrar casos, clientes (Mapfre, Andreani, Finning) o partners (Cisco, Microsoft) que respaldan a Accedra",
}

// ─── Format config ────────────────────────────────────────────────────────────

export const FORMATS_BY_PLATFORM: Record<string, Array<{ id: string; label: string; emoji: string }>> = {
  instagram: [
    { id: "imagen",   label: "Imagen",   emoji: "🖼️" },
    { id: "carrusel", label: "Carrusel", emoji: "📑" },
    { id: "reel",     label: "Reel",     emoji: "🎬" },
    { id: "story",    label: "Story",    emoji: "⭕" },
  ],
  tiktok: [
    { id: "video",     label: "Video corto", emoji: "📱" },
    { id: "duet",      label: "Duet",        emoji: "🤝" },
    { id: "tendencia", label: "Tendencia",   emoji: "🔥" },
  ],
  linkedin: [
    { id: "imagen",   label: "Imagen",   emoji: "🖼️" },
    { id: "carrusel", label: "Carrusel", emoji: "📑" },
    { id: "video",    label: "Video",    emoji: "🎬" },
    { id: "articulo", label: "Artículo", emoji: "📝" },
  ],
  facebook: [
    { id: "imagen",   label: "Imagen",   emoji: "🖼️" },
    { id: "video",    label: "Video",    emoji: "🎬" },
    { id: "carrusel", label: "Carrusel", emoji: "📑" },
    { id: "story",    label: "Story",    emoji: "⭕" },
  ],
}

// Maps user-facing format choice → the value stored in Idea.format JSON
export const FORMAT_TO_IDEA_FORMAT: Record<string, string> = {
  imagen:    "imagen",
  carrusel:  "carrusel",
  reel:      "reel",
  story:     "story",
  video:     "reel",
  duet:      "reel",
  tendencia: "reel",
  articulo:  "articulo",
}

// Human-readable format descriptions for AI prompts
export const FORMAT_PROMPT_LABELS: Record<string, string> = {
  imagen:    "imagen estática",
  carrusel:  "carrusel de múltiples slides",
  reel:      "Reel / video corto vertical",
  story:     "Story de 24 horas",
  video:     "video corto vertical",
  duet:      "video tipo Duet (colaboración con otro creador)",
  tendencia: "video siguiendo una tendencia viral actual",
  articulo:  "artículo de texto largo (LinkedIn Article)",
}

// Valid Idea.format values per platform (used in the AI prompt constraint)
export const VALID_IDEA_FORMATS_BY_PLATFORM: Record<string, string[]> = {
  instagram: ["imagen", "carrusel", "reel", "story"],
  tiktok:    ["reel"],
  linkedin:  ["imagen", "carrusel", "articulo"],
  facebook:  ["imagen", "carrusel", "reel", "story"],
}

// All valid format preference values (server-side whitelist)
export const VALID_FORMAT_PREFERENCES = new Set([
  "sin-preferencia",
  "imagen", "carrusel", "reel", "story",
  "video", "duet", "tendencia", "articulo",
])

// All valid platforms (server-side whitelist)
export const VALID_PLATFORMS = new Set(["instagram", "tiktok", "linkedin", "facebook"])

// All valid audiences (server-side whitelist)
export const VALID_AUDIENCES = new Set(["decisores", "negocio", "ambos"])

// All valid objectives (server-side whitelist)
export const VALID_OBJECTIVES = new Set(["awareness", "conversion", "educacion", "prueba_social"])

export const BRIEF_MAX_LEN = 500
// El contexto de marca pasó de un resumen de 450 palabras al prompt completo de
// la disciplina "Contenido" del kit (~12.600 caracteres). Con el tope viejo de
// 2.000, cualquiera que abriera el editor y guardara se llevaba el prompt
// cortado a un tercio sin ningún aviso.
export const BRAND_PROMPT_MAX_LEN = 16000
export const MAX_SLIDES = 10
export const MIN_SLIDES = 2
export const DEFAULT_SLIDES = 5

function stripControlChars(s: string): string {
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
}

export function sanitizeBrief(input: unknown): string {
  if (typeof input !== "string") return ""
  return stripControlChars(input).slice(0, BRIEF_MAX_LEN).trim()
}

export function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== "string") return ""
  return stripControlChars(input).slice(0, maxLen).trim()
}

export const REEL_FORMATS  = new Set(["reel", "video", "duet", "tendencia"])
export const CAROUSEL_FORMATS = new Set(["carrusel"])

export const VALID_PLAN_FORMATS = new Set([
  "mixto", "imagen", "carrusel", "reel", "story", "video", "articulo",
])

/**
 * Base visual para prompts de imagen. En inglés porque es donde rinden los
 * modelos, y con los hex del kit interpolados: si mañana cambia el azul, cambia
 * acá solo. La versión anterior tenía los colores escritos a mano y por eso
 * seguía pidiendo el azul viejo mucho después de que la marca lo cambiara.
 */
export const IMAGE_PROMPT_BASE = `clean corporate background (light ${GRIS_SUPERFICIE.hex} or deep navy ${NAVY_FONDO.hex}), ${AZUL.hex} blue accents used once and only once, 1080x1080px, "Accedra" wordmark bottom right with "accedra.com.ar" below it, premium corporate tech aesthetic, professional, minimal, lots of negative space`

/** El bloque de estilo que se le pega a TODA imagen para que la serie sea una. */
export const IMAGE_STYLE_SUFFIX = `

— ESTILO DE MARCA ACCEDRA (aplicar idéntico en toda la serie) —
${COMPOSICION.promptImagen}

Reglas de composición:
${COMPOSICION.reglas.map((r) => `- ${r}`).join("\n")}

Paleta (no usar otros colores vivos):
${PALETA.map((c) => `- ${c.nombre} ${c.hex}: ${c.uso}`).join("\n")}

PROHIBIDO renderizar texto dentro de la imagen: nada de carteles, marcas, nombres de empresa, títulos ni palabras sueltas. Ningún logo, ni de Accedra ni de terceros. El copy y el wordmark se montan después en el diseño.
Si la escena incluye pantallas, cartelería o documentos, van en blanco o desenfocados.
Mezcla: ${COMPOSICION.estilo}. Referencias: ${COMPOSICION.referencias}.`

/**
 * Lo que muestra la pestaña de diseño del estudio. Todo sale del Brand Kit:
 * esta constante ya no decide nada, solo le da forma de tarjeta a lo que el kit
 * define.
 */
export const DESIGN_SYSTEM = {
  colors: PALETA.map((c) => ({
    name: c.nombre,
    hex: c.hex,
    textColor: c.textoSobre,
    usage: c.uso,
  })),
  typography: {
    fontFamilyLabel: `${TIPOGRAFIA.display.nombre} + ${TIPOGRAFIA.texto.nombre}`,
    fontFamily: `${TIPOGRAFIA.texto.nombre}, -apple-system, BlinkMacSystemFont, sans-serif`,
    philosophy: `${TIPOGRAFIA.display.porque.split(":")[0]} · títulos apretados · interlineado amplio · máximo dos pesos por pieza`,
    reglas: TIPOGRAFIA.reglas,
    weights: [
      { value: 400, name: "Regular",  sample: "Tecnología de misión crítica, con valor humano." },
      { value: 500, name: "Medium",   sample: "Tecnología de misión crítica, con valor humano." },
      { value: 600, name: "Semibold", sample: "Tecnología de misión crítica, con valor humano." },
      { value: 700, name: "Bold",     sample: "ACCEDRA" },
    ],
    sizes: TIPOGRAFIA.escala.map((e) => ({ px: e.px, label: e.label, use: e.uso })),
  },
  backgrounds: [
    {
      name: GRIS_SUPERFICIE.nombre,
      hex: GRIS_SUPERFICIE.hex,
      recommended: true,
      textColor: color("Navy Accedra").hex,
      description: GRIS_SUPERFICIE.uso,
    },
    {
      name: NAVY_FONDO.nombre,
      hex: NAVY_FONDO.hex,
      recommended: false,
      textColor: color("Gris texto").hex,
      description: NAVY_FONDO.uso,
    },
  ],
  composition: {
    rules: COMPOSICION.reglas,
    style: COMPOSICION.estilo,
    references: COMPOSICION.referencias,
  },
  logo: {
    rules: REGLAS_LOGO.si,
    prohibiciones: REGLAS_LOGO.no,
  },
  imagePromptFormula: COMPOSICION.promptImagen,
  /** Bloques del prompt de marca, por si se quiere ver de dónde sale. */
  bloques: BLOQUES_CONTEXTO.map((b) => b.nombre),
}
