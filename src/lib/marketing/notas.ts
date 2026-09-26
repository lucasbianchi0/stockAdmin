/**
 * Notas del sitio — tipos, límites y las reglas que valen en las dos puntas.
 *
 * Sin imports de servidor: lo usan el editor, la vista previa y los handlers de
 * API. Mismo criterio que eventos.ts y popups.ts — el endpoint rechaza
 * exactamente lo que el formulario no deja escribir.
 *
 * QUÉ ES UNA NOTA Y QUÉ NO
 *
 * No es una novedad de la empresa. Es la respuesta a una pregunta que alguien
 * escribe en Google o le hace a ChatGPT: "¿tiene validez legal la firma
 * biométrica en Argentina?". Por eso los campos que parecen de más —la
 * respuesta directa, las FAQs, las fuentes— son en realidad los que deciden si
 * la nota sirve: son lo que un modelo generativo puede citar sin leer el resto.
 */

/* ── Vocabulario ──────────────────────────────────────────────────────────── */

export const TIPOS = ["guia", "nota", "caso"] as const
export type Tipo = (typeof TIPOS)[number]

export const TIPO_LABEL: Record<Tipo, string> = {
  guia: "Guía",
  nota: "Nota",
  caso: "Caso",
}

export const TIPO_PISTA: Record<Tipo, string> = {
  guia: "El tema de punta a punta, en las cuatro secciones. Es la que citan las IAs y a la que enlazan las demás.",
  nota: "Una respuesta puntual a una sola pregunta. Es el formato del día a día.",
  caso: "Un antecedente concreto, con cifras. Es lo que más pesa cuando preguntan quién hace esto en Argentina.",
}

/**
 * Cuánto tiene que durar una nota.
 *
 * POR QUÉ SE ACHICÓ
 *
 * Hasta acá el editor pedía "de 800 a 1.200 palabras" y avisaba que abajo de
 * 600 una nota "compite mal". Eso era cierto cuando la pelea era por rankear
 * en Google con extensión; hoy la mitad del tráfico informativo lo resuelve un
 * modelo generativo citando DOS bloques: la respuesta directa y una FAQ.
 * Ninguno de los dos vive en el cuerpo.
 *
 * Y del lado del lector: quien entra buscando "¿la firma biométrica tiene
 * validez?" no vino a estudiar, vino a decidir si nos llama. Las 227 palabras
 * que explicaban cómo funciona un test por dentro no lo acercaban ni un paso.
 *
 * QUÉ SE HACE CON LO QUE SOBRA
 *
 * No se tira: se muda. Los matices, las objeciones y las aclaraciones van a
 * las FAQs, que en el sitio están plegadas —no ocupan pantalla— y rinden más
 * en búsqueda generativa que el mismo texto suelto en un párrafo.
 *
 * `objetivo` es la vara; `maximo` es donde el aviso se vuelve grave. Por abajo
 * de `minimo` ya no hay nota, hay un párrafo.
 */
export const PALABRAS = {
  minimo: 250,
  objetivo: 350,
  maximo: 450,
} as const

/**
 * A qué solución pertenece la nota. Los slugs son los de /soluciones/<slug>:
 * el sitio agrupa, filtra y pinta con estos valores, y de acá sale el link a la
 * página de la solución al final de la nota.
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

/**
 * Las industrias con landing propia en el sitio (/soluciones/<slug>/<industria>).
 * Elegir una acá es lo que hace que la nota enlace a esa landing, que es el
 * destino comercial del lector.
 */
export const INDUSTRIAS = [
  "bancos",
  "seguros",
  "juridicos",
  "laboratorios",
  "logistica",
  "retail",
  "mineria",
] as const
export type Industria = (typeof INDUSTRIAS)[number]

/** Los mismos nombres que usa el sitio en `INDUSTRIES`: si acá dijeran otra
 *  cosa, el chip del editor y el botón de la nota publicada no coincidirían. */
export const INDUSTRIA_LABEL: Record<Industria, string> = {
  bancos: "Bancos",
  seguros: "Aseguradoras",
  juridicos: "Estudios jurídicos",
  laboratorios: "Laboratorios y salud",
  logistica: "Logística",
  retail: "Retail",
  mineria: "Minería",
}

/* ── La nota ──────────────────────────────────────────────────────────────── */

export type Faq = { q: string; a: string }
export type Fuente = { titulo: string; url: string }

export type Nota = {
  id: string
  slug: string
  publicado: boolean
  destacada: boolean
  tipo: Tipo
  titulo: string
  tituloSeo: string
  resumen: string
  respuesta: string
  cuerpo: string
  categoria: Categoria | null
  industrias: Industria[]
  tags: string[]
  faqs: Faq[]
  fuentes: Fuente[]
  autor: string
  autorCargo: string
  portadaUrl: string | null
  portadaAncho: number | null
  portadaAlto: number | null
  /** ISO o vacío. La fecha pública: `datePublished`. */
  publicadoEn: string
  /** ISO o vacío. `dateModified`: se toca sólo cuando se revisa el contenido. */
  revisadoEn: string
  /** Quién la cargó en el backoffice. No es quien la firma. */
  autorNombre: string
  actualizado: string
}

/* ── Límites ──────────────────────────────────────────────────────────────── */

/** Los mismos números que los `check` de la migración. Si cambian, cambian en
 *  los dos lados. */
export const LIMITES = {
  titulo: 110,
  tituloSeo: 70,
  resumen: 300,
  respuesta: 600,
  cuerpo: 60000,
  tag: 24,
  tags: 8,
  industrias: 7,
  autor: 80,
  autorCargo: 90,
  faqs: 8,
  faqPregunta: 140,
  faqRespuesta: 600,
  fuentes: 8,
  fuenteTitulo: 120,
  url: 500,
} as const

/**
 * Los topes que Google respeta al dibujar el resultado. No son límites duros
 * —escribir de más no rompe nada—, son la línea a partir de la cual el texto se
 * corta con puntos suspensivos en la búsqueda.
 */
export const IDEAL = { titulo: 60, resumen: 155 } as const

/* ── Guardas ──────────────────────────────────────────────────────────────── */

export function esTipo(v: unknown): v is Tipo {
  return typeof v === "string" && (TIPOS as readonly string[]).includes(v)
}

export function esCategoria(v: unknown): v is Categoria {
  return typeof v === "string" && (CATEGORIAS as readonly string[]).includes(v)
}

/** Las industrias válidas, sin repetir y en el orden canónico. */
export function industriasDe(v: unknown): Industria[] {
  if (!Array.isArray(v)) return []
  return INDUSTRIAS.filter((i) => v.includes(i))
}

export function urlValida(url: string): boolean {
  return /^(https?:\/\/|\/|mailto:)/.test(url.trim())
}

/* ── Slug ─────────────────────────────────────────────────────────────────── */

/** "¿Qué validez legal tiene la firma biométrica?" →
 *  "que-validez-legal-tiene-la-firma-biometrica". */
export function slugDe(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "")
}

/* ── Estado ───────────────────────────────────────────────────────────────── */

export type Estado = "borrador" | "programada" | "publicada"

export const ESTADO_LABEL: Record<Estado, string> = {
  borrador: "Borrador",
  programada: "Programada",
  publicada: "Publicada",
}

/**
 * Una nota publicada con fecha futura queda "programada": el sitio no la
 * muestra hasta que llega el día. Es lo que permite dejar la semana cargada un
 * lunes sin que salga todo junto.
 */
export function estadoDe(n: Pick<Nota, "publicado" | "publicadoEn">, ahora = new Date()): Estado {
  if (!n.publicado) return "borrador"
  if (n.publicadoEn && new Date(n.publicadoEn) > ahora) return "programada"
  return "publicada"
}

/* ── Lectura ──────────────────────────────────────────────────────────────── */

/** Palabras del cuerpo, ya sin la marcación de markdown. */
export function palabrasDe(cuerpo: string): number {
  const limpio = cuerpo
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`\-\[\]()]/g, " ")
    .trim()
  return limpio ? limpio.split(/\s+/).length : 0
}

/** Minutos de lectura, a 200 palabras por minuto. Nunca menos de uno. */
export function minutosDe(cuerpo: string): number {
  return Math.max(1, Math.round(palabrasDe(cuerpo) / 200))
}

/* ── Fechas ───────────────────────────────────────────────────────────────── */

/** Todas las fechas se muestran en hora de Buenos Aires, también en el servidor
 *  de Vercel, que corre en UTC. */
export const ZONA = "America/Argentina/Buenos_Aires"

/** "18 de septiembre de 2026". */
export function fechaLarga(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: ZONA })
}

/** "18 sep 2026". */
export function fechaCorta(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d
    .toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: ZONA })
    .replace(".", "")
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

/* ── Borrador del editor ──────────────────────────────────────────────────── */

export type BorradorNota = Omit<
  Nota,
  "id" | "portadaUrl" | "portadaAncho" | "portadaAlto" | "autorNombre" | "actualizado"
>

export function borradorVacio(): BorradorNota {
  return {
    slug: "",
    publicado: false,
    destacada: false,
    tipo: "nota",
    titulo: "",
    tituloSeo: "",
    resumen: "",
    respuesta: "",
    cuerpo: "",
    categoria: null,
    industrias: [],
    tags: [],
    faqs: [],
    fuentes: [],
    autor: "",
    autorCargo: "",
    publicadoEn: "",
    revisadoEn: "",
  }
}

export function borradorDe(n: Nota): BorradorNota {
  return {
    slug: n.slug,
    publicado: n.publicado,
    destacada: n.destacada,
    tipo: n.tipo,
    titulo: n.titulo,
    tituloSeo: n.tituloSeo,
    resumen: n.resumen,
    respuesta: n.respuesta,
    cuerpo: n.cuerpo,
    categoria: n.categoria,
    industrias: n.industrias,
    tags: n.tags,
    faqs: n.faqs,
    fuentes: n.fuentes,
    autor: n.autor,
    autorCargo: n.autorCargo,
    publicadoEn: n.publicadoEn,
    revisadoEn: n.revisadoEn,
  }
}

/** Lo que falta para guardar, como frases: "Falta el título y el cuerpo." */
export function faltantesDe(b: BorradorNota): string[] {
  const faltan: string[] = []
  if (!b.titulo.trim()) faltan.push("el título")
  if (!b.cuerpo.trim()) faltan.push("el cuerpo")
  if (b.publicado && !b.resumen.trim()) faltan.push("el resumen (es la descripción que muestra Google)")
  const fuenteRota = b.fuentes.find((f) => f.url.trim() && !urlValida(f.url))
  if (fuenteRota) faltan.push("una fuente con link válido (tiene que empezar con https://)")
  return faltan
}

/* ── Revisión antes de publicar ───────────────────────────────────────────── */

export type Aviso = { texto: string; grave: boolean }

/** Lo mínimo de otra nota que hace falta para compararla con la que se escribe. */
export type NotaExistente = { id: string; titulo: string; slug: string; publicado: boolean }

/**
 * Cuánto se parecen dos títulos, de 0 a 1.
 *
 * Palabras de más de tres letras, sin acentos y sin las vacías, comparadas como
 * conjuntos. No es una medida fina y no hace falta que lo sea: alcanza para
 * distinguir "Firma biométrica: validez legal en Argentina" de "Cuánto cuesta un
 * firewall", que es lo único que se le pide.
 */
const VACIAS = new Set([
  "para", "como", "cuando", "donde", "cual", "cuales", "sobre", "entre", "desde", "hasta",
  "este", "esta", "estos", "estas", "tiene", "tienen", "hace", "hacer", "argentina", "empresas",
  "todo", "toda", "todos", "todas", "mejor", "mejores", "guia", "nota",
])

export function parecidoDeTitulos(a: string, b: string): number {
  const palabras = (t: string) =>
    new Set(
      t
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((p) => p.length > 3 && !VACIAS.has(p))
    )

  const x = palabras(a)
  const y = palabras(b)
  if (x.size === 0 || y.size === 0) return 0

  let comunes = 0
  for (const p of x) if (y.has(p)) comunes++
  return comunes / Math.min(x.size, y.size)
}

/**
 * Lo que conviene corregir antes de publicar.
 *
 * No bloquea: son avisos, no errores. Existe porque el costo de publicar una
 * nota floja no se ve en el momento —la página sale igual— sino tres meses
 * después, cuando no la cita nadie. Poner esa lista a la vista en el editor es
 * más barato que auditarlo después.
 *
 * LO QUE PUEDE HACERLE DAÑO AL SITIO
 *
 * Los primeros avisos son sobre la nota; los últimos son sobre lo que una nota
 * le puede hacer al resto del sitio, que es más caro y menos evidente:
 *
 *  · Dos notas que responden la misma búsqueda se restan entre sí y Google
 *    termina sin rankear ninguna. Es el problema más caro de un hub de
 *    contenido y el que nadie ve venir.
 *  · Una nota que afirma algo que Accedra no vende —satelital, Starlink—
 *    amplifica un error que ya está en el sitio, y encima con una página nueva
 *    escrita para ser citada.
 *  · Una promesa absoluta ("garantizamos", "100% seguro") en una nota que
 *    encima habla de validez legal es un problema que no es de SEO.
 *
 * `otras` son las demás notas cargadas. Sin esa lista los avisos siguen
 * saliendo: simplemente no incluyen los de canibalización.
 */
export function avisosDe(b: BorradorNota, otras: NotaExistente[] = []): Aviso[] {
  const avisos: Aviso[] = []
  const palabras = palabrasDe(b.cuerpo)

  if (!b.respuesta.trim()) {
    avisos.push({
      texto: "Sin respuesta directa. Es el bloque que copia una IA cuando responde la pregunta del título.",
      grave: true,
    })
  }
  if (b.faqs.length === 0) {
    avisos.push({
      texto: "Sin preguntas frecuentes. Es el schema que más se cita en búsqueda generativa.",
      grave: true,
    })
  }
  if (!b.autor.trim()) {
    avisos.push({ texto: "Sin autor. Google pide autor real en las notas, y las IAs lo citan.", grave: false })
  }
  if (!b.categoria) {
    avisos.push({ texto: "Sin solución asignada: la nota no enlaza a ninguna página de servicio.", grave: false })
  }
  if (palabras > PALABRAS.maximo) {
    avisos.push({
      texto: `Son ${palabras} palabras y el máximo es ${PALABRAS.maximo}. Lo que sobra casi siempre es la explicación de cómo funciona algo por dentro, una lista de más de tres ítems, o una aclaración defensiva: eso último va a las preguntas frecuentes, que están plegadas y rinden más ahí.`,
      grave: true,
    })
  } else if (palabras > PALABRAS.objetivo) {
    avisos.push({
      texto: `Son ${palabras} palabras. El objetivo es ${PALABRAS.objetivo}: entra, pero fijate si hay alguna sección que explique de más.`,
      grave: false,
    })
  }
  if (palabras > 0 && palabras < PALABRAS.minimo) {
    avisos.push({
      texto: `Son ${palabras} palabras. Abajo de ${PALABRAS.minimo} no alcanza a plantear el problema y ofrecer la salida.`,
      grave: false,
    })
  }
  if (b.resumen.length > IDEAL.resumen) {
    avisos.push({
      texto: `El resumen tiene ${b.resumen.length} caracteres y Google corta cerca de ${IDEAL.resumen}.`,
      grave: false,
    })
  }
  const titulo = (b.tituloSeo || b.titulo).length
  if (titulo > IDEAL.titulo) {
    avisos.push({
      texto: `El título de búsqueda tiene ${titulo} caracteres y se corta cerca de ${IDEAL.titulo}. Usá "Título para Google".`,
      grave: false,
    })
  }
  if (b.cuerpo && !/^##\s/m.test(b.cuerpo)) {
    avisos.push({
      texto: "El cuerpo no tiene subtítulos (##). Sin ellos no hay índice y cuesta más que se cite un fragmento.",
      grave: false,
    })
  }

  /* ── Lo que le puede hacer daño al resto del sitio ─────────────────────── */

  const todo = `${b.titulo} ${b.respuesta} ${b.cuerpo} ${b.faqs.map((f) => `${f.q} ${f.a}`).join(" ")}`

  if (/satelital|starlink|satélite|satelite/i.test(todo)) {
    avisos.push({
      texto:
        "La nota habla de conectividad satelital o Starlink, y Accedra no vende eso. El sitio ya lo dice mal en un par de lugares; una nota nueva lo amplifica.",
      grave: true,
    })
  }

  if (/\bfirma digital\b/i.test(todo) && !/biom[ée]trica/i.test(todo)) {
    avisos.push({
      texto:
        "Dice “firma digital” y nunca “biométrica”. Son cosas distintas: con ese término llega gente que busca el token de AFIP, que no es un cliente.",
      grave: false,
    })
  }

  const promesa = todo.match(/garantizamos|100\s*%\s*(seguro|garantizado)|sin ning[úu]n riesgo|imposible de (hackear|vulnerar)/i)
  if (promesa) {
    avisos.push({
      texto: `Hay una promesa absoluta (“${promesa[0]}”). En una nota que habla de validez legal o de seguridad, eso es un problema que no es de SEO.`,
      grave: true,
    })
  }

  if (b.cuerpo && !/\]\((\/|https?:\/\/(www\.)?accedra\.com\.ar)/.test(b.cuerpo)) {
    avisos.push({
      texto:
        "La nota no enlaza a ninguna página del sitio. Sin links internos no reparte autoridad ni lleva al lector a la solución.",
      grave: false,
    })
  }

  if (/\]\(http:\/\//.test(b.cuerpo) || b.fuentes.some((f) => /^http:\/\//.test(f.url))) {
    avisos.push({ texto: "Hay links que van por http://. Usá https:// o el navegador avisa.", grave: false })
  }

  // Canibalización: la nota más parecida de las que ya existen. El corte en 0,6
  // deja pasar dos notas del mismo tema con ángulos distintos y marca las que
  // responden la misma pregunta con otras palabras.
  const parecida = otras
    .map((o) => ({ nota: o, parecido: parecidoDeTitulos(b.titulo, o.titulo) }))
    .sort((a, c) => c.parecido - a.parecido)[0]

  if (b.titulo.trim() && parecida && parecida.parecido >= 0.6) {
    avisos.push({
      texto: `Se parece mucho a “${parecida.nota.titulo}”${parecida.nota.publicado ? " (ya publicada)" : " (en borrador)"}. Dos notas que responden la misma búsqueda se restan entre sí: conviene unirlas o cambiarle el ángulo a ésta.`,
      grave: parecida.nota.publicado,
    })
  }

  return avisos
}
