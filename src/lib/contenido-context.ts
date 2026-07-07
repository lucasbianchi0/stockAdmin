// ─── Brand identity ─────────────────────────────────────────────────────────
// Everything here is Accedra-specific. It's the single source of truth for the
// brand context injected into every AI generation and for the design-system tab.

export const BRAND_NAME = "Accedra"
export const BRAND_DOMAIN = "accedra.com.ar"
export const ACCENT_HEX = "#2B6AC8"

export const ACCEDRA_BRAND_CONTEXT = `
Sos el social media manager de Accedra, una empresa argentina de servicios y soluciones de tecnología (IT) con sede en Buenos Aires.

Qué es Accedra: un integrador tecnológico B2B que provee infraestructura, servicios y proyectos integrales de informática para aplicaciones de misión crítica. Le vende a empresas medianas y grandes — nunca a consumidores finales.

Qué hace:
- Networking e infraestructura: switching, routing, wireless, telefonía IP, cableado estructurado, contingencia.
- Ciberseguridad: soluciones Cisco, Palo Alto, Umbrella, Cloud Security.
- Firma digital y biométrica (su diferenciador): firma digital biométrica, factoring digital, eSignAnyWhere, gestión de identidad.
- Consultoría y colaboración: Power BI, Dynamics 365, SharePoint, Office 365, gestión documental.
- Servicios gestionados: monitoreo, soporte técnico y mesa de ayuda.

Partners: Cisco, Microsoft, Dell EMC, Palo Alto Networks, Nutanix, APC, IBM, Namirial, Gemalto.
Clientes de referencia: Mapfre, Andreani y Finning — cuentas enterprise que funcionan como prueba social fuerte.

Identidad de marca:
- Nombre: Accedra
- Dominio: accedra.com.ar
- Posicionamiento: especialistas en tecnología de misión crítica, con alto valor humano y la cercanía de una PyME.
- Color primario: #2B6AC8 (azul corporativo)
- Estilo visual: corporativo, sobrio, profesional, moderno y limpio — transmite confianza y expertise técnica.
- Tono de voz: profesional pero ameno y humano, español argentino, serio sin ser acartonado, claro y directo. Nada de jerga vacía ni humo.

Objetivo de comunicación: construir presencia digital con una imagen seria y confiable, mostrando quiénes son y qué hacen. LinkedIn es el canal prioritario por ser un negocio B2B.
`.trim()

// Kept as an alias so any leftover reference keeps working.
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
export const BRAND_PROMPT_MAX_LEN = 2000
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

// Visual base string reused in image prompts (kept in English for DALL-E / Midjourney).
export const IMAGE_PROMPT_BASE = `clean corporate white background #F4F6F9 (or deep navy #0B1628 for dark variants), #2B6AC8 blue accents, 1080x1080px, "Accedra" wordmark bottom right, "accedra.com.ar" below it, premium corporate tech aesthetic, professional, minimal, lots of negative space`

export const DESIGN_SYSTEM = {
  colors: [
    { name: "Azul Accedra",    hex: "#2B6AC8", textColor: "#ffffff", usage: "Único accent · CTAs · Highlights · Links" },
    { name: "Azul Profundo",   hex: "#0B1628", textColor: "#ffffff", usage: "Fondo dark · Backgrounds corporativos" },
    { name: "Gris Claro",      hex: "#F4F6F9", textColor: "#1a2332", usage: "Fondo claro · Superficies limpias" },
    { name: "Texto oscuro",    hex: "#1A2332", textColor: "#ffffff", usage: "Texto principal sobre fondos claros" },
    { name: "Gris muted",      hex: "#7A8699", textColor: "#ffffff", usage: "Textos secundarios · Subtítulos" },
    { name: "Blanco puro",     hex: "#FFFFFF", textColor: "#0B1628", usage: "Texto y logo sobre fondos dark" },
  ],
  typography: {
    fontFamilyLabel: "Inter",
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
    philosophy: "Sobrio y profesional · tracking normal · interlineado amplio · claro · sin bold agresivo",
    weights: [
      { value: 300, name: "Light",    sample: "Tecnología de misión crítica, con valor humano." },
      { value: 400, name: "Regular",  sample: "Tecnología de misión crítica, con valor humano." },
      { value: 500, name: "Medium",   sample: "Tecnología de misión crítica, con valor humano." },
      { value: 600, name: "Semibold", sample: "Tecnología de misión crítica, con valor humano." },
      { value: 700, name: "Bold",     sample: "ACCEDRA" },
    ],
    sizes: [
      { px: "11px", label: "XS",   use: "Labels, chips" },
      { px: "13px", label: "SM",   use: "Textos secundarios" },
      { px: "15px", label: "BASE", use: "Cuerpo de texto" },
      { px: "20px", label: "LG",   use: "Subtítulos" },
      { px: "26px", label: "XL",   use: "Títulos" },
      { px: "36px", label: "2XL",  use: "Titulares" },
      { px: "52px", label: "3XL",  use: "Hero text" },
    ],
  },
  backgrounds: [
    { name: "Gris Claro", hex: "#F4F6F9", recommended: true,  textColor: "#1a2332", description: "Fondo claro corporativo · limpio y profesional" },
    { name: "Azul Profundo", hex: "#0B1628", recommended: false, textColor: "#ffffff", description: "Fondo dark corporativo · high-contrast tech" },
  ],
  composition: {
    rules: [
      "Mucho espacio vacío — transmite orden y solidez",
      "No saturar el canvas: aire arriba, abajo y a los costados",
      "Concepto o elemento hero centrado o ligeramente desplazado",
      "Frase simple, clara, con buen tracking y leading",
      "Azul Accedra como único accent — jamás dos colores vivos",
      "Sombras suaves, líneas limpias, nada estridente",
    ],
    style: "70% corporate tech premium · 20% editorial profesional · 10% enterprise B2B",
    references: "Microsoft · IBM · Cisco · Linear · Vercel · comunicación enterprise premium",
  },
  logo: {
    rules: [
      "Wordmark 'Accedra' alineado bottom-right",
      "'accedra.com.ar' debajo del wordmark, misma alineación",
      "Blanco puro (#FFFFFF) sobre fondos oscuros",
      "Azul Accedra (#2B6AC8) sobre fondos claros",
      "Logo sutil — nunca protagonista, siempre prolijo",
    ],
  },
  imagePromptFormula: `Premium corporate tech aesthetic, clean light background #F4F6F9, soft even studio light, ultra-clean composition, large negative space, modern sans-serif typography, subtle shadows, matte finish, enterprise B2B feel, blue accent #2B6AC8, photorealistic, much air around subject, professional and trustworthy.`,
}
