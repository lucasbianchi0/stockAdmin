/**
 * Generador de contenido con IA — lo que comparten cliente y servidor.
 *
 * Dos módulos independientes, imagen y texto, que no se pisan con el banco de
 * piezas: el banco produce con el sistema visual del feed; esto es pedido libre.
 *
 * Pensado para crecer. Brand Kit ya entra como un interruptor por pedido;
 * historial, templates, edición de imágenes y video se apoyan en la misma tabla
 * (`generador_historial`), que guarda el pedido entero en `parametros`.
 */

export const BUCKET_GENERADOR = "generador"

/* ── Imagen ───────────────────────────────────────────────────────────────── */

export type Formato = { id: string; nombre: string; ancho: number; alto: number; grupo?: string }

/** Los estándar de redes. Medidas recomendadas por cada plataforma. */
export const FORMATOS_ESTANDAR: Formato[] = [
  { id: "ig-cuadrado", grupo: "Instagram", nombre: "Post cuadrado", ancho: 1080, alto: 1080 },
  { id: "ig-vertical", grupo: "Instagram", nombre: "Post vertical 4:5", ancho: 1080, alto: 1350 },
  { id: "ig-story", grupo: "Instagram", nombre: "Story / Reel", ancho: 1080, alto: 1920 },
  { id: "li-cuadrado", grupo: "LinkedIn", nombre: "Post cuadrado", ancho: 1200, alto: 1200 },
  { id: "li-horizontal", grupo: "LinkedIn", nombre: "Post horizontal", ancho: 1200, alto: 627 },
  { id: "li-portada", grupo: "LinkedIn", nombre: "Portada de página", ancho: 1128, alto: 191 },
  { id: "fb-post", grupo: "Facebook", nombre: "Post horizontal", ancho: 1200, alto: 630 },
  { id: "fb-portada", grupo: "Facebook", nombre: "Portada", ancho: 1640, alto: 624 },
  { id: "x-post", grupo: "X", nombre: "Post", ancho: 1600, alto: 900 },
  { id: "yt-miniatura", grupo: "YouTube", nombre: "Miniatura", ancho: 1280, alto: 720 },
  { id: "web-banner", grupo: "Web", nombre: "Banner 16:9", ancho: 1920, alto: 1080 },
]

export const MEDIDA_MIN = 64
export const MEDIDA_MAX = 4096

export const medidaValida = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= MEDIDA_MIN && n <= MEDIDA_MAX

/** Hasta cuántas alternativas se piden de un mismo pedido. */
export const MAX_VARIANTES = 4

/** Hasta cuántas imágenes de referencia viajan con un pedido. */
export const MAX_REFERENCIAS = 4

export type MotorImagen = "gemini" | "chatgpt"

export const MOTORES_IMAGEN: Array<{ id: MotorImagen; nombre: string; nota: string }> = [
  { id: "chatgpt", nombre: "GPT", nota: "gpt-image-2 vía OpenRouter. El de uso diario" },
  { id: "gemini", nombre: "Gemini", nota: "Gemini 3 Pro Image directo a Google" },
]

/**
 * Las relaciones de aspecto que acepta cada motor.
 *
 * Ninguno genera a una medida arbitraria en píxeles: reciben una relación. Se
 * pide la más cercana y el servidor recorta al tamaño exacto al final, así que
 * lo que se pierde en el recorte es poco y siempre de los bordes.
 */
export const ASPECTOS: Record<MotorImagen, string[]> = {
  gemini: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
  chatgpt: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"],
}

/** La relación soportada más parecida a ancho × alto (comparada en escala log). */
export function aspectoMasCercano(ancho: number, alto: number, motor: MotorImagen): string {
  const objetivo = Math.log(ancho / alto)
  let mejor = "1:1"
  let distancia = Infinity
  for (const a of ASPECTOS[motor]) {
    const [w, h] = a.split(":").map(Number)
    const d = Math.abs(Math.log(w / h) - objetivo)
    if (d < distancia) {
      distancia = d
      mejor = a
    }
  }
  return mejor
}

export type ImagenGenerada = {
  id: string
  url: string | null
  /** JPEG chico para las grillas. Cae a `url` si la imagen es anterior a las miniaturas. */
  miniatura: string | null
  prompt: string
  operacion: OperacionImagen
  ancho: number
  alto: number
  modelo: string | null
  grupoId: string | null
  origenId: string | null
  createdAt: string
}

/* ── Texto ────────────────────────────────────────────────────────────────── */

/**
 * Los tipos predefinidos. `guia` es lo que se le dice al modelo sobre la forma
 * del texto; la intención la pone siempre el prompt libre.
 */
export const TIPOS_TEXTO = [
  {
    id: "libre",
    nombre: "Libre",
    guia: "Seguí exactamente lo que pide la instrucción, sin forzar ningún formato.",
  },
  {
    id: "linkedin",
    nombre: "Post LinkedIn",
    guia: "Post de LinkedIn listo para publicar: primera línea que frene el scroll, párrafos cortos y escaneables, cierre con pregunta o CTA suave. Al final, 3 a 5 hashtags.",
  },
  {
    id: "instagram",
    nombre: "Instagram",
    guia: "Caption de Instagram: hook en la primera línea, texto breve con saltos de línea, emojis con moderación (es B2B), CTA y al final 6 a 10 hashtags.",
  },
  {
    id: "email",
    nombre: "Email",
    guia: "Email listo para enviar. Empezá con una línea 'Asunto: …' y otra 'Preheader: …', después el cuerpo con saludo, desarrollo breve, un único CTA claro y firma.",
  },
  {
    id: "newsletter",
    nombre: "Newsletter",
    guia: "Newsletter: asunto, introducción corta, dos a cuatro secciones con subtítulo, y cierre con CTA. Usá Markdown para los subtítulos.",
  },
  {
    id: "articulo",
    nombre: "Artículo",
    guia: "Artículo de blog: título, bajada, introducción, secciones con subtítulos (Markdown ##), y conclusión con CTA. Pensado para lectura y SEO, sin relleno.",
  },
  {
    id: "titulo",
    nombre: "Título / bajada",
    guia: "Proponé 5 opciones numeradas. Cada una con 'Título:' y 'Bajada:' en líneas separadas. Títulos cortos y concretos.",
  },
  {
    id: "cta",
    nombre: "CTA",
    guia: "Proponé 8 llamados a la acción numerados, de distintos estilos (directo, beneficio, urgencia suave, curiosidad). Cortos: una línea cada uno.",
  },
  {
    id: "guion",
    nombre: "Guion",
    guia: "Guion de video corto: HOOK (primeros 3 segundos), DESARROLLO en 3 o 4 puntos, CIERRE con CTA. Indicá entre corchetes lo que se ve en pantalla. Para decir a cámara, en lenguaje oral.",
  },
] as const

export type TipoTexto = (typeof TIPOS_TEXTO)[number]["id"]

export const CANALES_TEXTO = ["LinkedIn", "Instagram", "Facebook", "Email", "Sitio web", "WhatsApp", "YouTube"]

export const OBJETIVOS_TEXTO = [
  "Reconocimiento de marca",
  "Generar leads",
  "Educar",
  "Prueba social",
  "Anunciar novedad",
  "Invitar a un evento",
]

export const TONOS_TEXTO = [
  "Profesional y cercano",
  "Formal",
  "Inspirador",
  "Directo y comercial",
  "Didáctico",
  "Descontracturado",
]

export const EXTENSIONES_TEXTO = [
  { id: "corta", nombre: "Corta", guia: "Breve: lo mínimo para que funcione." },
  { id: "media", nombre: "Media", guia: "Extensión media, la habitual para el formato." },
  { id: "larga", nombre: "Larga", guia: "Desarrollada: más profundidad y ejemplos, sin relleno." },
]

export const IDIOMAS_TEXTO = ["Español (Argentina)", "Español neutro", "Inglés", "Portugués"]

export type TextoGenerado = {
  id: string
  prompt: string
  texto: string
  /** El tipo de contenido (linkedin, email…). */
  tipoTexto: string
  createdAt: string
}

/* ── Operaciones sobre imágenes ───────────────────────────────────────────── */

/**
 * Qué se le hace a una imagen.
 *
 * - generar: desde cero (con referencias opcionales).
 * - feed: con uno de los templates del banco; el código compone el texto.
 * - modificar: edita la imagen entera según una instrucción.
 * - zona: edita solo el área pintada; el resto queda idéntico, píxel a píxel.
 * - adaptar: la lleva a otro formato extendiendo la escena hacia los bordes.
 * - logo: compone el logo oficial encima. Sin IA, no cuesta nada.
 */
export type OperacionImagen = "generar" | "feed" | "modificar" | "zona" | "adaptar" | "logo"

export const OPERACION_LABEL: Record<OperacionImagen, string> = {
  generar: "Generada",
  feed: "Template del feed",
  modificar: "Modificada",
  zona: "Zona editada",
  adaptar: "Adaptada",
  logo: "Con logo",
}

/* ── Logo (Brand Kit) ─────────────────────────────────────────────────────── */

export const FAMILIAS_LOGO = [
  { id: "logo", nombre: "Logotipo", ratio: 1073 / 160 },
  { id: "lockup", nombre: "Con bajada", ratio: 1073 / 263 },
  { id: "apilado", nombre: "Apilado", ratio: 1073 / 485 },
  { id: "isotipo", nombre: "Isotipo", ratio: 1 },
] as const

export type FamiliaLogo = (typeof FAMILIAS_LOGO)[number]["id"]

/** "auto" elige navy o blanco según lo claro que sea el fondo donde cae. */
export const TONOS_LOGO = [
  { id: "auto", nombre: "Automático" },
  { id: "navy", nombre: "Navy" },
  { id: "blanco", nombre: "Blanco" },
  { id: "placa-navy", nombre: "Placa navy" },
  { id: "placa-azul", nombre: "Placa azul" },
] as const

export type TonoLogo = (typeof TONOS_LOGO)[number]["id"]

export const POSICIONES_LOGO = [
  { id: "sup-izq", nombre: "Arriba izq." },
  { id: "sup-centro", nombre: "Arriba centro" },
  { id: "sup-der", nombre: "Arriba der." },
  { id: "inf-izq", nombre: "Abajo izq." },
  { id: "inf-centro", nombre: "Abajo centro" },
  { id: "inf-der", nombre: "Abajo der." },
] as const

export type PosicionLogo = (typeof POSICIONES_LOGO)[number]["id"]

export const TAMANOS_LOGO = [
  { id: "s", nombre: "Chico", escala: 0.075 },
  { id: "m", nombre: "Medio", escala: 0.1 },
  { id: "l", nombre: "Grande", escala: 0.135 },
] as const

export type TamanoLogo = (typeof TAMANOS_LOGO)[number]["id"]

export type ConfigLogo = {
  familia: FamiliaLogo
  tono: TonoLogo
  posicion: PosicionLogo
  tamano: TamanoLogo
}

export const LOGO_DEFAULT: ConfigLogo = { familia: "logo", tono: "auto", posicion: "inf-izq", tamano: "m" }

/** Valida lo que llega del cliente; null si no es una configuración de logo. */
export function configLogo(v: unknown): ConfigLogo | null {
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>
  const en = <T extends { id: string }>(lista: readonly T[], x: unknown) => lista.find((i) => i.id === x)?.id
  const familia = en(FAMILIAS_LOGO, o.familia)
  const tono = en(TONOS_LOGO, o.tono)
  const posicion = en(POSICIONES_LOGO, o.posicion)
  const tamano = en(TAMANOS_LOGO, o.tamano)
  if (!familia || !tono || !posicion || !tamano) return null
  return { familia, tono, posicion, tamano } as ConfigLogo
}

/**
 * La caja del logo dentro de una imagen, en píxeles.
 *
 * Por superficie y no por ancho: un isotipo cuadrado y un logotipo de 6,7:1 al
 * mismo "Medio" se ven del mismo peso. Lo usan el servidor para componer y la
 * vista previa del navegador, así que los dos dibujan exactamente lo mismo.
 */
export function cajaLogo(ancho: number, alto: number, c: ConfigLogo) {
  const placa = c.tono.startsWith("placa")
  const fam = FAMILIAS_LOGO.find((f) => f.id === c.familia)!
  // Las versiones con placa traen su propio margen interno y son más anchas.
  const ratio = placa ? { logo: 1213 / 287, lockup: 1317 / 482, apilado: 1, isotipo: 1 }[c.familia] : fam.ratio
  const lado = Math.min(ancho, alto)
  const escala = TAMANOS_LOGO.find((t) => t.id === c.tamano)!.escala * (placa ? 1.15 : 1)
  const w = Math.round(lado * escala * Math.sqrt(ratio))
  const h = Math.round(w / ratio)
  const margen = Math.round(lado * 0.045)
  const [v, hzt] = c.posicion.split("-")
  const left = hzt === "izq" ? margen : hzt === "der" ? ancho - margen - w : Math.round((ancho - w) / 2)
  const top = v === "sup" ? margen : alto - margen - h
  return { left, top, w, h }
}

/** El archivo del logo para una familia y un tono ya resuelto (sin "auto"). */
export const archivoLogo = (familia: FamiliaLogo, tono: Exclude<TonoLogo, "auto">) =>
  `/brand/accedra-${familia}-${tono}.svg`

/* ── Contexto de marca para textos ────────────────────────────────────────── */

/** Qué recorte del Brand Kit acompaña a un texto. Son las disciplinas del kit. */
export const CONTEXTOS_MARCA = [
  { id: "contenido", nombre: "Contenido", nota: "Posts, artículos, newsletters" },
  { id: "marketing", nombre: "Marketing", nota: "Campañas, anuncios, ángulos" },
  { id: "comercial", nombre: "Comercial", nota: "Mails a prospectos, propuestas" },
  { id: "institucional", nombre: "Institucional", nota: "Prensa, licitaciones, formales" },
] as const

/* ── Historial ────────────────────────────────────────────────────────────── */

export type EntradaHistorial =
  | ({ tipo: "imagen"; parametros: Record<string, unknown> } & ImagenGenerada)
  | ({ tipo: "texto"; parametros: Record<string, unknown>; modelo: string | null } & TextoGenerado)
