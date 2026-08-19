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
}: {
  /** Las líneas como vinieron. Se reunifican y se vuelven a repartir. */
  texto: string[]
  anchoDisponible: number
  altoDisponible: number
  enfasisPrimera: boolean
  /** El cuerpo que la placa quiere. Ver `CUERPO_TITULAR`. */
  cuerpoObjetivo?: number
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

  if (mejor) {
    console.warn(
      `[placa] el titular no entra en ${objetivo}px y sale en ${mejor.cuerpo}px: ` +
        `"${palabras.join(" ")}" (${palabras.join(" ").length} caracteres)`
    )
    return mejor
  }

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
