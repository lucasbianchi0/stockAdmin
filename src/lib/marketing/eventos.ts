/**
 * Eventos y certificados — tipos, límites y las reglas que valen en las dos
 * puntas.
 *
 * Sin imports de servidor: lo usan el editor, la pieza del certificado, la vista
 * de impresión y los handlers de API. Mismo criterio que popups.ts: el endpoint
 * rechaza exactamente lo que el formulario no deja escribir.
 *
 * EL CERTIFICADO ES UNA PIEZA CON MEDIDAS
 *
 * Un A4 apaisado con un nombre, un título, seis contenidos y seis logos. Los
 * topes de acá no son una precaución: son lo que entra sin achicar la letra
 * hasta que no se lea. El nombre es lo único que se adapta —ver
 * `tamanoDelNombre()`—, porque es lo único que no elegimos nosotros.
 */

/* ── Vocabulario ──────────────────────────────────────────────────────────── */

export const TIPOS = ["workshop", "webinar", "capacitacion", "charla", "meetup", "lanzamiento"] as const
export type Tipo = (typeof TIPOS)[number]

export const TIPO_LABEL: Record<Tipo, string> = {
  workshop: "Workshop",
  webinar: "Webinar",
  capacitacion: "Capacitación",
  charla: "Charla",
  meetup: "Meetup",
  lanzamiento: "Lanzamiento",
}

export const MODALIDADES = ["presencial", "online", "hibrido"] as const
export type Modalidad = (typeof MODALIDADES)[number]

export const MODALIDAD_LABEL: Record<Modalidad, string> = {
  presencial: "Presencial",
  online: "Online",
  hibrido: "Híbrido",
}

/**
 * A qué solución de Accedra pertenece el evento. Los slugs son los de
 * /soluciones/<slug> del sitio, que agrupa, filtra y pinta con estos valores.
 * Un evento puede tener varias. Coinciden con el `check` de la migración.
 */
export const CATEGORIAS = ["networking", "firma-biometrica", "consultoria", "seguridad", "software-ai"] as const
export type Categoria = (typeof CATEGORIAS)[number]

export const CATEGORIA_LABEL: Record<Categoria, string> = {
  networking: "Networking",
  "firma-biometrica": "Firma biométrica",
  consultoria: "Consultoría",
  seguridad: "Ciberseguridad",
  "software-ai": "IA & Software",
}

/** El color de identidad de cada solución: COLORES_SOLUCION del brand kit. */
export const CATEGORIA_COLOR: Record<Categoria, string> = {
  networking: "#3B82F6",
  "firma-biometrica": "#7C6CF6",
  consultoria: "#06B6D4",
  seguridad: "#10B981",
  "software-ai": "#B45CF2",
}

/* ── Marcas ───────────────────────────────────────────────────────────────── */

export type Marca = {
  id: string
  nombre: string
  logoUrl: string
  logoAncho: number | null
  logoAlto: number | null
}

/* ── El certificado ───────────────────────────────────────────────────────── */

/**
 * `azul` es el de marca, el que se usa. `noche` es para cuando el certificado
 * se va a imprimir en papel y el azul saturado sale lavado: navy profundo con el
 * azul sólo en los acentos.
 */
export const TEMAS = ["azul", "noche"] as const
export type Tema = (typeof TEMAS)[number]

export const TEMA_LABEL: Record<Tema, string> = {
  azul: "Azul Accedra",
  noche: "Navy profundo",
}

export type Firmante = {
  nombre: string
  cargo: string
  /** Objeto en el bucket (`firmas/<uuid>.png`) o vacío. Es lo que se guarda. */
  firmaRuta: string
  /** URL pública armada al leer. No se guarda: ver `paraGuardar()`. */
  firmaUrl: string
}

export const FIRMANTE_VACIO: Firmante = { nombre: "", cargo: "", firmaRuta: "", firmaUrl: "" }

export type Certificado = {
  tema: Tema
  /** "Certificado de asistencia". Podría ser "de aprobación", "de participación". */
  titulo: string
  /** Vacío = el título del evento. Se cambia cuando el nombre público del evento
   *  es de marketing ("Copilot Day") y el certificado necesita el formal. */
  tituloCurso: string
  horas: number
  /** Vacío = la fecha del evento en largo. Se escribe a mano para los que
   *  duran varios días sueltos: "6, 13 y 20 de octubre de 2026". */
  fechaTexto: string
  contenidos: string[]
  /**
   * `false` = el certificado muestra las tecnologías del evento.
   * `true`  = muestra las de `marcaIds`, que puede quedar vacío a propósito.
   *
   * Hace falta la bandera: con sólo la lista, "ninguna" y "las del evento" eran
   * la misma lista vacía, y sacar el último logo lo volvía a traer del evento.
   */
  marcasPropias: boolean
  marcaIds: string[]
  firmantes: Firmante[]
  mostrarContenidos: boolean
  mostrarTecnologias: boolean
  mostrarCodigo: boolean
}

export const CERTIFICADO_VACIO: Certificado = {
  tema: "azul",
  titulo: "Certificado de asistencia",
  tituloCurso: "",
  horas: 3,
  fechaTexto: "",
  contenidos: [],
  marcasPropias: false,
  marcaIds: [],
  firmantes: [{ nombre: "Carlos Omar Bianchi", cargo: "Director · Accedra IT Solutions", firmaRuta: "", firmaUrl: "" }],
  mostrarContenidos: false,
  mostrarTecnologias: true,
  mostrarCodigo: true,
}

/* ── El evento ────────────────────────────────────────────────────────────── */

export type Orador = { nombre: string; cargo: string; empresa: string }

export type Evento = {
  id: string
  slug: string
  publicado: boolean
  destacado: boolean
  tipo: Tipo
  modalidad: Modalidad
  titulo: string
  resumen: string
  descripcion: string
  tags: string[]
  categorias: Categoria[]
  /** ISO. */
  inicio: string
  /** ISO o vacío. */
  fin: string
  lugar: string
  inscripcionUrl: string
  cupo: number | null
  precio: string
  oradores: Orador[]
  marcaIds: string[]
  portadaUrl: string | null
  portadaAncho: number | null
  portadaAlto: number | null
  certificado: Certificado
  asistentes: number
  actualizado: string
}

export type Asistente = {
  id: string
  eventoId: string
  nombre: string
  email: string
  empresa: string
  horas: number | null
  codigo: string
  creado: string
}

/* ── Límites ──────────────────────────────────────────────────────────────── */

/** Los mismos números que los `check` de la migración. Si cambian, cambian en
 *  los dos lados. */
export const LIMITES = {
  titulo: 90,
  resumen: 220,
  descripcion: 4000,
  tag: 24,
  tags: 8,
  lugar: 120,
  url: 500,
  precio: 40,
  oradores: 4,
  oradorCampo: 60,
  marcas: 6,
  marcaNombre: 40,

  certTitulo: 40,
  certCurso: 90,
  certFecha: 60,
  /** Seis contenidos entran en la columna sin achicar la letra. */
  contenidos: 6,
  contenido: 70,
  firmantes: 2,
  firmanteCampo: 50,

  asistenteNombre: 80,
  asistenteEmail: 160,
  asistenteEmpresa: 80,
  /** Pegar una planilla de 500 filas por error no puede crear 500 certificados. */
  asistentesPorCarga: 300,
} as const

export const HORAS_MAX = 999

/** Las tecnologías que muestra un certificado, ya resuelta la herencia del evento. */
export function marcasDelCertificado(c: Pick<Certificado, "marcasPropias" | "marcaIds">, delEvento: string[]): string[] {
  return c.marcasPropias ? c.marcaIds : delEvento
}

/* ── Guardas ──────────────────────────────────────────────────────────────── */

export function esTipo(v: unknown): v is Tipo {
  return typeof v === "string" && (TIPOS as readonly string[]).includes(v)
}
export function esModalidad(v: unknown): v is Modalidad {
  return typeof v === "string" && (MODALIDADES as readonly string[]).includes(v)
}
export function esCategoria(v: unknown): v is Categoria {
  return typeof v === "string" && (CATEGORIAS as readonly string[]).includes(v)
}

/** Las categorías válidas, sin repetir y en el orden canónico. */
export function categoriasDe(v: unknown): Categoria[] {
  if (!Array.isArray(v)) return []
  return CATEGORIAS.filter((c) => v.includes(c))
}
export function esTema(v: unknown): v is Tema {
  return typeof v === "string" && (TEMAS as readonly string[]).includes(v)
}

export function urlValida(url: string): boolean {
  return /^(https?:\/\/|\/|mailto:)/.test(url.trim())
}

/* ── Borrador del editor ──────────────────────────────────────────────────── */

export type BorradorEvento = Omit<
  Evento,
  "id" | "portadaUrl" | "portadaAncho" | "portadaAlto" | "asistentes" | "actualizado"
>

export function borradorVacio(): BorradorEvento {
  return {
    slug: "",
    publicado: false,
    destacado: false,
    tipo: "workshop",
    modalidad: "presencial",
    titulo: "",
    resumen: "",
    descripcion: "",
    tags: [],
    categorias: [],
    inicio: "",
    fin: "",
    lugar: "",
    inscripcionUrl: "",
    cupo: null,
    precio: "",
    oradores: [],
    marcaIds: [],
    certificado: { ...CERTIFICADO_VACIO, firmantes: [...CERTIFICADO_VACIO.firmantes] },
  }
}

export function borradorDe(e: Evento): BorradorEvento {
  return {
    slug: e.slug,
    publicado: e.publicado,
    destacado: e.destacado,
    tipo: e.tipo,
    modalidad: e.modalidad,
    titulo: e.titulo,
    resumen: e.resumen,
    descripcion: e.descripcion,
    tags: e.tags,
    categorias: e.categorias,
    inicio: e.inicio,
    fin: e.fin,
    lugar: e.lugar,
    inscripcionUrl: e.inscripcionUrl,
    cupo: e.cupo,
    precio: e.precio,
    oradores: e.oradores,
    marcaIds: e.marcaIds,
    certificado: e.certificado,
  }
}

/** Lo que falta para guardar, como frases: "Falta el título y la fecha." */
export function faltantesDe(b: BorradorEvento): string[] {
  const faltan: string[] = []
  if (!b.titulo.trim()) faltan.push("el título")
  if (!b.inicio) faltan.push("la fecha de inicio")
  if (b.inicio && b.fin && new Date(b.fin) <= new Date(b.inicio)) {
    faltan.push("una hora de fin posterior a la de inicio")
  }
  if (b.inscripcionUrl.trim() && !urlValida(b.inscripcionUrl)) {
    faltan.push("un link de inscripción que empiece con https://")
  }
  return faltan
}

/* ── Slug ─────────────────────────────────────────────────────────────────── */

/** "Workshop: Copilot para ventas — 2026" → "workshop-copilot-para-ventas-2026". */
export function slugDe(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "")
}

/* ── Estado ───────────────────────────────────────────────────────────────── */

export type Estado = "borrador" | "proximo" | "en-curso" | "realizado"

export const ESTADO_LABEL: Record<Estado, string> = {
  borrador: "Borrador",
  proximo: "Próximo",
  "en-curso": "En curso",
  realizado: "Realizado",
}

export function estadoDe(e: { publicado: boolean; inicio: string; fin: string }, ahora = new Date()): Estado {
  if (!e.publicado) return "borrador"
  const inicio = new Date(e.inicio)
  // Sin hora de fin se lo da por terminado a las tres horas: un evento sin fin
  // cargado no puede figurar "en curso" para siempre.
  const fin = e.fin ? new Date(e.fin) : new Date(inicio.getTime() + 3 * 60 * 60 * 1000)
  if (ahora < inicio) return "proximo"
  if (ahora < fin) return "en-curso"
  return "realizado"
}

/* ── Fechas ───────────────────────────────────────────────────────────────── */

/** Todas las fechas se muestran en hora de Buenos Aires, también en el
 *  servidor de Vercel, que corre en UTC. Sin esto el certificado de un evento
 *  de las 22 sale con la fecha del día siguiente. */
export const ZONA = "America/Argentina/Buenos_Aires"

/** "22 de octubre de 2026". */
export function fechaLarga(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: ZONA })
}

/** "jue 22 oct · 19:00". */
export function fechaCorta(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const dia = d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short", timeZone: ZONA })
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA })
  return `${dia} · ${hora}`
}

export function aInputLocal(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function deInputLocal(valor: string): string {
  if (!valor) return ""
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? "" : d.toISOString()
}

/** Horas desde la duración del evento, redondeadas a media hora. Es la
 *  sugerencia inicial del certificado, que después se edita. */
export function horasDe(inicio: string, fin: string): number | null {
  if (!inicio || !fin) return null
  const ms = new Date(fin).getTime() - new Date(inicio).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return null
  return Math.max(0.5, Math.round((ms / 3_600_000) * 2) / 2)
}

/** "3 horas", "1 hora", "1,5 horas". */
export function horasTexto(h: number): string {
  const n = h.toLocaleString("es-AR", { maximumFractionDigits: 1 })
  return `${n} ${h === 1 ? "hora" : "horas"}`
}

/* ── Asistentes ───────────────────────────────────────────────────────────── */

/**
 * Una planilla pegada → asistentes.
 *
 * Acepta lo que sale de copiar columnas de Excel o de Google Sheets (tabs), un
 * CSV (comas o punto y coma) o un nombre por línea. El orden es nombre, email,
 * empresa; el email se reconoce por la arroba en cualquier columna, porque la
 * planilla de inscriptos de Google Forms lo pone primero.
 */
export function parsearAsistentes(texto: string): { nombre: string; email: string; empresa: string }[] {
  return texto
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter(Boolean)
    .map((linea) => {
      const celdas = linea.split(/\t|;|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, ""))
      const email = celdas.find((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) ?? ""
      const resto = celdas.filter((c) => c && c !== email)
      return {
        nombre: (resto[0] ?? "").slice(0, LIMITES.asistenteNombre),
        email: email.slice(0, LIMITES.asistenteEmail),
        empresa: (resto[1] ?? "").slice(0, LIMITES.asistenteEmpresa),
      }
    })
    // La fila de encabezados de la planilla ("Nombre, Email") no es una persona.
    .filter((a) => a.nombre && !/^(nombre|name|apellido|asistente)s?$/i.test(a.nombre))
    .slice(0, LIMITES.asistentesPorCarga)
}

/**
 * "MARÍA JOSÉ pérez" → "María José Pérez".
 *
 * Los nombres llegan de un formulario donde cada uno escribió como quiso, y en el
 * certificado van en grande: una fila en mayúsculas sostenidas al lado de otra
 * en minúsculas es lo primero que se nota. Respeta las partículas ("de", "del").
 */
export function nombrePropio(nombre: string): string {
  const particulas = new Set(["de", "del", "la", "las", "los", "y", "da", "dos", "van", "von"])
  return nombre
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-AR")
    .split(" ")
    .map((p, i) =>
      i > 0 && particulas.has(p) ? p : p.replace(/(^|[-'’])(\p{L})/gu, (_, sep, l) => sep + l.toLocaleUpperCase("es-AR"))
    )
    .join(" ")
}

/**
 * El tamaño del nombre en el certificado, en px sobre la pieza de 1122 de ancho.
 *
 * Es lo único que se adapta: "Ana Paz" a 64 px se ve monumental, y "María de
 * los Ángeles Fernández Etcheverry" a 64 px no entra. Los escalones son por
 * largo y no con medición real del texto para que la pieza salga idéntica en la
 * vista previa y en la impresión.
 *
 * La columna mide unos 930 px (el certificado es una sola columna) y Space Grotesk bold ronda 0,54 em por
 * carácter. Los tamaños están pensados para la miniatura de LinkedIn, donde la
 * pieza se ve a la mitad: el nombre tiene que seguir leyéndose ahí. Hasta 22
 * caracteres entra en un renglón; de ahí en más pasa a dos a un tamaño que
 * sigue siendo protagonista, en vez de achicarlo hasta que parezca una nota.
 */
export function tamanoDelNombre(nombre: string): number {
  const n = nombre.length
  if (n <= 22) return 76
  if (n <= 28) return 62
  if (n <= 36) return 50
  return 44
}

/** El tamaño del título del curso. Bastante más chico que el nombre a
 *  propósito: son dos protagonistas, pero uno manda. Los largos pasan a dos
 *  renglones. */
export function tamanoDelCurso(curso: string): number {
  const n = curso.length
  if (n <= 40) return 36
  if (n <= 58) return 30
  return 28
}

/** El nombre de ejemplo de la vista previa. Largo a propósito: si entra este,
 *  entra cualquiera. */
export const NOMBRE_EJEMPLO = "María Victoria Fernández"
