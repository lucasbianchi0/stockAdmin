import { ArchivoInvalido } from "@/lib/admin/xlsx"

/**
 * Leer un `.xls` —el binario de Excel 97 a 2003— sin dependencias.
 *
 * ¿POR QUÉ EXISTE, SI `xlsx.ts` DICE QUE ESTO NO ENTRA?
 *
 * Porque LinkedIn exporta la analítica de las páginas en este formato y no
 * ofrece otro. Las razones para no sumar una librería de Excel siguen siendo
 * las de `xlsx.ts`; lo que cambia es que acá no hay alternativa que pedirle a
 * quien sube el archivo.
 *
 * Un `.xls` son dos capas:
 *
 *   1. Un "Compound File" de OLE: un mini sistema de archivos en sectores, con
 *      su tabla de asignación (FAT), un directorio y streams adentro. El que
 *      importa se llama `Workbook` (o `Book` en archivos muy viejos).
 *   2. Adentro de ese stream, registros BIFF8: `[tipo u16][largo u16][datos]`.
 *      Primero el globals (la tabla de textos compartidos y la lista de hojas),
 *      después cada hoja con sus celdas.
 *
 * QUÉ SOPORTA Y QUÉ NO
 *
 * Todas las hojas, como grillas de texto. Celdas de texto (compartido o
 * directo), números (los tres formatos: `NUMBER`, `RK` y `MULRK`), booleanos y
 * el último valor calculado de las fórmulas. **No** formatos: una fecha
 * guardada como fecha vuelve como número de serie de Excel —LinkedIn las
 * escribe como texto, así que no hace falta—. Tampoco archivos cifrados.
 */

export type Hoja = { nombre: string; filas: string[][] }

export function esXls(nombre: string): boolean {
  return /\.xls$/i.test(nombre.trim())
}

/** Cada hoja del libro, en orden, como filas de texto. */
export function leerXls(bytes: ArrayBuffer): Hoja[] {
  const libro = streamDelLibro(Buffer.from(bytes))
  return leerBiff(libro)
}

/* ── Compound File ────────────────────────────────────────────────────────── */

const FIRMA = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
const FIN_DE_CADENA = 0xfffffffe
const LIBRE = 0xffffffff

function streamDelLibro(buf: Buffer): Buffer {
  if (buf.length < 512 || !buf.subarray(0, 8).equals(FIRMA)) {
    throw new ArchivoInvalido("El archivo no es un .xls de Excel")
  }

  const tamSector = 1 << buf.readUInt16LE(0x1e)
  const tamMini = 1 << buf.readUInt16LE(0x20)
  const inicioDirectorio = buf.readUInt32LE(0x30)
  const corteMini = buf.readUInt32LE(0x38)
  const inicioMiniFat = buf.readUInt32LE(0x3c)
  const inicioDifat = buf.readUInt32LE(0x44)
  const sectoresDifat = buf.readUInt32LE(0x48)

  // El sector N empieza después de la cabecera, que ocupa un sector entero
  // (512 bytes en la versión 3, 4096 en la 4).
  const sector = (n: number) => {
    const desde = (n + 1) * tamSector
    return buf.subarray(desde, desde + tamSector)
  }

  /* Dónde está la FAT: los primeros 109 sectores los dice la cabecera; si hay
     más, siguen en una cadena de sectores DIFAT, cada uno con su último lugar
     reservado para apuntar al siguiente. */
  const sectoresFat: number[] = []
  for (let i = 0; i < 109; i++) {
    const s = buf.readUInt32LE(0x4c + i * 4)
    if (s !== LIBRE) sectoresFat.push(s)
  }
  let difat = inicioDifat
  for (let i = 0; i < sectoresDifat && difat !== FIN_DE_CADENA; i++) {
    const s = sector(difat)
    const porSector = tamSector / 4 - 1
    for (let j = 0; j < porSector; j++) {
      const v = s.readUInt32LE(j * 4)
      if (v !== LIBRE) sectoresFat.push(v)
    }
    difat = s.readUInt32LE(porSector * 4)
  }

  const fat: number[] = []
  for (const s of sectoresFat) {
    const datos = sector(s)
    for (let j = 0; j < tamSector; j += 4) fat.push(datos.readUInt32LE(j))
  }

  const cadena = (inicio: number, tabla: number[]): number[] => {
    const salida: number[] = []
    // El tope corta una FAT circular —un archivo roto— antes de colgar el server.
    for (let s = inicio; s !== FIN_DE_CADENA && s < tabla.length && salida.length <= tabla.length; s = tabla[s]) {
      salida.push(s)
    }
    return salida
  }
  const leerCadena = (inicio: number) => Buffer.concat(cadena(inicio, fat).map(sector))

  /* Directorio: entradas de 128 bytes con nombre en UTF-16, tipo, primer
     sector y tamaño. La 0 es la raíz, que guarda el mini stream. */
  const directorio = leerCadena(inicioDirectorio)
  const entradas: { nombre: string; tipo: number; inicio: number; tam: number }[] = []
  for (let off = 0; off + 128 <= directorio.length; off += 128) {
    const largo = directorio.readUInt16LE(off + 0x40)
    const nombre = directorio.subarray(off, off + Math.max(0, largo - 2)).toString("utf16le")
    entradas.push({
      nombre,
      tipo: directorio[off + 0x42],
      inicio: directorio.readUInt32LE(off + 0x74),
      tam: directorio.readUInt32LE(off + 0x78),
    })
  }

  const libro = entradas.find((e) => e.tipo === 2 && (e.nombre === "Workbook" || e.nombre === "Book"))
  if (!libro) throw new ArchivoInvalido("El .xls no tiene un libro de Excel adentro")

  if (libro.tam >= corteMini) return leerCadena(libro.inicio).subarray(0, libro.tam)

  // Un libro chico vive en el mini stream: sectores de 64 bytes adentro del
  // stream de la raíz, con su propia tabla.
  const raiz = entradas[0]
  const miniStream = leerCadena(raiz.inicio)
  const miniFatBytes = leerCadena(inicioMiniFat)
  const miniFat: number[] = []
  for (let j = 0; j + 4 <= miniFatBytes.length; j += 4) miniFat.push(miniFatBytes.readUInt32LE(j))
  return Buffer.concat(
    cadena(libro.inicio, miniFat).map((n) => miniStream.subarray(n * tamMini, (n + 1) * tamMini))
  ).subarray(0, libro.tam)
}

/* ── BIFF8 ────────────────────────────────────────────────────────────────── */

const BOF = 0x0809
const EOF = 0x000a
const BOUNDSHEET = 0x0085
const SST = 0x00fc
const CONTINUE = 0x003c
const LABELSST = 0x00fd
const LABEL = 0x0204
const NUMBER = 0x0203
const RK = 0x027e
const MULRK = 0x00bd
const BOOLERR = 0x0205
const FORMULA = 0x0006
const STRING = 0x0207
const FILEPASS = 0x002f

type Registro = { tipo: number; datos: Buffer; pos: number }

function registros(buf: Buffer, desde = 0): Registro[] {
  const lista: Registro[] = []
  for (let off = desde; off + 4 <= buf.length; ) {
    const tipo = buf.readUInt16LE(off)
    const largo = buf.readUInt16LE(off + 2)
    lista.push({ tipo, datos: buf.subarray(off + 4, off + 4 + largo), pos: off })
    off += 4 + largo
  }
  return lista
}

function leerBiff(libro: Buffer): Hoja[] {
  const globales = registros(libro)
  const hojasDeclaradas: { nombre: string; pos: number }[] = []
  let textos: string[] = []

  for (let i = 0; i < globales.length; i++) {
    const r = globales[i]
    if (r.tipo === FILEPASS) throw new ArchivoInvalido("El .xls está protegido con contraseña")
    if (r.tipo === BOUNDSHEET) {
      // Sólo hojas de cálculo (tipo 0); los gráficos sueltos no tienen celdas.
      if (r.datos[5] !== 0) continue
      hojasDeclaradas.push({ pos: r.datos.readUInt32LE(0), nombre: textoCorto(r.datos, 6) })
    }
    if (r.tipo === SST) {
      const partes = [r.datos]
      while (globales[i + 1]?.tipo === CONTINUE) partes.push(globales[++i].datos)
      textos = leerSst(partes)
    }
    if (r.tipo === EOF) break
  }

  return hojasDeclaradas.map((h) => ({ nombre: h.nombre, filas: leerHoja(libro, h.pos, textos) }))
}

function leerHoja(libro: Buffer, pos: number, textos: string[]): string[][] {
  const celdas: string[][] = []
  const poner = (fila: number, col: number, valor: string) => {
    ;(celdas[fila] ??= [])[col] = valor
  }
  let formulaPendiente: [number, number] | null = null

  for (const r of registros(libro, pos)) {
    const d = r.datos
    if (r.tipo === BOF && r.pos !== pos) break
    if (r.tipo === EOF) break

    switch (r.tipo) {
      case LABELSST:
        poner(d.readUInt16LE(0), d.readUInt16LE(2), textos[d.readUInt32LE(6)] ?? "")
        break
      case LABEL:
        poner(d.readUInt16LE(0), d.readUInt16LE(2), textoLargo(d, 6))
        break
      case NUMBER:
        poner(d.readUInt16LE(0), d.readUInt16LE(2), numero(d.readDoubleLE(6)))
        break
      case RK:
        poner(d.readUInt16LE(0), d.readUInt16LE(2), numero(desdeRk(d.readUInt32LE(6))))
        break
      case MULRK: {
        const fila = d.readUInt16LE(0)
        const primera = d.readUInt16LE(2)
        const cantidad = (d.length - 6) / 6
        for (let k = 0; k < cantidad; k++) poner(fila, primera + k, numero(desdeRk(d.readUInt32LE(4 + k * 6 + 2))))
        break
      }
      case BOOLERR:
        // Byte 7 en 0 es booleano; en 1 es un error (#N/A, #DIV/0!), que vale vacío.
        poner(d.readUInt16LE(0), d.readUInt16LE(2), d[7] === 0 ? (d[6] ? "TRUE" : "FALSE") : "")
        break
      case FORMULA: {
        const fila = d.readUInt16LE(0)
        const col = d.readUInt16LE(2)
        // Si los dos últimos bytes del resultado no son 0xFFFF, es un número.
        // Si lo son, el byte 6 dice qué es: 0 texto (viene en el STRING
        // siguiente), 1 booleano, 2 error, 3 vacío.
        if (d.readUInt16LE(12) !== 0xffff) poner(fila, col, numero(d.readDoubleLE(6)))
        else if (d[6] === 0) formulaPendiente = [fila, col]
        else if (d[6] === 1) poner(fila, col, d[8] ? "TRUE" : "FALSE")
        break
      }
      case STRING:
        if (formulaPendiente) poner(formulaPendiente[0], formulaPendiente[1], textoLargo(d, 0))
        formulaPendiente = null
        break
    }
  }

  // Huecos a "" y todas las filas del mismo ancho, como `leerXlsx`.
  const ancho = Math.max(0, ...celdas.map((f) => f?.length ?? 0))
  return Array.from(celdas, (f) => Array.from({ length: ancho }, (_, i) => f?.[i] ?? ""))
}

/** `String` ya escribe 15 y no "15.0" para los enteros que Excel guarda como double. */
function numero(n: number): string {
  return String(n)
}

/** RK: un número comprimido en 30 bits, entero o los 30 bits altos de un double. */
function desdeRk(rk: number): number {
  const entero = rk & 0x02
  const centesimos = rk & 0x01
  let n: number
  if (entero) n = rk >> 2
  else {
    const b = Buffer.alloc(8)
    b.writeUInt32LE(rk & 0xfffffffc, 4)
    n = b.readDoubleLE(0)
  }
  return centesimos ? n / 100 : n
}

/* ── Textos ───────────────────────────────────────────────────────────────── */

/** Largo en un byte + banderas: el nombre de una hoja. */
function textoCorto(d: Buffer, off: number): string {
  const largo = d[off]
  const anchos = d[off + 1] & 0x01
  const desde = off + 2
  return anchos
    ? d.subarray(desde, desde + largo * 2).toString("utf16le")
    : d.subarray(desde, desde + largo).toString("latin1")
}

/** Largo en dos bytes + banderas: celdas LABEL y resultados de fórmula. */
function textoLargo(d: Buffer, off: number): string {
  const largo = d.readUInt16LE(off)
  const banderas = d[off + 2]
  let desde = off + 3
  if (banderas & 0x08) desde += 2
  if (banderas & 0x04) desde += 4
  return banderas & 0x01
    ? d.subarray(desde, desde + largo * 2).toString("utf16le")
    : d.subarray(desde, desde + largo).toString("latin1")
}

/**
 * La tabla de textos compartidos.
 *
 * Lo único delicado de todo el formato: un registro no puede pasar de 8224
 * bytes, así que la tabla sigue en registros CONTINUE, y un texto puede quedar
 * partido entre dos. Cuando eso pasa, el CONTINUE arranca con un byte de
 * banderas propio que dice si **lo que sigue** viene en un byte o en dos por
 * carácter —puede cambiar a mitad de un mismo texto—. Por eso se lee con un
 * cursor que sabe en qué parte está, y no concatenando los registros.
 */
function leerSst(partes: Buffer[]): string[] {
  let p = 0
  let off = 0
  const restante = () => partes[p].length - off
  const avanzarSiTermino = () => {
    if (restante() <= 0 && p < partes.length - 1) {
      p++
      off = 0
    }
  }
  const u8 = () => {
    avanzarSiTermino()
    return partes[p][off++]
  }
  const u16 = () => u8() | (u8() << 8)
  const u32 = () => (u16() | (u16() << 16)) >>> 0
  const saltar = (n: number) => {
    while (n > 0) {
      avanzarSiTermino()
      const k = Math.min(n, restante())
      off += k
      n -= k
      if (k === 0) break
    }
  }

  const total = u32()
  const unicos = u32()
  void total
  const textos: string[] = []

  for (let i = 0; i < unicos && !(p === partes.length - 1 && restante() <= 0); i++) {
    const largo = u16()
    const banderas = u8()
    let anchos = banderas & 0x01
    const runs = banderas & 0x08 ? u16() : 0
    const extra = banderas & 0x04 ? u32() : 0

    let texto = ""
    let faltan = largo
    while (faltan > 0) {
      if (restante() <= 0) {
        // Corte a mitad de texto: el CONTINUE trae su propio byte de anchos.
        p++
        off = 0
        anchos = partes[p][off++] & 0x01
      }
      const porCaracter = anchos ? 2 : 1
      const caben = Math.min(faltan, Math.floor(restante() / porCaracter))
      const trozo = partes[p].subarray(off, off + caben * porCaracter)
      texto += anchos ? trozo.toString("utf16le") : trozo.toString("latin1")
      off += caben * porCaracter
      faltan -= caben
    }
    saltar(runs * 4 + extra)
    textos.push(texto)
  }
  return textos
}
