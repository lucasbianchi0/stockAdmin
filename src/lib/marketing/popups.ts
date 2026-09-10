/**
 * Popups del sitio — tipos, límites y las reglas que valen en las dos puntas.
 *
 * Sin imports de servidor a propósito: esto lo usan el formulario, la vista
 * previa y los handlers de API. Las reglas viven una sola vez, así el endpoint
 * rechaza exactamente lo mismo que el formulario no deja escribir.
 *
 * LOS LIMITES NO SON UNA PRECAUCION, SON EL DISEÑO
 *
 * El popup es una pieza con medidas: un título de dos renglones, una bajada de
 * tres, un botón que entra en el ancho de un celular. Si los campos fueran
 * libres, la primera carga con un párrafo entero rompería el modal en mobile y
 * nadie se enteraría —el que lo cargó lo vio en una pantalla grande y quedó
 * bien—. Por eso el tope se muestra mientras se escribe, se corta en el
 * endpoint y además está en la base como `check`.
 *
 * La otra mitad del "siempre queda bien" es la imagen: entra como venga y sale
 * normalizada a WebP con un techo de ancho. Ver popups-server.ts.
 */

/* ── Vocabulario ──────────────────────────────────────────────────────────── */

/**
 * Cuánta atención pide la pieza. `modal` interrumpe y tapa la página; `barra`
 * se apoya abajo y deja seguir leyendo. Un evento con inscripción justifica el
 * modal; "el lunes no atendemos" no.
 */
export const FORMATOS = ["modal", "barra"] as const
export type Formato = (typeof FORMATOS)[number]

export const FORMATO_LABEL: Record<Formato, string> = {
  modal: "Modal centrado",
  barra: "Barra inferior",
}

export const FORMATO_PISTA: Record<Formato, string> = {
  modal: "Tapa la página. Para lo que se viene a anunciar: un evento, un lanzamiento.",
  barra: "Se apoya abajo y deja leer. Para avisos: horarios, mantenimiento, una novedad.",
}

/**
 * Qué se le pide al visitante.
 *
 * Antes esto eran tres posiciones para la imagen. Se fueron: la imagen va
 * arriba y punto, y lo que sí cambia de un aviso a otro es qué se hace con la
 * atención que se interrumpió.
 */
export const ACCIONES = ["mail", "enlace"] as const
export type Accion = (typeof ACCIONES)[number]

export const ACCION_LABEL: Record<Accion, string> = {
  mail: "Pedir el mail",
  enlace: "Llevar a una página",
}

export const ACCION_PISTA: Record<Accion, string> = {
  mail: "El visitante deja su dirección sin salir de donde está. Entra en los leads con la campaña que lo trajo.",
  enlace: "Un botón que lleva a otra página. Para cuando la inscripción o la nota ya viven en algún lado.",
}

/** Cada cuánto se le vuelve a aparecer a la misma persona. */
export const FRECUENCIAS = ["siempre", "sesion", "dia", "unica"] as const
export type Frecuencia = (typeof FRECUENCIAS)[number]

export const FRECUENCIA_LABEL: Record<Frecuencia, string> = {
  siempre: "En cada página",
  sesion: "Una vez por visita",
  dia: "Una vez por día",
  unica: "Una sola vez",
}

export const FRECUENCIA_PISTA: Record<Frecuencia, string> = {
  siempre: "Aparece siempre. Sirve para probar, no para publicar.",
  sesion: "Se muestra una vez y no vuelve hasta la próxima visita.",
  dia: "Vuelve a aparecer recién al día siguiente.",
  unica: "Quien lo cerró no lo ve nunca más.",
}

/** En qué páginas del sitio se muestra. */
export const ALCANCES = ["todas", "home", "rutas"] as const
export type Alcance = (typeof ALCANCES)[number]

export const ALCANCE_LABEL: Record<Alcance, string> = {
  todas: "Todo el sitio",
  home: "Sólo la portada",
  rutas: "Sólo algunas páginas",
}

/* ── El popup ─────────────────────────────────────────────────────────────── */

export type Popup = {
  id: string
  /** Interno: no se muestra en el sitio. Es cómo se lo encuentra en la lista. */
  nombre: string
  activo: boolean

  formato: Formato

  etiqueta: string
  titulo: string
  descripcion: string

  /** URL pública, ya armada. El bucket es público justamente para que no venza. */
  imagenUrl: string | null
  /** Medidas reales del archivo normalizado. Viajan para que el sitio reserve el
   *  espacio antes de que cargue la imagen y el modal no salte. */
  imagenAncho: number | null
  imagenAlto: number | null
  imagenAlt: string

  accion: Accion
  /** El texto del botón: el de enviar cuando pide el mail, el de ir cuando
   *  lleva a una página. */
  ctaTexto: string
  ctaUrl: string
  ctaNuevaPestana: boolean
  /** Lo que se muestra en lugar del formulario una vez enviado el mail. */
  mailGracias: string
  cerrarTexto: string

  /** ISO o vacío. Vacío = sin límite de ese lado. */
  desde: string
  hasta: string
  demoraS: number
  frecuencia: Frecuencia
  alcance: Alcance
  rutas: string[]

  /** `updated_at` en ISO. El sitio lo usa como parte de la clave de "ya lo vi":
   *  si se edita el popup, vuelve a mostrarse a todos. Es lo que se espera al
   *  corregir una fecha equivocada. */
  actualizado: string
}

/* ── Límites ──────────────────────────────────────────────────────────────── */

/**
 * Los mismos números que los `check` de la migración. Si acá se sube uno y en
 * la base no, el formulario deja escribir algo que Postgres rechaza y el error
 * que ve la persona es un mensaje de la base.
 */
export const LIMITES = {
  nombre: 60,
  etiqueta: 24,
  titulo: 60,
  descripcion: 180,
  ctaTexto: 22,
  cerrarTexto: 22,
  mailGracias: 120,
  ctaUrl: 500,
  imagenAlt: 120,
  /** Más de esto no es segmentar, es una lista de páginas sueltas. */
  rutas: 12,
} as const

/** A partir de qué porcentaje del tope el contador se pone amarillo. Antes de
 *  eso el número molesta más de lo que ayuda. */
export const AVISO_DESDE = 0.8

/* ── La imagen ────────────────────────────────────────────────────────────── */

export const IMAGEN_TIPOS = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const

/** 8 MB de entrada. No es lo que se publica —el servidor la reencodea a WebP y
 *  la baja a 1600 px— sino el techo de lo que se acepta subir: una foto de
 *  celular moderna ronda los 4 MB y tiene que entrar sin que nadie la achique
 *  antes a mano. */
export const IMAGEN_TAMANO_MAX = 8 * 1024 * 1024

/** Debajo de esto la imagen se ve blanda en pantallas retina. */
export const IMAGEN_ANCHO_MIN = 600

/** El motivo por el que este archivo no sirve, o `null`. Una sola función para
 *  el input, el submit y el endpoint. */
export function problemaDeImagen(archivo: { type: string; name: string; size: number }): string | null {
  const nombre = archivo.name.toLowerCase()
  const extensionOk = /\.(jpe?g|png|webp|avif)$/.test(nombre)
  const tipoOk = (IMAGEN_TIPOS as readonly string[]).includes(archivo.type)

  // El navegador miente con el MIME más seguido de lo que parece, sobre todo en
  // Windows: la extensión vale como segunda oportunidad.
  if (!tipoOk && !extensionOk) return "La imagen tiene que ser JPG, PNG, WebP o AVIF"
  if (archivo.size > IMAGEN_TAMANO_MAX) return "La imagen no puede pesar más de 8 MB"
  return null
}

/* ── Validación del formulario ────────────────────────────────────────────── */

export function esFormato(v: unknown): v is Formato {
  return typeof v === "string" && (FORMATOS as readonly string[]).includes(v)
}
export function esAccion(v: unknown): v is Accion {
  return typeof v === "string" && (ACCIONES as readonly string[]).includes(v)
}
export function esFrecuencia(v: unknown): v is Frecuencia {
  return typeof v === "string" && (FRECUENCIAS as readonly string[]).includes(v)
}
export function esAlcance(v: unknown): v is Alcance {
  return typeof v === "string" && (ALCANCES as readonly string[]).includes(v)
}

/** Mismo criterio que el `check` de la base: absoluta, interna, mail o teléfono.
 *  Lo que se ataja es "www.evento.com" sin protocolo, que el navegador toma
 *  como ruta relativa y termina en un 404 del propio sitio. */
export function urlValida(url: string): boolean {
  return /^(https?:\/\/|\/|mailto:|tel:)/.test(url.trim())
}

export type BorradorPopup = Omit<Popup, "id" | "imagenUrl" | "imagenAncho" | "imagenAlto" | "actualizado">

export const BORRADOR_VACIO: BorradorPopup = {
  nombre: "",
  activo: false,
  formato: "modal",
  etiqueta: "",
  titulo: "",
  descripcion: "",
  imagenAlt: "",
  accion: "mail",
  ctaTexto: "",
  ctaUrl: "",
  ctaNuevaPestana: true,
  mailGracias: "",
  cerrarTexto: "",
  desde: "",
  hasta: "",
  // Seis segundos: en cero interrumpe antes de que la persona vea dónde entró,
  // y pasados diez ya se fue o ya está leyendo algo.
  demoraS: 6,
  frecuencia: "sesion",
  alcance: "todas",
  rutas: [],
}

/**
 * Lo que falta para poder guardar, en el orden en que está el formulario.
 *
 * Devuelve frases y no códigos porque se muestran unidas con "y": "Falta el
 * nombre y el título."
 */
export function faltantesDe(b: BorradorPopup): string[] {
  const faltan: string[] = []

  if (!b.nombre.trim()) faltan.push("el nombre interno")
  if (!b.titulo.trim()) faltan.push("el título")

  // Pidiendo el mail, el texto del botón es opcional —la pieza pone uno por
  // defecto—. Llevando a una página no: un botón sin destino no hace nada.
  if (b.accion === "enlace") {
    if (!b.ctaTexto.trim()) faltan.push("el texto del botón")
    if (!b.ctaUrl.trim()) faltan.push("la página a la que lleva")
    else if (!urlValida(b.ctaUrl)) faltan.push("un enlace que empiece con https:// o con /")
  }

  if (b.alcance === "rutas" && b.rutas.length === 0) faltan.push("al menos una página")

  if (b.desde && b.hasta && new Date(b.hasta) <= new Date(b.desde)) {
    faltan.push("una fecha de fin posterior a la de inicio")
  }

  return faltan
}

/* ── Estado ───────────────────────────────────────────────────────────────── */

export type Estado = "publicado" | "programado" | "vencido" | "apagado"

export const ESTADO_LABEL: Record<Estado, string> = {
  publicado: "En el sitio",
  programado: "Programado",
  vencido: "Terminado",
  apagado: "Apagado",
}

/**
 * Qué está pasando con este popup ahora mismo.
 *
 * "Activo" solo no alcanza para saberlo: un popup prendido con fecha de inicio
 * la semana que viene no está en el sitio, y uno prendido con fecha de fin
 * vencida tampoco. Sin esta distinción la lista muestra tres popups "activos" y
 * el sitio no muestra ninguno, y ahí nadie entiende nada.
 */
export function estadoDe(p: { activo: boolean; desde: string; hasta: string }, ahora = new Date()): Estado {
  if (!p.activo) return "apagado"
  if (p.desde && new Date(p.desde) > ahora) return "programado"
  if (p.hasta && new Date(p.hasta) <= ahora) return "vencido"
  return "publicado"
}

/**
 * Cuál gana cuando hay más de uno publicado.
 *
 * El sitio muestra UNO: dos popups a la vez es un sitio roto. La regla es "el
 * último que se tocó", que es la que se puede explicar en una línea dentro de
 * la pantalla —y la que hace que prender el nuevo baste para reemplazar al
 * anterior, sin tener que acordarse de apagarlo—.
 */
export function vigenteDe(popups: Popup[], ahora = new Date()): Popup | null {
  const publicados = popups.filter((p) => estadoDe(p, ahora) === "publicado")
  if (publicados.length === 0) return null
  return [...publicados].sort(
    (a, b) => new Date(b.actualizado).getTime() - new Date(a.actualizado).getTime()
  )[0]
}

/* ── Fechas ───────────────────────────────────────────────────────────────── */

/**
 * ISO → el valor que entiende `<input type="datetime-local">`, en hora local.
 *
 * `toISOString()` no sirve: devuelve UTC, y el input lo dibuja como si fuera
 * local. Un evento de las 19 de Buenos Aires aparecería a las 22.
 */
export function aInputLocal(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** El valor del input (que es hora local) → ISO con zona, para guardar. */
export function deInputLocal(valor: string): string {
  if (!valor) return ""
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? "" : d.toISOString()
}

/** "22 oct, 19:00" — corto, para la lista. */
export function fechaCorta(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}
