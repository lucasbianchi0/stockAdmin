import { inflateRawSync } from "node:zlib"

/**
 * Leer un `.xlsx` sin dependencias.
 *
 * ¿POR QUÉ A MANO, OTRA VEZ?
 *
 * Por lo mismo que el parser de CSV de `importar-csv.ts`: el formato que hay que
 * soportar es angosto y estable, y lo que se evita es grande. Las librerías de
 * Excel de npm pesan entre 800 KB y varios megas, arrastran su propio parser de
 * XML, aparecen cada tanto en avisos de seguridad por el prototipo de `Object`,
 * y son código que corre del lado del servidor sobre un archivo que sube un
 * usuario. Acá son ciento cincuenta líneas que hacen exactamente tres cosas:
 * descomprimir un ZIP, leer dos XML y devolver una grilla de strings.
 *
 * QUÉ SOPORTA Y QUÉ NO
 *
 * Un `.xlsx` es un ZIP con XML adentro. Se leen la primera hoja y la tabla de
 * cadenas compartidas, que es todo lo que hace falta para una planilla de datos.
 * **No** se leen fórmulas (se toma el último valor calculado que Excel dejó
 * escrito), ni formatos, ni fechas como fecha —una celda de fecha vuelve como el
 * número de serie de Excel, y quien la use tiene que saberlo—. Para el plan de
 * cuentas eso alcanza de sobra: son códigos, nombres y banderas de texto.
 *
 * El `.xls` viejo —el binario de Excel 97— no entra por acá y no hay forma de
 * hacerlo entrar: es otro formato entero. La pantalla lo dice antes de subir.
 */

/* ── ZIP ──────────────────────────────────────────────────────────────────── */

/** Fin del directorio central: `PK\x05\x06`. */
const EOCD = 0x06054b50
/** Entrada del directorio central: `PK\x01\x02`. */
const ENTRADA = 0x02014b50
/** Cabecera local de un archivo: `PK\x03\x04`. */
const LOCAL = 0x04034b50

export class ArchivoInvalido extends Error {}

/**
 * Los archivos del ZIP, por nombre.
 *
 * Se recorre el **directorio central** y no las cabeceras locales, aunque
 * recorrer el archivo de principio a fin sea más corto de escribir: una cabecera
 * local puede traer los tamaños en cero y dejarlos para un descriptor que va
 * después de los datos comprimidos, y ahí no hay forma de saber dónde termina
 * cada entrada sin descomprimir a ciegas. El directorio central siempre los
 * tiene.
 */
function abrirZip(buf: Buffer): Map<string, Buffer> {
  // El EOCD está al final, pero puede tener hasta 64 KB de comentario detrás.
  let fin = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      fin = i
      break
    }
  }
  if (fin < 0) throw new ArchivoInvalido("El archivo no es un .xlsx válido")

  const cantidad = buf.readUInt16LE(fin + 10)
  const inicioDirectorio = buf.readUInt32LE(fin + 16)

  // ZIP64 usa 0xFFFFFFFF como "el valor real está en el registro extendido".
  // Un .xlsx de una planilla nunca llega ahí, y adivinar sería peor que avisar.
  if (inicioDirectorio === 0xffffffff) {
    throw new ArchivoInvalido("El archivo usa ZIP64 y es demasiado grande para leerlo acá")
  }

  const archivos = new Map<string, Buffer>()
  let p = inicioDirectorio

  for (let i = 0; i < cantidad && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== ENTRADA) break

    const metodo = buf.readUInt16LE(p + 10)
    const comprimido = buf.readUInt32LE(p + 20)
    const largoNombre = buf.readUInt16LE(p + 28)
    const largoExtra = buf.readUInt16LE(p + 30)
    const largoComentario = buf.readUInt16LE(p + 32)
    const inicioLocal = buf.readUInt32LE(p + 42)
    const nombre = buf.toString("utf8", p + 46, p + 46 + largoNombre)

    p += 46 + largoNombre + largoExtra + largoComentario

    // Solo lo que se va a mirar. Un .xlsx trae temas, estilos y miniaturas que
    // no aportan nada y que descomprimir es tiempo regalado.
    if (!/^xl\/(worksheets\/|sharedStrings\.xml|workbook\.xml)/.test(nombre)) continue

    if (buf.readUInt32LE(inicioLocal) !== LOCAL) continue
    const nombreLocal = buf.readUInt16LE(inicioLocal + 26)
    const extraLocal = buf.readUInt16LE(inicioLocal + 28)
    const datos = inicioLocal + 30 + nombreLocal + extraLocal
    const crudo = buf.subarray(datos, datos + comprimido)

    if (metodo === 0) archivos.set(nombre, Buffer.from(crudo))
    else if (metodo === 8) archivos.set(nombre, inflateRawSync(crudo))
    // Cualquier otro método de compresión lo escribe algo que no es Excel.
  }

  if (archivos.size === 0) throw new ArchivoInvalido("El .xlsx no tiene hojas adentro")
  return archivos
}

/* ── XML ──────────────────────────────────────────────────────────────────── */

/** Las cinco entidades que XML define. Excel no escribe otras. */
function desescapar(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&") // Último, o desharía los escapes de arriba dos veces.
}

/** El texto de un fragmento: todos los `<t>` concatenados. Una celda con
 *  formato mixto viene partida en varios `<r><t>`, y son una sola cadena. */
function textoDe(fragmento: string): string {
  const partes = [...fragmento.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1])
  return desescapar(partes.join(""))
}

/** La tabla de cadenas compartidas: Excel guarda cada texto una sola vez y las
 *  celdas lo referencian por índice. */
function leerCadenas(xml: string | undefined): string[] {
  if (!xml) return []
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1]))
}

/** `"BC12"` → `54`. La columna sale de las letras del nombre de la celda, que es
 *  lo único que dice en qué columna está: Excel omite las celdas vacías. */
function indiceDeColumna(ref: string): number {
  let n = 0
  for (const c of ref) {
    const codigo = c.charCodeAt(0)
    if (codigo < 65 || codigo > 90) break
    n = n * 26 + (codigo - 64)
  }
  return n - 1
}

/* ── La grilla ────────────────────────────────────────────────────────────── */

export type Grilla = { cabeceras: string[]; filas: string[][] }

/**
 * La primera hoja del libro como una grilla de texto, con la primera fila como
 * encabezados — la misma forma que devuelve `parsearCsv`, para que lo que sigue
 * no tenga que saber de dónde vino.
 *
 * Las celdas vacías salen como `""` y las filas se rellenan hasta el ancho del
 * encabezado: sin eso, una fila a la que le falta la última columna devuelve un
 * array más corto y el acceso por índice se corre de campo en silencio.
 */
export function leerXlsx(bytes: ArrayBuffer): Grilla {
  const archivos = abrirZip(Buffer.from(bytes))
  const cadenas = leerCadenas(archivos.get("xl/sharedStrings.xml")?.toString("utf8"))

  /* La primera hoja por número de archivo y no en el orden del Map: `sheet10`
     ordena antes que `sheet2` alfabéticamente, y ahí "la primera" sería la
     equivocada en cualquier libro de más de nueve hojas. */
  const hojas = [...archivos.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))

  if (hojas.length === 0) throw new ArchivoInvalido("El .xlsx no tiene ninguna hoja")

  const hoja = archivos.get(hojas[0])!.toString("utf8")
  const filasCrudas: string[][] = []

  for (const fila of hoja.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const celdas: string[] = []

    for (const c of fila[1].matchAll(/<c\s+r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const columna = indiceDeColumna(c[1])
      const tipo = /t="([^"]+)"/.exec(c[2])?.[1]

      let valor = ""
      if (tipo === "inlineStr") {
        valor = textoDe(c[3])
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(c[3])?.[1]
        if (v !== undefined) {
          valor = tipo === "s" ? (cadenas[Number(v)] ?? "") : desescapar(v)
        }
      }

      while (celdas.length < columna) celdas.push("")
      celdas[columna] = valor
    }

    filasCrudas.push(celdas)
  }

  // Las filas en blanco de abajo —Excel deja unas cuantas— no son datos.
  const utiles = filasCrudas.filter((f) => f.some((v) => v.trim() !== ""))
  const [cabeceras = [], ...resto] = utiles
  const ancho = cabeceras.length

  return {
    cabeceras: cabeceras.map((c) => c.trim()),
    filas: resto.map((f) => {
      const completa = f.slice(0, ancho)
      while (completa.length < ancho) completa.push("")
      return completa
    }),
  }
}

/** Por extensión, igual que el CSV: Windows manda los `.xlsx` con MIME variado
 *  o vacío, y la extensión es lo único estable. */
export function esXlsx(nombre: string): boolean {
  return /\.xlsx$/i.test(nombre.trim())
}
