/**
 * El logo se compone acá, no lo dibuja el generador.
 *
 * Pedirle el logo a un modelo de imágenes es pedirle que dibuje de memoria una
 * marca que no conoce: sale distinto en cada pieza, con la "A" torcida o con
 * otra tipografía, y no hay prompt que lo estabilice. Con la referencia visual
 * adelante mejora bastante, pero "bastante" no sirve para un logotipo: o es el
 * logo o no es el logo.
 *
 * Componerlo después resuelve las tres cosas de una: es el archivo oficial, sale
 * idéntico en las quince piezas y siempre en la misma posición. La contracara es
 * que el prompt tiene que reservarle el lugar — si el generador llena la esquina
 * con foto o con texto, el logo se monta encima de algo.
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"

import sharp from "sharp"

/** El logotipo blanco con el acento azul: el que el kit marca para fondo oscuro. */
/** El logo por defecto: el blanco, que es el de las piezas oscuras. */
const ARCHIVO_LOGO = "public/brand/accedra-logo-blanco.svg"

/** Proporción del SVG oficial (1073 × 160). Fija: el logo no se deforma. */
const RATIO_LOGO = 1073 / 160

/**
 * Cuánto del ancho de la pieza ocupa el logo.
 *
 * 22% sobre 1080 px de feed son ~237 px de ancho, bastante por encima del mínimo
 * de 120 px que fija el manual y en la misma proporción que tiene en la placa de
 * referencia. Es relativo al ancho real y no un número de píxeles para que valga
 * igual en 1K, 2K y en las piezas apaisadas.
 */
const ANCHO_RELATIVO = 0.22

/**
 * El margen. 7% del ancho, el mismo que ya usa el sistema visual para el texto.
 *
 * Se mide sobre el ANCHO en los dos ejes a propósito: en una pieza apaisada un
 * 7% del alto sería un margen inferior mucho más chico que el izquierdo, y el
 * logo quedaría descolgado hacia abajo.
 */
const MARGEN_RELATIVO = 0.07

/* ── Piezas enmarcadas ────────────────────────────────────────────────────── */

/**
 * El generador, cada tanto, devuelve el arte encogido y flotando dentro del
 * cuadro — una presentación de la pieza en vez de la pieza. Cuando pasa, el logo
 * que componemos en la esquina real del cuadro cae AFUERA del arte, sobre el
 * marco, y la pieza es basura.
 *
 * La versión anterior buscaba el marco por brillo: si las cuatro franjas del
 * borde estaban CLARAS, era un mockup. Se le escapaba el caso más común —marco
 * NEGRO— porque la primera franja oscura cortaba la función en falso. Y por
 * diseño no podía hacer otra cosa: en este sistema las piezas legítimas también
 * son casi negras en el borde, así que el brillo no separa una cosa de la otra.
 *
 * Lo que sí las separa es el ESCALÓN: un marco termina en un salto de brillo
 * recto, a la misma altura por los dos lados. Un fondo a sangre no tiene ese
 * salto. Buscarlo además devuelve gratis el rectángulo del arte, que es lo que
 * hace falta para recortarlo.
 */
type Marco = { left: number; top: number; width: number; height: number }

/** Diferencia de brillo (0-255) que cuenta como escalón. */
const ESCALON = 8

/** Píxeles seguidos que tiene que sostener el salto para no ser ruido de JPEG. */
const CORRIDA = 4

/** Un marco más fino que esto es el redondeo del generador, no un encuadre. */
const MARCO_MINIMO = 0.015

/** Más que esto comido por lado y no estamos recortando un marco, sino el arte. */
const MARCO_MAXIMO = 0.3

/** Desvío máximo del marco para considerarlo plano. Un degradé real supera esto. */
const PLANITUD = 5

/**
 * A qué distancia del borde arranca el arte, mirando una sola línea de píxeles.
 *
 * Devuelve 0 si nunca hay un salto sostenido: ese lado llega a sangre.
 */
function offsetEscalon(muestras: number[]): number {
  const base = muestras[0]
  const tope = muestras.length - CORRIDA
  for (let i = 1; i < tope; i++) {
    if (Math.abs(muestras[i] - base) < ESCALON) continue
    let sostenido = true
    for (let j = i; j < i + CORRIDA; j++) {
      if (Math.abs(muestras[j] - base) < ESCALON) {
        sostenido = false
        break
      }
    }
    if (sostenido) return i
  }
  return 0
}

/**
 * El rectángulo del arte, o null si la pieza vino a sangre.
 *
 * Pide los cuatro lados a la vez a propósito. Un encuadre siempre los tiene a
 * los cuatro; una foto que entra oscura por un solo borde, no. Exigirlos juntos
 * es lo que evita recortarle el fondo a una pieza legítima de la familia
 * `foto-real`, que es el error caro: una pieza buena mutilada se nota menos que
 * un mockup y se publica igual.
 */
export async function marcoDetectado(imagen: Buffer): Promise<Marco | null> {
  const { data, info } = await sharp(imagen)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const w = info.width
  const h = info.height
  if (!w || !h) return null

  // La fila y la columna del medio: cruzan el arte sí o sí, y desde el borde
  // hacia adentro lo primero que se cruza es el marco.
  const filaY = Math.floor(h / 2)
  const colX = Math.floor(w / 2)

  const fila: number[] = []
  for (let x = 0; x < w; x++) fila.push(data[filaY * w + x])
  const col: number[] = []
  for (let y = 0; y < h; y++) col.push(data[y * w + colX])

  const izquierda = offsetEscalon(fila)
  const derecha = offsetEscalon([...fila].reverse())
  const arriba = offsetEscalon(col)
  const abajo = offsetEscalon([...col].reverse())

  const minH = Math.round(w * MARCO_MINIMO)
  const minV = Math.round(h * MARCO_MINIMO)
  if (izquierda < minH || derecha < minH || arriba < minV || abajo < minV) return null

  if (
    izquierda > w * MARCO_MAXIMO ||
    derecha > w * MARCO_MAXIMO ||
    arriba > h * MARCO_MAXIMO ||
    abajo > h * MARCO_MAXIMO
  ) {
    return null
  }

  const marco: Marco = {
    left: izquierda,
    top: arriba,
    width: w - izquierda - derecha,
    height: h - arriba - abajo,
  }

  // Última barrera: un marco es liso. Si las franjas que vamos a tirar tienen
  // textura, lo que encontramos fue un cambio de escena dentro de una foto.
  const franjas = [
    { left: 0, top: 0, width: w, height: arriba },
    { left: 0, top: h - abajo, width: w, height: abajo },
    { left: 0, top: 0, width: izquierda, height: h },
    { left: w - derecha, top: 0, width: derecha, height: h },
  ]
  for (const franja of franjas) {
    if (!(await esPlana(imagen, franja))) return null
  }

  return marco
}

/**
 * ¿Esta franja es de un color solo?
 *
 * El `toBuffer()` del medio no es una vuelta de más: `stats()` NO respeta las
 * operaciones encadenadas antes, así que `sharp(x).extract(f).stats()` devuelve
 * las estadísticas de la imagen ENTERA y el recorte se pierde en silencio. Es lo
 * que hacía la versión anterior de esta función, que por eso medía el brillo de
 * toda la pieza creyendo que medía el del borde. Hay que materializar el recorte
 * en una imagen nueva para poder medirlo.
 */
async function esPlana(imagen: Buffer, franja: Marco): Promise<boolean> {
  const recorte = await sharp(imagen).extract(franja).toBuffer()
  const { channels } = await sharp(recorte).stats()
  return channels.every((c) => c.stdev <= PLANITUD)
}

/**
 * ¿La pieza vino enmarcada en vez de a sangre?
 *
 * Se conserva como pregunta aparte porque la ruta la usa para REGENERAR: una
 * pieza enmarcada además viene con el arte a menos resolución de la pedida, así
 * que pedirla de nuevo sale mejor que recortarla. El recorte de `conLogo` es el
 * paño frío para cuando el reintento vuelve a salir enmarcado.
 */
export async function vinoEnmarcada(imagen: Buffer): Promise<boolean> {
  try {
    return (await marcoDetectado(imagen)) !== null
  } catch (err) {
    console.error("[logo-pieza enmarcada]", err)
    return false
  }
}

/**
 * La medida final de una pieza, en píxeles.
 *
 * Existe porque el generador NO es una fuente confiable de medidas: se le pide
 * una relación de aspecto y una resolución nominal, y devuelve lo que le sale.
 * Lo que se publica tiene que entrar exacto en el feed, así que la última
 * palabra sobre el tamaño la tiene el código, no el modelo.
 */
export type Medida = { ancho: number; alto: number }

/**
 * Le pega el logotipo oficial a una pieza ya generada, en la medida final.
 *
 * Devuelve el JPEG con el logo abajo a la izquierda. Si algo falla —el archivo
 * no está, la imagen no se puede leer— devuelve la pieza original: una pieza sin
 * logo se arregla a mano, una pieza perdida no.
 *
 * El orden de los tres pasos importa:
 *
 * 1. RECORTAR el marco, si la pieza vino encuadrada. El logo se ubica por
 *    porcentaje sobre el cuadro, así que sobre una pieza enmarcada caía en la
 *    esquina del MARCO —afuera del arte— y la pieza quedaba inservible.
 * 2. LLEVAR A LA MEDIDA final. Acá se empareja todo: la pieza sana viene de
 *    ~2048 y la rescatada de ~1670, y las dos BAJAN a 1080. Bajar no pierde
 *    nitidez; por eso se normaliza acá y no antes del recorte.
 * 3. COMPONER el logo, ya sobre el tamaño definitivo, para que el SVG se
 *    rasterice justo al ancho que va a tener y no se reescale después.
 */
export async function conLogo(imagen: Buffer, medida: Medida): Promise<Buffer> {
  try {
    const marco = await marcoDetectado(imagen).catch(() => null)

    // Ruidoso a propósito. Llegar acá significa que la pieza salió enmarcada Y
    // que el reintento también, así que la estamos rescatando: sale más chica
    // que la pedida. Y es el único lugar donde se vería el error contrario —un
    // recorte sobre una pieza que estaba bien—, que no tiene ninguna otra señal.
    if (marco) {
      console.warn(
        `[logo-pieza] pieza enmarcada, recortando al arte: ${marco.width}x${marco.height} en +${marco.left}+${marco.top}`
      )
    }

    const recortada = marco ? await sharp(imagen).extract(marco).toBuffer() : imagen

    /**
     * `cover` y no `fill`: si el recorte quedó un par de píxeles fuera de
     * escuadra —al arte de la pieza medida le sobraban 2 px de alto— `fill` lo
     * estiraría y la tipografía saldría deformada. `cover` recorta esa astilla
     * desde el centro, que no se ve.
     */
    const arte = await sharp(recortada)
      .resize({ width: medida.ancho, height: medida.alto, fit: "cover", position: "centre" })
      .toBuffer()

    return await soloLogo(arte)
  } catch (err) {
    console.error("[logo-pieza]", err)
    return imagen
  }
}

/**
 * El paso 3 solo: pegar el logotipo sobre un arte que YA está en medida.
 *
 * Existe aparte porque las placas renderizadas por código (`lib/placa`) salen del
 * renderizador con la medida exacta y sin ninguna posibilidad de venir
 * enmarcadas: pasarlas por `conLogo` las haría atravesar una detección de marco
 * que solo puede equivocarse. Un titular blanco sobre fondo plano es justamente
 * la forma que `offsetEscalon` lee como escalón, así que el riesgo no es teórico.
 *
 * `conLogo` la usa para su último paso, de modo que las dos vías componen el logo
 * con las mismas constantes y no hay dos posiciones posibles para la marca.
 */
/**
 * Dónde se apoya la marca.
 *
 * El tema oscuro la pone abajo a la izquierda, cerrando la columna de texto. El
 * claro la pone centrada arriba, encabezando la pieza: es lo primero que se lee
 * y lo que sostiene la simetría de una composición centrada. La misma marca en
 * el mismo tamaño, en el rincón que cada composición le deja.
 */
export type PosicionLogo = "abajo-izquierda" | "arriba-centro"

export async function soloLogo(
  arte: Buffer,
  archivoLogo = ARCHIVO_LOGO,
  posicion: PosicionLogo = "abajo-izquierda"
): Promise<Buffer> {
  const base = sharp(arte)
  const { width, height } = await base.metadata()
  if (!width || !height) return arte

  const anchoLogo = Math.round(width * ANCHO_RELATIVO)
  const altoLogo = Math.round(anchoLogo / RATIO_LOGO)
  const margen = Math.round(width * MARGEN_RELATIVO)

  // El SVG se rasteriza al ancho pedido en vez de escalar un PNG ya rendereado:
  // sobre 1080 el logo mide 237 px y cualquier bitmap más chico llegaría blando.
  const svg = await readFile(join(process.cwd(), archivoLogo))
  const logo = await sharp(svg, { density: 300 })
    .resize({ width: anchoLogo, height: altoLogo, fit: "contain" })
    .png()
    .toBuffer()

  const left =
    posicion === "arriba-centro" ? Math.round((width - anchoLogo) / 2) : margen
  const top =
    posicion === "arriba-centro"
      ? Math.round(height * (64 / 1080))
      : height - margen - altoLogo

  return await base
    .composite([{ input: logo, left, top }])
    // 92 y no 100: la diferencia no se ve en un feed y son ~700 KB menos por
    // pieza viajando en base64 hasta el bucket.
    .jpeg({ quality: 92 })
    .toBuffer()
}
