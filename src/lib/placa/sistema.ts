/**
 * El sistema visual de las placas, en números en vez de en adjetivos.
 *
 * Es la contracara de `templates-feed.ts`. Allá la grilla se le DESCRIBE a un
 * generador de imágenes ("la banda del 13% al 45%") y el resultado se parece a
 * lo pedido con suerte variable: dos piezas del prompt idéntico salieron con
 * brillo de foto 61,5 y 28,4, y una salió con las letras de las zonas impresas
 * al costado. Acá los mismos porcentajes son coordenadas y se cumplen.
 *
 * Los valores no se inventaron para este archivo: son los que el prompt del feed
 * ya declaraba, para que una placa por código y una pieza generada se puedan
 * mezclar en la misma grilla de Instagram sin que se note el corte.
 */

import { PALETA } from "@/lib/brand-kit"
import { oracionesDe, terminaColgado } from "@/lib/copy-headline"

const color = (nombre: string) => PALETA.find((c) => c.nombre === nombre)!

/* ── Color ────────────────────────────────────────────────────────────────── */

/** El canvas oscuro que el Brand Kit fija para las piezas dark. */
export const FONDO = color("Navy fondo").hex

/** Cuerpo de texto sobre navy. El kit es explícito: blanco puro sobre oscuro vibra. */
export const TEXTO = color("Gris texto").hex

/** El titular sí va en blanco puro: es el único elemento que tiene que gritar. */
export const TITULAR = "#FFFFFF"

/**
 * El azul de marca, tal cual el Brand Kit.
 *
 * Las piezas generadas usan #3B82F6 —que en el kit es el color de la línea
 * Networking, no el de la marca— porque `templates-feed.ts` tiene la paleta
 * escrita a mano y no importa nada de acá. Esta placa no repite esa deriva.
 */
export const AZUL = color("Azul Accedra").hex

/**
 * El mismo azul, aclarado, para TEXTO CHICO sobre el navy.
 *
 * Medido: #2B56D4 sobre #0A1424 da contraste 3,0:1. Alcanza para un titular
 * grande (el umbral de texto grande es 3:1) y NO alcanza para un rótulo de 26 px,
 * que necesita 4,5:1. Este tono llega a 5,2:1 conservando el matiz.
 *
 * No está en el Brand Kit porque el kit no define variantes sobre oscuro. Es la
 * decisión que hay que ratificar ahí: hoy vive acá y en ningún otro lado.
 */
export const AZUL_SOBRE_OSCURO = "#5B82F0"

/* ── El tema ──────────────────────────────────────────────────────────────── */

export const TEMAS = ["oscuro", "claro"] as const
export type Tema = (typeof TEMAS)[number]

export function esTema(v: unknown): v is Tema {
  return typeof v === "string" && (TEMAS as readonly string[]).includes(v)
}

export type PaletaTema = {
  /** El canvas, cuando no hay fondo generado. */
  fondo: string
  /** El titular. Es el que tiene que gritar. */
  titular: string
  /** Prosa e ítems: un punto por debajo del titular, nunca al máximo contraste. */
  texto: string
  /** El acento: el rótulo y el remate del titular. */
  azul: string
  /**
   * El color del velo, como triplete RGB.
   *
   * Se guarda en crudo y no como gradiente entero porque los stops son los
   * mismos en los dos temas: lo único que cambia es de qué color es la niebla
   * que protege al texto. Así el formato queda idéntico, que es lo pedido.
   */
  velo: string
  /** Qué archivo de logo compone `soloLogo`. */
  logo: string
}

/**
 * Los dos temas de la placa.
 *
 * "claro" es el mismo sistema dado vuelta, no un diseño nuevo: mismas bandas,
 * mismos cuerpos, mismo reparto de líneas, mismo rincón del logo. Lo único que
 * cambia son estos seis valores y la dirección de arte del fondo.
 *
 * El azul NO es el mismo en los dos. Sobre navy, el #2B56D4 del kit da 3,0:1 —
 * alcanza para un titular grande y no para un rótulo de 26 px— y por eso el
 * tema oscuro usa una versión aclarada. Sobre el hueso pasa lo contrario: el
 * azul del kit llega a 6,6:1 y es el que corresponde, mientras que el aclarado
 * se lavaría. Cada tema usa el tono que su fondo pide, y los dos son el azul de
 * la marca.
 */
export const PALETAS: Record<Tema, PaletaTema> = {
  oscuro: {
    fondo: FONDO,
    titular: TITULAR,
    texto: TEXTO,
    azul: AZUL_SOBRE_OSCURO,
    velo: "10, 20, 36",
    logo: "public/brand/accedra-logo-blanco.svg",
  },
  claro: {
    /*
     * Blanco hueso y no blanco puro.
     *
     * El #FFFFFF en una pieza a sangre se lee como "no hay fondo": el feed de
     * Instagram ya es blanco y la placa desaparece contra la interfaz. El hueso
     * tiene la temperatura suficiente para que el borde del cuadro exista sin
     * que nadie note un color.
     */
    fondo: "#F5F2EC",
    /*
     * El titular en navy y no en negro puro. Es el mismo criterio que del otro
     * lado —allá el cuerpo de texto no va en blanco puro porque vibra— y acá el
     * negro sobre hueso es duro de más para un cuerpo de 84 px. El navy del kit
     * da 15,8:1 sobre el hueso: sobra.
     */
    titular: color("Navy Accedra").hex,
    /*
     * Prosa e ítems un escalón más suaves que el titular, igual que en oscuro.
     * Medido sobre el hueso: 8,4:1, cómodo para los 38-40 px de la bajada.
     */
    texto: "#41506A",
    azul: AZUL,
    velo: "245, 242, 236",
    logo: "public/brand/accedra-logo-navy.svg",
  },
}

/* ── Geometría ────────────────────────────────────────────────────────────── */

/** La medida del feed. El cuadrado es 1080; el vertical de Instagram es 4:5. */
export const MEDIDAS = {
  square: { ancho: 1080, alto: 1080 },
  portrait: { ancho: 1080, alto: 1350 },
} as const

export type Formato = keyof typeof MEDIDAS

/**
 * Las bandas, como fracción del alto. Son las del prompt del feed, literales.
 *
 * El hueco entre `titularHasta` y `bloqueDesde` no es holgura de más: el prompt
 * tenía el titular hasta 48% y el bloque desde 46%, o sea dos puntos de solape
 * escritos en la especificación. Con el titular en bold eso dejó de ser teórico y
 * salió una pieza con la lista tocando la última línea del titular.
 */
/**
 * La columna donde puede vivir el texto, como fracción del cuadro.
 *
 * Es EL número que evita que el titular le pase por encima a la cara de alguien.
 * La primera versión dejaba que el texto usara todo el ancho útil (86%) mientras
 * el prompt del fondo le reservaba el 62% izquierdo: el código y el prompt decían
 * cosas distintas, y la última línea del titular terminó cruzando al sujeto de la
 * foto.
 *
 * Por eso `fondos.ts` lo importa de acá en vez de repetir el porcentaje en el
 * texto del prompt. Es la misma deriva que ya había pasado con el azul —#3B82F6
 * escrito a mano contra el #2B56D4 del Brand Kit— y se evita del mismo modo: un
 * solo lugar donde el número vive.
 *
 * `alto` pasó de 0.52 a 0.80 el 18/8. Importar el valor evita que se contradigan,
 * pero no que quede viejo: 0.52 era correcto cuando el texto vivía pegado arriba,
 * en la banda 13%–45%. Desde que rótulo, titular y bloque van juntos y centrados,
 * una pieza con cuatro ítems llega al 76%, y todo lo que cae debajo del 52%
 * aterrizaba sobre una parte de la foto que el generador tenía permitido dejar
 * clara. El velo del código lo tapaba igual —por eso no se veía roto— pero
 * tapando justo lo que hubiéramos querido mostrar.
 */
export const ZONA_TEXTO = {
  /**
   * Familias con foto. La columna es angosta porque del otro lado hay un SUJETO
   * —una cara, unas manos, un rack— y taparlo es perder la imagen. Con todo el
   * ancho disponible, la última línea del titular cruzaba la cara de una persona.
   */
  conFoto: { ancho: 0.68, alto: 0.80 },
  /**
   * Familia editorial. No hay sujeto que proteger: el gráfico luminoso vive abajo
   * a la derecha y el resto es fondo. Angostar el texto acá no protege nada y
   * deja la pieza con el titular chico y medio cuadro vacío.
   */
  editorial: { ancho: 0.82, alto: 0.80 },
  /**
   * El layout centrado. No es una columna: el texto usa el cuadro entero de
   * ancho y le deja al sujeto la mitad de abajo. Por eso el `alto` es chico —
   * 0.42— y el `ancho` casi total: la reserva que hay que pedirle al generador
   * es una BANDA SUPERIOR, no una columna lateral.
   */
  centrado: { ancho: 0.86, alto: 0.42 },
} as const

/**
 * La zona que le toca a una pieza.
 *
 * El layout manda sobre la familia: "centrado" reserva una banda arriba y los
 * otros tres una columna a la izquierda, y eso no depende de si el fondo es una
 * foto o un gráfico.
 */
export function zonaDeTexto(familia: string, layout?: string) {
  if (layout === "centrado") return ZONA_TEXTO.centrado
  return familia === "editorial" ? ZONA_TEXTO.editorial : ZONA_TEXTO.conFoto
}

export const BANDAS = {
  margen: 0.07,
  eyebrowDesde: 0.06,
  titularDesde: 0.13,
  // 0.45 → 0.50 el 18/8, junto con el cuerpo fijo. Con la banda vieja, cuatro
  // líneas a 84 no entraban por seis píxeles y el titular se achicaba solo. El
  // hueco de seis puntos contra `bloqueDesde` se conserva: es lo que evita que
  // el primer ítem toque la última línea del titular.
  titularHasta: 0.50,
  bloqueDesde: 0.56,
  /** Dónde arranca el texto en el layout centrado: pegado arriba. */
  centradoDesde: 0.07,
  bloqueHasta: 0.76,
} as const

/* ── Tipografía ───────────────────────────────────────────────────────────── */

/**
 * Inter, en tres pesos.
 *
 * Es la elección explícita sobre Space Grotesk para el titular: se pidió una
 * grotesca corporativa, no la geométrica del kit. Space Grotesk sigue siendo la
 * display de la web; en las placas manda esta.
 */
export const FAMILIA = "Inter"

/**
 * La escala del titular, en px sobre 1080.
 *
 * Depende de cuántas líneas tiene, porque la banda es fija: tres líneas a 104 px
 * ocupan 318 px y la banda mide 346. A cuatro líneas no entra, y en vez de
 * desbordar se achica.
 */
function cuerpoPorLineas(lineas: number): number {
  if (lineas <= 1) return 132
  if (lineas === 2) return 118
  if (lineas === 3) return 104
  return 82
}

/**
 * Cuánto crece el titular cuando la placa NO tiene bloque secundario.
 *
 * Sin esto queda un tercio del cuadrado vacío entre la última línea y el logo, y
 * el sistema tiene una regla escrita justamente para eso: "no continuous region
 * larger than about a quarter of the square may read as flat empty background…
 * on a piece with no secondary block the headline may be set larger and breathe
 * further down". Al generador esa regla se le pedía; acá se calcula.
 */
export const CRECE_SIN_BLOQUE = 1.18

/**
 * Cuánto ocupa a lo ancho un carácter de Inter Bold, en múltiplos del cuerpo.
 *
 * Medido sobre las líneas reales del sistema, rasterizando con el mismo motor y
 * recortando el bounding box: los ratios van de 0,394 ("El firewall") a 0,509
 * ("operación"). 0,55 deja 8% de holgura sobre el peor caso.
 *
 * El error acá solo puede ir hacia el lado seguro: sobreestimar el ancho achica
 * el titular, y subestimarlo lo haría desbordar. Por eso el número es el peor
 * caso más margen y no el promedio.
 *
 * OJO: vale para caja baja. Una línea en VERSALITA mide 0,89 por carácter —si
 * algún día un titular va en mayúsculas, este número no lo cubre.
 */
const AVANCE_INTER_BOLD = 0.55

/**
 * El cuerpo del titular que entra de verdad.
 *
 * Tres restricciones a la vez, y gana la más chica:
 *   · la escala por cantidad de líneas,
 *   · el ANCHO — sin esto, un titular largo lo parte el renderizador en más
 *     líneas de las pedidas y el bloque se derrama sobre el logo. Pasó: al
 *     agrandar el cuerpo un 18%, "Nunca confiar." se partió en dos y la placa
 *     terminó con seis líneas encima del logotipo,
 *   · el ALTO de la banda disponible.
 */
export function cuerpoTitular({
  lineas,
  escalas,
  anchoDisponible,
  altoDisponible,
  sinBloque,
}: {
  /** El texto de cada línea. */
  lineas: string[]
  /** El multiplicador de cada línea (el énfasis en la primera, por ejemplo). */
  escalas: number[]
  anchoDisponible: number
  altoDisponible: number
  sinBloque: boolean
}): number {
  let cuerpo = cuerpoPorLineas(lineas.length) * (sinBloque ? CRECE_SIN_BLOQUE : 1)

  lineas.forEach((linea, i) => {
    const entra = anchoDisponible / (linea.length * AVANCE_INTER_BOLD * escalas[i])
    cuerpo = Math.min(cuerpo, entra)
  })

  const alto = escalas.reduce((t, e) => t + e * INTERLINEADO, 0)
  cuerpo = Math.min(cuerpo, altoDisponible / alto)

  return Math.floor(cuerpo)
}

/** Interlineado del titular. Apretado: es un bloque, no un párrafo. */
export const INTERLINEADO = 1.04

/** Techo del titular. Más grande que esto no es jerarquía, es un cartel. */
const CUERPO_MAXIMO = 128

/**
 * EL cuerpo del titular. Uno solo, siempre.
 *
 * Antes salía de "el más grande que entre", con techo y sin piso: un titular de
 * cuarenta caracteres se imprimía en 80 y uno de sesenta y cuatro en 54, en la
 * misma grilla y sin que nadie lo hubiera decidido. En el feed se ve como piezas
 * de dos marcas distintas.
 *
 * 84 no es un número elegido a ojo: es el más grande que deja entrar en CUATRO
 * líneas un titular de hasta ~50 caracteres dentro de la columna de texto y de
 * la banda del titular —el caso apretado, cuando además hay bloque de ítems—.
 * Medido contra los titulares de referencia del Brand Kit: los de 42 a 49
 * caracteres entran todos; los de 54 en adelante ya no. Por eso el copy tiene su
 * propio tope en `HEADLINE_MAX_CARACTERES`: los dos números son el mismo acuerdo
 * visto desde cada lado, y mover uno sin el otro rompe el trato.
 *
 * Si algún titular igual no entra, se achica para no desbordar sobre el logo y
 * queda registrado en consola. Eso es una pieza fuera de sistema, no el default.
 */
export const CUERPO_TITULAR = 84

const MAX_LINEAS_TITULAR = 5

/**
 * Corta el titular en N líneas lo más parejas posible.
 *
 * Minimiza la línea MÁS LARGA, que es la que manda: el cuerpo del titular sale
 * de ella, así que dos líneas de 12 caracteres dan letra más grande que una de 6
 * y una de 18 aunque sumen lo mismo. Programación dinámica sobre las palabras,
 * que con titulares de nueve palabras es instantáneo.
 */
function cortarEn(palabras: string[], lineas: number): string[] | null {
  if (lineas > palabras.length) return null

  // mejor[i][k] = el largo de la línea más larga al repartir las palabras desde
  // i en k líneas.
  const memo = new Map<string, { peor: number; corte: number }>()

  const resolver = (i: number, k: number): { peor: number; corte: number } => {
    const clave = `${i}:${k}`
    const guardado = memo.get(clave)
    if (guardado) return guardado

    let mejor = { peor: Infinity, corte: i + 1 }

    if (k === 1) {
      mejor = { peor: palabras.slice(i).join(" ").length, corte: palabras.length }
    } else {
      for (let j = i + 1; j <= palabras.length - (k - 1); j++) {
        const largo = palabras.slice(i, j).join(" ").length
        const resto = resolver(j, k - 1)
        const peor = Math.max(largo, resto.peor)
        if (peor < mejor.peor) mejor = { peor, corte: j }
      }
    }

    memo.set(clave, mejor)
    return mejor
  }

  const salida: string[] = []
  let i = 0
  for (let k = lineas; k > 0; k--) {
    const { corte } = resolver(i, k)
    salida.push(palabras.slice(i, corte).join(" "))
    i = corte
  }

  return salida
}

/**
 * El titular armado para que LLENE su columna.
 *
 * El sistema anterior imprimía los cortes tal como venían del modelo y calculaba
 * el cuerpo que entrara: con una línea larga —"sus costos de red."— el titular
 * salía chico y la pieza perdía fuerza. Acá es al revés: se prueban los repartos
 * posibles en 2, 3 y 4 líneas y gana el que permite la letra más grande.
 *
 * El texto no se toca nunca: se reparte en otras líneas, palabra por palabra.
 */
export function armarTitular({
  texto,
  anchoDisponible,
  altoDisponible,
  enfasisPrimera,
  cuerpoObjetivo,
  avisar = true,
}: {
  /** Las líneas como vinieron. Se reunifican y se vuelven a repartir. */
  texto: string[]
  anchoDisponible: number
  altoDisponible: number
  enfasisPrimera: boolean
  /** El cuerpo que la placa quiere. Ver `CUERPO_TITULAR`. */
  cuerpoObjetivo?: number
  /**
   * Si registrar el titular que no entró. Va en `false` cuando la llamada es una
   * MEDICIÓN y no un dibujo: `composicionDeTexto` prueba encajes a propósito, y
   * cada prueba fallida ensuciaba el log con una alarma que no lo era.
   */
  avisar?: boolean
}): { lineas: string[]; escalas: number[]; cuerpo: number } {
  const palabras = texto.join(" ").split(/\s+/).filter(Boolean)
  const objetivo = cuerpoObjetivo ?? CUERPO_TITULAR
  const tope = Math.min(MAX_LINEAS_TITULAR, palabras.length)

  const escalasDe = (n: number) =>
    Array.from({ length: n }, (_, i) => (enfasisPrimera && i === 0 ? 1.22 : 1))

  // 1 · El reparto con MENOS líneas que entra al cuerpo pedido. Se busca así y
  //     no al revés porque el cuerpo ya está decidido: lo que se elige acá es en
  //     cuántas líneas se parte para respetarlo.
  for (let n = 1; n <= tope; n++) {
    const lineas = cortarEn(palabras, n)
    if (!lineas) continue

    const escalas = escalasDe(lineas.length)
    const entraDeAncho = lineas.every(
      (linea, i) => linea.length * AVANCE_INTER_BOLD * objetivo * escalas[i] <= anchoDisponible
    )
    const entraDeAlto =
      escalas.reduce((t, e) => t + e * INTERLINEADO, 0) * objetivo <= altoDisponible

    if (entraDeAncho && entraDeAlto) return { lineas, escalas, cuerpo: objetivo }
  }

  // 2 · No entró ni con cinco líneas: el titular es más largo de lo que la
  //     grilla banca. Se achica lo mínimo para no desbordar sobre el logo, que
  //     es peor que una letra más chica. Se registra: la pieza salió fuera de
  //     sistema y el arreglo es acortar el copy.
  let mejor: { lineas: string[]; escalas: number[]; cuerpo: number } | null = null

  for (let n = 1; n <= tope; n++) {
    const lineas = cortarEn(palabras, n)
    if (!lineas) continue

    const escalas = escalasDe(lineas.length)

    let cuerpo = CUERPO_MAXIMO
    lineas.forEach((linea, i) => {
      cuerpo = Math.min(cuerpo, anchoDisponible / (linea.length * AVANCE_INTER_BOLD * escalas[i]))
    })

    const alto = escalas.reduce((t, e) => t + e * INTERLINEADO, 0)
    cuerpo = Math.floor(Math.min(cuerpo, altoDisponible / alto))

    if (!mejor || cuerpo > mejor.cuerpo) mejor = { lineas, escalas, cuerpo }
  }

  if (mejor && avisar) {
    console.warn(
      `[placa] el titular no entra en ${objetivo}px y sale en ${mejor.cuerpo}px: ` +
        `"${palabras.join(" ")}" (${palabras.join(" ").length} caracteres)`
    )
  }
  if (mejor) return mejor

  return { lineas: texto, escalas: texto.map(() => 1), cuerpo: objetivo }
}

/** El rótulo de arriba: chico, en versalita y con el tracking amplio del kit. */
export const EYEBROW = { cuerpo: 26, tracking: 0.14, peso: 600 } as const

/**
 * La bajada. Más grande que un ítem porque es prosa y no una etiqueta, y con
 * interlineado de párrafo: son dos o tres líneas seguidas, no una lista.
 */
export const BAJADA = { cuerpo: 40, peso: 400, interlineado: 1.4 } as const

/** Los ítems del bloque secundario: legibles en un teléfono, sin competir. */
export const ITEM = { cuerpo: 38, peso: 400 } as const

/** Títulos apretados: la regla del kit para pesos altos, que en el default se desarman. */
export const TRACKING_TITULAR = -0.03

/* ── La geometría del bloque de texto ─────────────────────────────────────── */

/**
 * El aire entre los tres componentes del grupo de texto.
 *
 * Vivía dentro del componente que dibuja la placa, y de ahí venía media
 * desprolijidad: el mismo número servía para separar los bloques al pintarlos y
 * para RESERVAR el alto que le queda al titular, y las dos cuentas estaban
 * escritas por separado. Acá arriba hay una sola.
 */
export const SEPARACION = {
  /** × el cuerpo del rótulo */
  eyebrow: 1.45,
  /** × el cuerpo del titular */
  bloque: 0.78,
  /** × el cuerpo del ítem */
  item: 0.8,
} as const

export type GeometriaTexto = {
  /** El margen del cuadro. */
  margen: number
  /** El ancho que puede usar una línea de titular. */
  util: number
  /** Dónde arranca la banda de texto. */
  bandaDesde: number
  /** Cuánto mide la banda de texto de punta a punta. */
  bandaAlto: number
  /** La separación entre el titular y el bloque de abajo. */
  separacionBloque: number
  /** Lo que se lleva el bloque secundario, si lo hay. */
  altoBloque: number
  /** Lo que le queda al titular, ya descontados el rótulo y el bloque. */
  altoTitular: number
}

/**
 * Dónde entra el texto de una placa. La única cuenta, para los dos que la usan.
 *
 * La usa el renderizador para dibujar y `revisarPlaca` para verificar. Que
 * sea la misma función es el punto: hasta ahora el presupuesto del copy
 * —`HEADLINE_MAX_CARACTERES`— y el que impone la grilla eran dos números
 * mantenidos a mano, con un comentario en cada archivo pidiéndole al que los
 * tocara que se acordara del otro. Un comentario no es una garantía.
 */
export function geometriaTexto({
  ancho,
  alto,
  layout,
  familia,
  items,
  bajada,
  eyebrow,
}: {
  ancho: number
  alto: number
  layout: string
  familia: string
  /** Cuántos ítems dibuja el bloque secundario. */
  items: number
  /** Si la pieza lleva bajada. */
  bajada: boolean
  /** Si la pieza lleva rótulo arriba. */
  eyebrow: boolean
}): GeometriaTexto {
  const centrado = layout === "centrado"
  const margen = Math.round(ancho * BANDAS.margen)
  const zona = zonaDeTexto(familia, layout)

  const util = centrado
    ? Math.round(ancho * zona.ancho)
    : Math.round(ancho * zona.ancho) - margen

  const bandaDesde = Math.round(alto * (centrado ? BANDAS.centradoDesde : BANDAS.titularDesde))
  const bandaAlto = centrado
    ? Math.round(alto * zona.alto)
    : Math.round(alto * (BANDAS.bloqueHasta - BANDAS.titularDesde))

  const separacionBloque = Math.round(CUERPO_TITULAR * SEPARACION.bloque)
  const altoBloque =
    layout === "bullets" && items > 0
      ? separacionBloque +
        items * ITEM.cuerpo +
        (items - 1) * Math.round(ITEM.cuerpo * SEPARACION.item)
      : layout === "bajada" && bajada
        ? separacionBloque + Math.round(alto * 0.22)
        : 0

  const altoEyebrow = eyebrow ? Math.round(EYEBROW.cuerpo * (1 + SEPARACION.eyebrow)) : 0

  return {
    margen,
    util,
    bandaDesde,
    bandaAlto,
    separacionBloque,
    altoBloque,
    altoTitular: bandaAlto - altoBloque - altoEyebrow,
  }
}

/**
 * Cómo queda el texto de una placa: cuántos ítems entran y a qué cuerpo sale el
 * titular.
 *
 * EL TITULAR MANDA SOBRE EL BLOQUE. La banda de texto es fija y la comparten los
 * dos, y con cuatro ítems queda tan apretada que un titular de dos oraciones
 * sale a dos tercios del cuerpo del feed. En la grilla de Instagram una pieza
 * con la letra más chica que sus vecinas se nota mucho más que una con tres
 * ítems en vez de cuatro: el sistema ya decía que el titular es "the loudest
 * element by a wide margin", y esto es esa frase convertida en una cuenta.
 * Nunca baja de dos ítems — una lista de uno no es una lista.
 *
 * Vive acá y no dentro del componente que dibuja porque la usan los dos lados: el
 * renderizador para componer y `revisarPlaca` para verificar. Cuando el recorte
 * de ítems vivía solo en el render, la verificación medía una composición que ya
 * no existía y marcaba fuera de sistema piezas que estaban bien.
 */
export function composicionDeTexto({
  formato,
  titular,
  layout,
  familia,
  items,
  bajada,
  eyebrow,
  enfasisPrimera = false,
  avisar = false,
}: {
  formato: Formato
  /** El titular, en las líneas que vinieran. Se reparte de nuevo igual. */
  titular: string[]
  layout: string
  familia: string
  /** Cuántos ítems trae el bloque secundario, antes de recortarlo. */
  items: number
  bajada: boolean
  eyebrow: boolean
  enfasisPrimera?: boolean
  /** Si registrar el titular que no llegó al cuerpo del sistema. */
  avisar?: boolean
}): {
  /** Cuántos ítems sobreviven al encaje. */
  visibles: number
  geometria: GeometriaTexto
  lineas: string[]
  escalas: number[]
  cuerpo: number
  /** Si el titular sale al cuerpo canónico del feed. */
  entra: boolean
} {
  const { ancho, alto } = MEDIDAS[formato]

  const encajar = (cuantos: number) => {
    const geometria = geometriaTexto({ ancho, alto, layout, familia, items: cuantos, bajada, eyebrow })
    return {
      geometria,
      titular: armarTitular({
        texto: titular,
        anchoDisponible: geometria.util,
        altoDisponible: geometria.altoTitular,
        enfasisPrimera,
        // El mismo para todas: dos piezas del feed no pueden salir con la letra
        // de dos tamaños distintos solo porque una escribió más caracteres.
        cuerpoObjetivo: CUERPO_TITULAR,
        // Los intentos de encaje no son alarmas: se avisa una sola vez, abajo,
        // y sobre la composición que de verdad se dibuja.
        avisar: false,
      }),
    }
  }

  let visibles = layout === "bullets" ? items : 0
  let encaje = encajar(visibles)
  while (encaje.titular.cuerpo < CUERPO_TITULAR && visibles > 2) {
    visibles--
    encaje = encajar(visibles)
  }

  const { lineas, escalas, cuerpo } = encaje.titular
  const entra = cuerpo >= CUERPO_TITULAR

  // Soltar un ítem no es un error del sistema, es el sistema resolviendo. Pero
  // se dice: es contenido que el derivador eligió y que no se imprime.
  if (avisar && visibles < items) {
    console.info(
      `[placa] el bloque baja de ${items} a ${visibles} ítems para que el titular ` +
        `salga en ${CUERPO_TITULAR}px: "${titular.join(" ")}"`
    )
  }

  if (!entra && avisar) {
    const texto = titular.join(" ")
    console.warn(
      `[placa] el titular no entra en ${CUERPO_TITULAR}px y sale en ${cuerpo}px: ` +
        `"${texto}" (${texto.length} caracteres)`
    )
  }

  return { visibles, geometria: encaje.geometria, lineas, escalas, cuerpo, entra }
}

/* ── El layout claro ──────────────────────────────────────────────────────── */

/**
 * La composición del tema claro. Apilada, no superpuesta.
 *
 * POR QUÉ NO ES UNO DE LOS CUATRO DE SIEMPRE. Los layouts oscuros apoyan el
 * texto SOBRE la foto y se defienden con un velo negro, que tapa cualquier cosa.
 * En claro ese velo tiene que ser sutil para no borrar la imagen, y con un
 * sujeto a la derecha el texto y la foto terminan peleando por el mismo lugar:
 * se probó y el resultado era ilegible.
 *
 * Acá nada se superpone. Logo, titular, bajada, sujeto y botón viven cada uno en
 * su franja, y la foto —que ES la pieza entera, a sangre— viene con la banda de
 * arriba vacía desde el propio pedido de la imagen.
 *
 * Los números salen de una maqueta que se afinó mirando piezas reales, no de una
 * grilla teórica.
 */
export const CLARO = {
  /** Dónde termina la franja del texto. Fija: es lo que garantiza el aire. */
  altoTexto: 520,
  logo: { ancho: 168, alto: 25, desdeArriba: 64 },
  titular: {
    desdeLogo: 46,
    /** El margen a cada lado. 1080 − 2×120 = 840 px de ancho útil. */
    margen: 120,
    /**
     * Los tres cuerpos posibles, de mayor a menor.
     *
     * Tres y no uno solo —como en oscuro, donde el cuerpo es fijo y el copy se
     * ajusta al cuerpo— porque acá el titular va SIEMPRE en dos líneas: no hay
     * un tercer renglón al que mandar lo que sobra. Cuando no entra a 74 no
     * queda otra que bajar un escalón.
     */
    cuerpos: [74, 64, 56],
    interlineado: 1.06,
  },
  bajada: { desdeTitular: 26, cuerpo: 30, interlineado: 1.4, maxLineas: 2 },
  /** El velo de la banda de arriba. La red por si el sujeto sube. */
  velo: { alto: 560 },
  cta: { cuerpo: 22, padeoX: 44, padeoY: 19 },
  pie: { desdeAbajo: 68, cuerpo: 20, separacion: 22 },
} as const

/** El ancho útil de una línea de texto en el tema claro. */
export const ANCHO_CLARO = MEDIDAS.square.ancho - 2 * CLARO.titular.margen

/**
 * Cuánto ocupa a lo ancho un carácter de Inter Regular, en múltiplos del cuerpo.
 *
 * Más angosto que la bold (`AVANCE_INTER_BOLD`, 0,55) porque la regular lo es.
 * Mismo criterio: el peor caso más margen, para que el error caiga siempre del
 * lado seguro — sobreestimar acorta el texto, subestimarlo lo hace desbordar.
 */
const AVANCE_INTER_REGULAR = 0.52

/** Lo que mide una línea de titular a un cuerpo dado, con su tracking. */
function anchoTitularClaro(linea: string, cuerpo: number): number {
  return linea.length * (AVANCE_INTER_BOLD + TRACKING_TITULAR) * cuerpo
}

/**
 * El titular claro: dos líneas parejas y el cuerpo más grande que las banque.
 *
 * DOS LÍNEAS SIEMPRE, y ahí está la diferencia con el oscuro. Allá el titular se
 * reparte en las que hagan falta —hasta cinco— y el cuerpo es fijo. Acá la
 * composición es centrada y de dos renglones: uno solo se ve desbalanceado
 * contra la bajada, y tres empujan el sujeto fuera de cuadro.
 *
 * El corte minimiza la línea MÁS LARGA, que es la que decide el cuerpo. Un
 * titular de una sola palabra es el único caso de una línea.
 */
export function armarTitularClaro(texto: string): {
  lineas: string[]
  cuerpo: number
  entra: boolean
} {
  const palabras = texto.trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return { lineas: [], cuerpo: CLARO.titular.cuerpos[0], entra: false }

  if (palabras.length === 1) {
    const cuerpo =
      CLARO.titular.cuerpos.find((c) => anchoTitularClaro(palabras[0], c) <= ANCHO_CLARO) ??
      CLARO.titular.cuerpos[CLARO.titular.cuerpos.length - 1]
    return { lineas: [palabras[0]], cuerpo, entra: cuerpo === CLARO.titular.cuerpos[0] }
  }

  /*
   * El corte, con tres criterios y en este orden.
   *
   * 1 · SI SON DOS ORACIONES, se corta entre ellas. "Tu red ya no tiene borde. /
   *     ¿Tu seguridad lo sabe?" es el corte que el titular ya trae escrito, y
   *     ningún reparto por largo lo va a mejorar.
   * 2 · La primera línea NO TERMINA COLGADA. Minimizando solo el largo salía
   *     "Firmar en pantalla no / es escanear tu firma": las dos líneas quedan
   *     parejas y el "no" cuelga al final de la primera, separado de lo que
   *     niega. Se descartan esos cortes antes de mirar el largo.
   * 3 · Entre los que quedan, el que deja la línea más larga lo más corta
   *     posible: es la que decide el cuerpo.
   *
   * `terminaColgado` es la misma función que protege al titular del tema oscuro
   * de publicarse a medias. Ahí decide si una frase quedó rota; acá, dónde
   * respira.
   */
  const oraciones = oracionesDe(texto)
  if (oraciones.length === 2) {
    const porOracion = oraciones.map((o) => o.trim())
    const cuerpoOracion = CLARO.titular.cuerpos.find((c) =>
      porOracion.every((l) => anchoTitularClaro(l, c) <= ANCHO_CLARO)
    )
    if (cuerpoOracion) {
      return {
        lineas: porOracion,
        cuerpo: cuerpoOracion,
        entra: cuerpoOracion === CLARO.titular.cuerpos[0],
      }
    }
  }

  const cortes: { lineas: string[]; peor: number; colgado: boolean }[] = []
  for (let corte = 1; corte < palabras.length; corte++) {
    const a = palabras.slice(0, corte).join(" ")
    const b = palabras.slice(corte).join(" ")
    cortes.push({ lineas: [a, b], peor: Math.max(a.length, b.length), colgado: terminaColgado(a) })
  }

  const limpios = cortes.filter((c) => !c.colgado)
  const candidatos = limpios.length > 0 ? limpios : cortes
  const mejor = candidatos.reduce((m, c) => (c.peor < m.peor ? c : m))

  const cuerpo =
    CLARO.titular.cuerpos.find((c) =>
      mejor.lineas.every((l) => anchoTitularClaro(l, c) <= ANCHO_CLARO)
    ) ?? CLARO.titular.cuerpos[CLARO.titular.cuerpos.length - 1]

  return { lineas: mejor.lineas, cuerpo, entra: cuerpo === CLARO.titular.cuerpos[0] }
}

/**
 * El techo de caracteres del titular claro, DERIVADO de la geometría.
 *
 * No es un número elegido: es lo que entra en dos líneas al cuerpo más grande.
 * Se calcula acá para que el prompt y el renderizador no puedan discrepar —el
 * mismo problema que en oscuro obligó a documentar que `HEADLINE_MAX_CARACTERES`
 * y `CUERPO_TITULAR` son "el mismo acuerdo visto desde cada lado", solo que acá
 * el acuerdo se computa en vez de mantenerse a mano.
 */
export const HEADLINE_MAX_CLARO = Math.floor(
  (ANCHO_CLARO / ((AVANCE_INTER_BOLD + TRACKING_TITULAR) * CLARO.titular.cuerpos[0])) * 2
)

/** Lo mismo para la bajada: dos líneas centradas al cuerpo de la bajada. */
export const BAJADA_MAX_CLARO = Math.floor(
  (ANCHO_CLARO / (AVANCE_INTER_REGULAR * CLARO.bajada.cuerpo)) * CLARO.bajada.maxLineas
)

/**
 * El techo del llamado a la acción.
 *
 * Va en VERSALITA, y una mayúscula de Inter mide 0,89 del cuerpo contra los 0,55
 * de la caja baja: un techo pensado para minúsculas dejaría el botón más ancho
 * que la pieza. Se descuenta el relleno de la pastilla a los dos lados.
 */
export const CTA_MAX_CLARO = Math.floor(
  (ANCHO_CLARO - 2 * CLARO.cta.padeoX) / ((0.89 + 0.07) * CLARO.cta.cuerpo)
)

/**
 * El cuerpo más chico que se acepta sin rehacer el titular.
 *
 * 74 es el objetivo y 64 es tolerable —medido mirando piezas, a 64 la pieza
 * sigue leyéndose bien—. De 56 para abajo el titular pierde la presencia que
 * justifica todo el layout, y ahí conviene reescribir el copy antes que publicar
 * una pieza floja.
 */
export const CUERPO_ACEPTABLE_CLARO = 64

/**
 * EL TECHO QUE IMPORTA: cuántos caracteres entran en UNA línea.
 *
 * No es lo mismo que el techo del titular entero, y confundirlos es el error que
 * este número viene a evitar. Medido sobre los 67 titulares reales del banco:
 * "Nadie espera el cierre. Ya está." son 32 caracteres —muy por debajo de
 * cualquier techo total razonable— y NO entra a 74 px, porque parte en 23 + 9.
 * Lo que decide el cuerpo es la línea más larga; el total no dice nada.
 *
 * Por eso el prompt del tema claro pide DOS LÍNEAS con este presupuesto cada
 * una, en vez de un titular con un techo global: así el modelo elige el corte
 * sabiendo contra qué lo tiene que medir.
 */
export const LINEA_MAX_CLARO = Math.floor(
  ANCHO_CLARO / ((AVANCE_INTER_BOLD + TRACKING_TITULAR) * CLARO.titular.cuerpos[0])
)

/** Lo mismo con el cuerpo tolerable: hasta acá se acepta sin reescribir. */
export const LINEA_MAX_CLARO_TOLERADA = Math.floor(
  ANCHO_CLARO / ((AVANCE_INTER_BOLD + TRACKING_TITULAR) * CUERPO_ACEPTABLE_CLARO)
)

/**
 * En cuántas líneas cae la bajada, simulando el mismo corte que hace el motor.
 *
 * Corte codicioso por palabras, que es lo que hace cualquier repartidor de
 * texto: se van agregando palabras mientras entren y se baja de línea cuando no.
 * Contar caracteres y dividir daría un número optimista —el ajuste por palabra
 * siempre desperdicia el final de cada línea— y esa diferencia es justo la que
 * hace que una bajada de tres líneas empuje el bloque sobre la foto.
 */
export function lineasBajadaClaro(texto: string): number {
  const palabras = texto.trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return 0

  const porCaracter = AVANCE_INTER_REGULAR * CLARO.bajada.cuerpo
  let lineas = 1
  let actual = ""

  for (const palabra of palabras) {
    const tentativa = actual ? `${actual} ${palabra}` : palabra
    if (tentativa.length * porCaracter <= ANCHO_CLARO) {
      actual = tentativa
    } else {
      lineas++
      actual = palabra
    }
  }

  return lineas
}

/** Si el llamado a la acción entra en la pastilla. Va en versalita: mide más. */
export function entraCtaClaro(texto: string): boolean {
  const ancho = texto.trim().length * (0.89 + 0.07) * CLARO.cta.cuerpo
  return ancho <= ANCHO_CLARO - 2 * CLARO.cta.padeoX
}
