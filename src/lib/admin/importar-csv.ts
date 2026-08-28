import {
  ALICUOTAS,
  CLASES_COMPRA,
  CLASES_VENTA,
  type TipoComprobante,
} from "@/lib/admin/comprobantes"
import type { Extraccion } from "@/lib/admin/extraccion"
import { parsearImporte } from "@/lib/admin/moneda"

/**
 * Importar comprobantes desde una planilla.
 *
 * Es el otro camino de la carga masiva, y la división con la carga inteligente
 * es la que importa: **el modelo lee papel, esto lee grillas**.
 *
 * Un PDF o una foto de una factura no tienen estructura, y ahí leer con el
 * modelo gana. Una planilla ya viene con la estructura puesta —una fila por
 * comprobante, una columna por campo— y pasarla por el modelo es tirar esa
 * estructura a la basura para después pagar por reconstruirla peor. El caso que
 * lo motivó fue exactamente ese: alguien imprimía un Excel de muchas filas a
 * PDF y lo adjuntaba en la carga inteligente, que devuelve **un comprobante por
 * archivo** — o sea, de treinta facturas entraba una, mal.
 *
 * Acá no hay modelo, no hay tokens y no hay nada que se pueda inventar: si una
 * celda no se entiende vuelve `null` y la fila lo dice. Lo que no cambia es el
 * final del recorrido — sale un `Borrador` idéntico al de la carga inteligente,
 * pasa por la misma pantalla de revisión y lo guarda una persona.
 *
 * LA FUENTE QUE CONVIENE
 *
 * "Mis Comprobantes" de AFIP (emitidos y recibidos) exporta CSV con las
 * columnas fijas, y es la fuente canónica: lo que dice ese archivo es lo que
 * AFIP tiene registrado. El mapeo de acá abajo la reconoce sola. Un Excel
 * propio también entra mientras las columnas se llamen de alguna manera
 * razonable, y si alguna no se reconoce el importador dice cuál falta y qué
 * encabezados encontró, en vez de cargar la planilla a medias.
 */

/* ── Límites ──────────────────────────────────────────────────────────────── */

/** Un mes de facturación de una PyME entra holgado. El techo está para que
 *  nadie suba el histórico entero y se coma el timeout del servidor con 4000
 *  filas que después no va a revisar una por una. */
export const FILAS_MAX = 300

export const TAMANO_CSV_MAX_MB = 4

/** Por extensión y no por MIME: Windows manda los `.csv` como
 *  `application/vnd.ms-excel` y a veces con el MIME vacío. La extensión es lo
 *  único estable. */
export function esCsv(nombre: string): boolean {
  return /\.csv$/i.test(nombre.trim())
}

/* ── Parseo del CSV ───────────────────────────────────────────────────────── */

export type Tabla = { cabeceras: string[]; filas: string[][] }

/**
 * Qué separa las columnas.
 *
 * En configuración regional argentina Excel escribe con punto y coma, porque la
 * coma ya es el separador decimal. Pero un CSV bajado de otro sistema puede
 * venir con coma, y uno pegado de Google Sheets con tabulaciones. Se cuenta cuál
 * aparece más en la primera línea —la de los encabezados, que no tiene importes
 * y por lo tanto no tiene comas decimales que confundan.
 */
function separadorDe(primeraLinea: string): string {
  const candidatos = [";", "\t", ","]
  let mejor = ";"
  let max = 0
  for (const c of candidatos) {
    const n = primeraLinea.split(c).length - 1
    if (n > max) {
      max = n
      mejor = c
    }
  }
  return mejor
}

/**
 * CSV a tabla, con comillas y saltos de línea adentro de una celda.
 *
 * Está escrito a mano y no con una librería a propósito: son cuarenta líneas,
 * no tiene dependencias que actualizar, y el formato que hay que soportar es el
 * que escribe Excel, que es justamente el que dice la RFC.
 */
export function parsearCsv(texto: string): Tabla {
  // El BOM que Excel escribe al principio quedaría pegado al primer encabezado
  // y lo volvería irreconocible.
  const limpio = texto.replace(/^﻿/, "")
  const sep = separadorDe(limpio.split(/\r?\n/, 1)[0] ?? "")

  const filas: string[][] = []
  let fila: string[] = []
  let celda = ""
  let enComillas = false

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]

    if (enComillas) {
      if (c === '"') {
        // Dos comillas seguidas adentro de una celda entrecomillada son una
        // comilla literal, no el cierre.
        if (limpio[i + 1] === '"') {
          celda += '"'
          i++
        } else {
          enComillas = false
        }
      } else {
        celda += c
      }
      continue
    }

    if (c === '"' && celda === "") {
      enComillas = true
    } else if (c === sep) {
      fila.push(celda)
      celda = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ""
    } else {
      celda += c
    }
  }

  if (celda !== "" || fila.length > 0) {
    fila.push(celda)
    filas.push(fila)
  }

  // Las filas vacías del final —Excel deja una— no son comprobantes.
  const utiles = filas.filter((f) => f.some((v) => v.trim() !== ""))
  const [cabeceras = [], ...resto] = utiles

  return { cabeceras: cabeceras.map((c) => c.trim()), filas: resto }
}

/* ── Mapeo de columnas ────────────────────────────────────────────────────── */

/**
 * El encabezado, reducido a lo comparable: sin mayúsculas, sin acentos y sin
 * puntuación. Así `"Imp. Neto Gravado"`, `"IMPORTE NETO GRAVADO"` y
 * `"imp neto gravado"` son la misma columna, que es lo que hace que el archivo
 * de AFIP y el Excel que armó alguien a mano entren por la misma puerta.
 */
export function normalizarCabecera(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export type Campo =
  | "fecha"
  | "fechaVencimiento"
  | "clase"
  | "puntoVenta"
  | "numero"
  | "numeroHasta"
  | "numeroCompleto"
  | "cuitEmisor"
  | "razonSocialEmisor"
  | "cuitReceptor"
  | "razonSocialReceptor"
  | "cuit"
  | "razonSocial"
  | "moneda"
  | "tc"
  | "netoGravado"
  | "alicuotaIva"
  | "iva"
  | "noGravado"
  | "exento"
  | "percepcionIva"
  | "percepcionIibbBsas"
  | "percepcionIibbCaba"
  /** La columna genérica de un Excel armado a mano: "Percepción IIBB" a secas,
   *  sin decir de qué fisco. No se reparte sola — ver `filaAExtraccion`. */
  | "percepcionIibbSinJurisdiccion"
  | "otrosImpuestos"
  | "total"
  | "detalle"
  | "condicionPago"
  /* Las columnas que el export de ARCA abre por alícuota. Van como campos
     propios en vez de una sola columna de neto porque son la única fuente
     confiable del porcentaje: el archivo trae los importes pero nunca la
     alícuota, y deducirla dividiendo IVA sobre neto falla justo en las facturas
     que mezclan dos. Ver `alicuotasDeFila`. */
  | "netoGravado0"
  | "netoGravado25"
  | "iva25"
  | "netoGravado5"
  | "iva5"
  | "netoGravado105"
  | "iva105"
  | "netoGravado21"
  | "iva21"
  | "netoGravado27"
  | "iva27"

/**
 * Cómo se puede llamar cada columna.
 *
 * El primer alias de cada lista es el nombre exacto que usa el export de "Mis
 * Comprobantes"; los demás cubren las variantes de un Excel armado a mano. La
 * comparación es exacta contra el encabezado normalizado —nunca por "contiene"—
 * porque `imp neto gravado` e `imp neto no gravado` se diferencian en una
 * palabra, y una coincidencia parcial mandaría el no gravado al campo gravado
 * sin que nadie lo note.
 */
const ALIAS: Record<Campo, string[]> = {
  fecha: ["fecha", "fecha de emision", "fecha emision", "fecha comprobante"],
  fechaVencimiento: ["fecha de vencimiento", "fecha vencimiento", "vencimiento", "vto"],
  clase: ["tipo", "tipo de comprobante", "tipo comprobante", "comprobante", "clase"],
  puntoVenta: ["punto de venta", "punto venta", "pto venta", "pto vta", "pv"],
  numero: [
    "numero desde",
    "numero",
    "nro comprobante",
    "numero de comprobante",
    "numero comprobante",
    "nro",
  ],
  numeroHasta: ["numero hasta"],
  /** El número entero pegado, `00003-00001234`. Lo parte `parsearNumero`. */
  numeroCompleto: ["comprobante nro", "nro completo", "numero completo"],

  cuitEmisor: ["nro doc emisor", "cuit emisor", "documento emisor"],
  razonSocialEmisor: ["denominacion emisor", "razon social emisor", "emisor"],
  cuitReceptor: ["nro doc receptor", "cuit receptor", "documento receptor"],
  razonSocialReceptor: ["denominacion receptor", "razon social receptor", "receptor"],
  /** Las genéricas: un Excel propio tiene una sola contraparte por fila y no la
   *  llama "emisor". Cuál de los dos lados es se decide por el circuito. */
  cuit: ["cuit", "nro doc", "documento", "cuit proveedor", "cuit cliente"],
  razonSocial: [
    "razon social",
    "denominacion",
    "proveedor",
    "cliente",
    "nombre",
    "razon social proveedor",
    "razon social cliente",
  ],

  moneda: ["moneda", "mon"],
  tc: ["tipo cambio", "tipo de cambio", "tc", "cotizacion"],

  netoGravado: [
    "imp neto gravado total",
    "imp neto gravado",
    "neto gravado",
    "neto",
    "importe neto gravado",
    "gravado",
  ],
  alicuotaIva: ["alicuota", "alicuota iva", "alic iva", "iva porcentaje"],
  iva: ["total iva", "iva", "imp iva", "importe iva"],
  noGravado: ["imp neto no gravado", "neto no gravado", "no gravado", "importe no gravado"],
  exento: ["imp op exentas", "op exentas", "exento", "exentas", "importe exento"],
  percepcionIva: ["percepcion iva", "perc iva", "percepciones iva"],

  /* Ingresos Brutos, abierto por jurisdicción porque cada una imputa contra su
     propia cuenta (50 BS AS · 51 CABA). La columna genérica tiene su propio
     campo en vez de caer en una de las dos: dónde termina esa plata lo decide
     `filaAExtraccion`, que además marca la fila para que alguien la mire. */
  percepcionIibbBsas: [
    "percepcion iibb bs as",
    "percepcion iibb bsas",
    "perc iibb bs as",
    "perc iibb bsas",
    "percepcion iibb buenos aires",
    "percepcion iibb provincia",
    "arba",
  ],
  percepcionIibbCaba: [
    "percepcion iibb caba",
    "perc iibb caba",
    "percepcion iibb cap",
    "perc iibb cap",
    "percepcion iibb capital",
    "percepcion iibb ciudad",
    "agip",
  ],
  percepcionIibbSinJurisdiccion: [
    "percepcion iibb",
    "perc iibb",
    "percepciones iibb",
    "percepcion ingresos brutos",
    "iibb",
  ],

  /* El export de "Mis Comprobantes" de ARCA abre neto e IVA en una pareja de
     columnas por alicuota. Los encabezados normalizados pierden la coma y el
     signo de porcentaje: "IVA 10,5%" queda en `iva 10 5`. */
  netoGravado0: ["imp neto gravado iva 0", "neto gravado iva 0"],
  netoGravado25: ["imp neto gravado iva 2 5", "neto gravado iva 2 5"],
  iva25: ["iva 2 5"],
  netoGravado5: ["imp neto gravado iva 5", "neto gravado iva 5"],
  iva5: ["iva 5"],
  netoGravado105: ["imp neto gravado iva 10 5", "neto gravado iva 10 5"],
  iva105: ["iva 10 5"],
  netoGravado21: ["imp neto gravado iva 21", "neto gravado iva 21"],
  iva21: ["iva 21"],
  netoGravado27: ["imp neto gravado iva 27", "neto gravado iva 27"],
  iva27: ["iva 27"],
  otrosImpuestos: [
    "otros tributos",
    "otros impuestos",
    "otros",
    "impuestos internos",
    "tributos",
  ],
  total: ["imp total", "total", "importe total", "total comprobante", "importe", "monto"],

  detalle: ["detalle", "concepto", "descripcion", "observaciones"],
  condicionPago: ["condicion de pago", "condicion pago", "forma de pago"],
}

export type Mapa = Partial<Record<Campo, number>>

export type Reconocimiento = {
  mapa: Mapa
  /** Los encabezados que no se pudieron asignar a ningún campo. No es un error
   *  —el export de AFIP trae el CAE y el tipo de documento, que no usamos— pero
   *  se muestran cuando falta algo, para poder ver qué se le escapó al mapeo. */
  ignoradas: string[]
}

export function mapearColumnas(cabeceras: string[]): Reconocimiento {
  const mapa: Mapa = {}
  const ignoradas: string[] = []

  cabeceras.forEach((cabecera, indice) => {
    const norm = normalizarCabecera(cabecera)
    if (!norm) return

    const campo = (Object.keys(ALIAS) as Campo[]).find((c) => ALIAS[c].includes(norm))

    // La primera columna que matchea gana: si la planilla trae dos que dicen lo
    // mismo, quedarse con la primera es arbitrario pero estable, y la segunda
    // aparece en `ignoradas` a la vista.
    if (campo && mapa[campo] === undefined) mapa[campo] = indice
    else ignoradas.push(cabecera)
  })

  return { mapa, ignoradas }
}

/**
 * Lo mínimo para que una fila sea un comprobante.
 *
 * La fecha y el total son el piso: sin ellos no hay nada que asentar. La
 * identidad de la contraparte se pide acá y no fila por fila porque si falta la
 * columna faltan las 300 — mejor decirlo antes de procesar nada que devolver
 * trescientos borradores que no se pueden guardar.
 */
export function columnasFaltantes(mapa: Mapa, tipo: TipoComprobante): string[] {
  const faltan: string[] = []

  if (mapa.fecha === undefined) faltan.push("Fecha")
  if (mapa.total === undefined && mapa.netoGravado === undefined) {
    faltan.push("Imp. Total")
  }

  const rotulo = tipo === "compra" ? "proveedor" : "cliente"
  const hayIdentidad =
    mapa.cuit !== undefined ||
    mapa.razonSocial !== undefined ||
    mapa.cuitEmisor !== undefined ||
    mapa.razonSocialEmisor !== undefined ||
    mapa.cuitReceptor !== undefined ||
    mapa.razonSocialReceptor !== undefined

  if (!hayIdentidad) faltan.push(`CUIT o razón social del ${rotulo}`)

  return faltan
}

/* ── Celda a dato ─────────────────────────────────────────────────────────── */

/**
 * Fecha argentina a ISO. `14/08/2026` es 14 de agosto, nunca 8 de abril.
 *
 * Lo que no se entiende vuelve `null` y la fila lo avisa. Es a propósito que no
 * haya ningún intento de adivinar —un número suelto como `45883` es una fecha
 * serial de Excel, y convertirla mal da una fecha perfectamente plausible que
 * después nadie va a poder distinguir de una buena.
 */
export function aFecha(raw: string): string | null {
  const s = (raw ?? "").trim()
  if (!s) return null

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return armarFecha(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const ar = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (ar) {
    const anio = Number(ar[3])
    return armarFecha(anio < 100 ? 2000 + anio : anio, Number(ar[2]), Number(ar[1]))
  }

  return null
}

function armarFecha(anio: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || anio < 2000 || anio > 2100) return null
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
}

/** Los códigos numéricos de AFIP, que es como viene la columna "Tipo" del
 *  export: `1 - Factura A`. */
const CODIGO_AFIP: Record<number, string> = {
  1: "FCA",
  6: "FCB",
  11: "FCC",
  2: "NDA",
  7: "NDB",
  12: "NDC",
  3: "NCA",
  8: "NCB",
  13: "NCC",

  // Exportación. La E de acá no es la de la MiPyME, aunque las dos se escriban
  // con una E: 19/20/21 es el régimen de exportación.
  19: "FCE",
  20: "NDE",
  21: "NCE",

  // Factura de Crédito Electrónica MiPyME clase A. Es el «FCEA» del pliego.
  201: "FCEA",
  202: "NDEA",
  203: "NCEA",
}

const CODIGOS = new Set([...CLASES_VENTA, ...CLASES_COMPRA].map((c) => c.codigo))

/**
 * La columna "Tipo" a una clase del sistema.
 *
 * Tres formas, en orden: el código nuestro tal cual (`FCA`), el código de AFIP
 * con el que arranca la celda (`1 - Factura A`), y el texto (`Nota de crédito
 * B`). Lo que no cae en ninguna vuelve `null`, y la fila queda con el aviso —
 * confundir una nota de crédito con una de débito es un error de signo, que es
 * el peor error posible acá.
 */
export function aClase(raw: string): string | null {
  const s = (raw ?? "").trim()
  if (!s) return null

  const directo = s.toUpperCase().replace(/[^A-Z]/g, "")
  if (CODIGOS.has(directo)) return directo

  const codigo = s.match(/^\s*0?(\d{1,3})\b/)
  if (codigo) {
    const clase = CODIGO_AFIP[Number(codigo[1])]
    if (clase) return clase
  }

  const texto = normalizarCabecera(s)

  /* La MiPyME se resuelve antes que nada. Su nombre lleva las dos palabras que
     el reconocedor de familias usa para decidir —"credito" y "debito"— así que
     sin este atajo "factura de credito electronica" se leería como una nota de
     crédito, que es un error de signo. */
  const esMipyme = /\b(mipyme|fce)\b/.test(texto) || texto.includes("electronica")
  if (esMipyme && !texto.includes("exportacion")) {
    if (texto.includes("nota")) {
      if (texto.includes("credito")) return "NCEA"
      if (texto.includes("debito")) return "NDEA"
      return null
    }
    return "FCEA"
  }

  // "Nota" tiene que estar: sin esa palabra, una "factura de crédito
  // electrónica" —que es una factura común— se leería como nota de crédito.
  const familia = texto.includes("nota")
    ? texto.includes("credito")
      ? "NC"
      : texto.includes("debito")
        ? "ND"
        : null
    : texto.includes("factura")
      ? "FC"
      : null
  if (!familia) return null

  const letra = texto.match(/\b([abce])\b/)?.[1]?.toUpperCase()
  if (!letra) return null

  // La E de exportación se escribe `FCE` / `NCE` / `NDE`; la MiPyME ya se
  // resolvió arriba y no llega hasta acá.
  const clase = `${familia}${letra}`
  return CODIGOS.has(clase) ? clase : null
}

/**
 * `PES` y `DOL` son los códigos que usa AFIP, pero el export de "Mis
 * Comprobantes" escribe la columna Moneda como el símbolo pelado: `$` para
 * pesos y `USD` para dólares.
 *
 * El símbolo hay que mirarlo **antes** de normalizar, porque `normalizarCabecera`
 * borra todo lo que no sea alfanumérico y deja `"$"` en cadena vacía — que es
 * indistinguible de una celda en blanco. Con eso, las 43 filas en pesos del
 * archivo de agosto quedaban sin moneda reconocida.
 */
export function aMoneda(raw: string): "ARS" | "USD" | null {
  const crudo = (raw ?? "").trim()
  if (crudo === "$" || crudo === "AR$" || crudo === "$a") return "ARS"
  if (crudo === "U$S" || crudo === "US$" || crudo === "u$s") return "USD"

  const s = normalizarCabecera(crudo)
  if (!s) return null
  if (/\b(pes|ars|peso|pesos)\b/.test(s)) return "ARS"
  if (/\b(dol|usd|u s|dolar|dolares)\b/.test(s)) return "USD"
  return null
}

/**
 * Las parejas neto/IVA que el export de ARCA abre por alícuota, en el orden en
 * que salen en el archivo.
 *
 * El 0 % no tiene columna de IVA propia —sería siempre cero— y el 2,5 % y el 5 %
 * están porque el archivo los trae, aunque el plan de cuentas del estudio no
 * tenga una cuenta de IVA crédito para ellos: es mejor leerlos y avisar que
 * ignorarlos y que el neto no cierre con el total.
 */
const COLUMNAS_POR_ALICUOTA: { alicuota: number; neto: Campo; iva: Campo | null }[] = [
  { alicuota: 0, neto: "netoGravado0", iva: null },
  { alicuota: 0.025, neto: "netoGravado25", iva: "iva25" },
  { alicuota: 0.05, neto: "netoGravado5", iva: "iva5" },
  { alicuota: 0.105, neto: "netoGravado105", iva: "iva105" },
  { alicuota: 0.21, neto: "netoGravado21", iva: "iva21" },
  { alicuota: 0.27, neto: "netoGravado27", iva: "iva27" },
]

export type TramoAlicuota = { alicuota: number; neto: number; iva: number }

/**
 * Qué alícuotas tocó esta fila, según las columnas abiertas del export.
 *
 * Devuelve lista vacía cuando la planilla no trae ese desglose —un Excel propio
 * con una sola columna de neto—, y ahí el resto del código sigue por el camino
 * de siempre: deducir la alícuota dividiendo el IVA por el neto.
 */
export function tramosDeAlicuota(fila: string[], mapa: Mapa): TramoAlicuota[] {
  const valor = (campo: Campo | null): number => {
    if (campo === null) return 0
    const i = mapa[campo]
    if (i === undefined) return 0
    return parsearImporte((fila[i] ?? "").trim()) ?? 0
  }

  return COLUMNAS_POR_ALICUOTA.map((c) => ({
    alicuota: c.alicuota,
    neto: valor(c.neto),
    iva: valor(c.iva),
  })).filter((t) => t.neto !== 0 || t.iva !== 0)
}

/** `21` en vez de `0.21`, para escribirlo en un aviso. */
const porciento = (a: number): string =>
  `${(a * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`

/**
 * La alícuota, deducida del IVA sobre el neto.
 *
 * El export de AFIP trae el importe de IVA pero no el porcentaje, y el sistema
 * lo necesita para armar el asiento. Solo se devuelve si el cociente cae
 * redondo en una de las alícuotas vigentes: una factura con dos alícuotas
 * mezcladas da un número intermedio que no es ninguna de las dos, y ahí es
 * mejor dejarlo en blanco y que lo elija una persona que anotar la más parecida.
 */
export function alicuotaDe(iva: number | null, neto: number | null): number | null {
  if (iva === null || neto === null || neto === 0) return null

  const cociente = iva / neto
  return ALICUOTAS.find((a) => a !== 0 && Math.abs(cociente - a) < 0.005) ?? null
}

/* ── Fila a extracción ────────────────────────────────────────────────────── */

export type FilaLeida = {
  /** Qué número de fila es en la planilla, contando el encabezado como la 1.
   *  Es la referencia para volver al archivo y mirar. */
  linea: number
  extraccion: Extraccion
}

/**
 * Una fila de la planilla con la forma que ya entiende el resto del sistema.
 *
 * Devuelve una `Extraccion` —la misma que produce la lectura de un PDF— para
 * que de acá en adelante los dos caminos sean indistinguibles: el mismo cruce
 * contra el maestro, los mismos avisos, la misma pantalla de revisión y el
 * mismo guardado. `confianza` va en "alta" porque acá no hay lectura que pueda
 * salir mal: o la celda se entiende o vuelve `null`. Lo que no se entendió se
 * lista en `camposDudosos`, que es lo que la pantalla pinta en ámbar.
 */
export function filaAExtraccion(
  fila: string[],
  mapa: Mapa,
  tipo: TipoComprobante
): Extraccion {
  const crudo = (campo: Campo): string => {
    const i = mapa[campo]
    return i === undefined ? "" : (fila[i] ?? "").trim()
  }
  const texto = (campo: Campo): string | null => crudo(campo) || null
  const monto = (campo: Campo): number | null => parsearImporte(crudo(campo))

  const dudosos: string[] = []
  const notas: string[] = []

  /* Quién es la contraparte. Un export de "Mis Comprobantes" recibidos trae
     solo emisor y uno de emitidos solo receptor, así que la columna genérica de
     un Excel propio se asigna al lado que corresponde al circuito: en una
     compra el proveedor es el emisor, en una venta el cliente es el receptor. */
  const esCompra = tipo === "compra"
  const cuitGenerico = texto("cuit")
  const razonGenerica = texto("razonSocial")

  const emisorCuit = texto("cuitEmisor") ?? (esCompra ? cuitGenerico : null)
  const emisorRazonSocial = texto("razonSocialEmisor") ?? (esCompra ? razonGenerica : null)
  const receptorCuit = texto("cuitReceptor") ?? (esCompra ? null : cuitGenerico)
  const receptorRazonSocial =
    texto("razonSocialReceptor") ?? (esCompra ? null : razonGenerica)

  /* El número. Puede venir partido en dos columnas —como en AFIP— o entero en
     una sola. */
  let puntoVenta = enteroDe(crudo("puntoVenta"))
  let numero = enteroDe(crudo("numero"))

  const completo = crudo("numeroCompleto")
  if (completo && numero === null) {
    const partes = completo.split(/[-–/]/)
    if (partes.length === 2) {
      puntoVenta = enteroDe(partes[0])
      numero = enteroDe(partes[1])
    } else {
      numero = enteroDe(completo)
    }
  }

  /* Un rango de números es un comprobante en lote: son varios comprobantes en
     una fila y el sistema guarda uno. Se carga el primero y se avisa, que es
     mejor que descartar la fila en silencio. */
  const hasta = enteroDe(crudo("numeroHasta"))
  if (hasta !== null && numero !== null && hasta !== numero) {
    notas.push(
      `La fila abarca del ${numero} al ${hasta}: se carga solo el ${numero}, el resto va a mano.`
    )
  }

  const fecha = aFecha(crudo("fecha"))
  if (mapa.fecha !== undefined && fecha === null && crudo("fecha")) {
    dudosos.push("fecha")
    notas.push(`No se entendió la fecha «${crudo("fecha")}».`)
  }

  const clase = aClase(crudo("clase"))
  if (mapa.clase !== undefined && clase === null && crudo("clase")) {
    dudosos.push("clase")
    notas.push(`No se reconoció el tipo de comprobante «${crudo("clase")}».`)
  }

  /* El desglose por alícuota del export de ARCA, cuando la planilla lo trae.
     Es la mejor fuente que hay para el porcentaje: el archivo no tiene columna
     de alícuota, y deducirla dividiendo IVA sobre neto se rompe justo en las
     facturas que mezclan dos. */
  const tramos = tramosDeAlicuota(fila, mapa)

  /* El neto y el IVA totales. La columna de total manda —"Imp. Neto Gravado
     Total" es la que ARCA declara— y el desglose es el respaldo para la planilla
     que abre por alícuota sin totalizar. */
  const sumar = (ns: number[]) => Math.round(ns.reduce((a, n) => a + n, 0) * 100) / 100
  const netoGravado =
    monto("netoGravado") ?? (tramos.length > 0 ? sumar(tramos.map((t) => t.neto)) : null)
  const iva = monto("iva") ?? (tramos.length > 0 ? sumar(tramos.map((t) => t.iva)) : null)

  /* La alícuota, en tres escalones: la columna explícita si existe, después el
     desglose por alícuota, y recién al final la deducción por división. El `> 1`
     es para la planilla que la escribe como 21 en vez de 0,21 — las dos formas
     se ven, y guardar 21 como fracción daría un IVA de dos mil por ciento. */
  let alicuotaIva = monto("alicuotaIva")
  if (alicuotaIva !== null && alicuotaIva > 1) alicuotaIva = alicuotaIva / 100

  if (alicuotaIva === null && tramos.length > 0) {
    // Con varias, la de mayor neto. El comprobante guarda una sola alícuota, así
    // que la fila queda marcada: el IVA total sigue siendo correcto, pero el
    // asiento va a imputar todo el crédito a una cuenta.
    const dominante = tramos.reduce((a, t) => (t.neto > a.neto ? t : a))
    const conocidas = ALICUOTAS as readonly number[]

    if (conocidas.includes(dominante.alicuota)) {
      alicuotaIva = dominante.alicuota
    } else {
      dudosos.push("alicuotaIva")
      notas.push(
        `La fila viene al ${porciento(dominante.alicuota)}, que no está en el plan de cuentas. Elegí la alícuota a mano.`
      )
    }

    if (tramos.length > 1) {
      dudosos.push("alicuotaIva")
      notas.push(
        `La factura mezcla ${tramos.length} alícuotas (${tramos.map((t) => porciento(t.alicuota)).join(", ")}): se carga la de mayor neto y el IVA total.`
      )
    }
  }

  if (alicuotaIva === null) alicuotaIva = alicuotaDe(iva, netoGravado)
  if (alicuotaIva === null && iva !== null && iva !== 0 && !dudosos.includes("alicuotaIva")) {
    dudosos.push("alicuotaIva")
  }

  const moneda = aMoneda(crudo("moneda"))

  const noGravado = monto("noGravado")
  const exento = monto("exento")
  const percepcionIva = monto("percepcionIva")

  /* Ingresos Brutos. Cuando la planilla trae una columna genérica —"Percepción
     IIBB" sin decir de qué fisco— esa plata tiene que ir a algún lado o el total
     de la fila deja de cerrar, y a la vez no se puede inventar la jurisdicción:
     el crédito fiscal terminaría en la cuenta equivocada y se descubre cuando el
     fisco lo rechaza. Va a Buenos Aires, que es la jurisdicción de Accedra, y la
     fila queda marcada en ámbar diciendo exactamente eso. */
  const iibbSinJurisdiccion = monto("percepcionIibbSinJurisdiccion")
  const percepcionIibbBsas =
    iibbSinJurisdiccion !== null && iibbSinJurisdiccion !== 0
      ? Math.round(((monto("percepcionIibbBsas") ?? 0) + iibbSinJurisdiccion) * 100) / 100
      : monto("percepcionIibbBsas")
  const percepcionIibbCaba = monto("percepcionIibbCaba")

  if (iibbSinJurisdiccion !== null && iibbSinJurisdiccion !== 0) {
    dudosos.push("percepcionIibbBsas", "percepcionIibbCaba")
    notas.push(
      "La columna de percepción de IIBB no dice la jurisdicción: se cargó como Buenos Aires. Si es de CABA, pasala al otro campo antes de guardar."
    )
  }

  const otrosImpuestos = monto("otrosImpuestos")
  const total = monto("total")

  /* El comprobante que no discrimina IVA.
     Una factura C, o una B recibida, sale del export de AFIP con todas las
     partes en cero y el importe entero en el total: para quien la recibe no hay
     neto gravado ni crédito fiscal, hay un gasto y nada más. Dejarla así hace
     saltar el chequeo de que los importes cierran en cada una de ellas, y un
     aviso que aparece siempre es un aviso que se deja de leer.
     El total va al neto con alícuota 0. Es el único acomodo que no inventa nada:
     el comprobante cierra, y el IVA computado sigue siendo cero, que es lo
     correcto. Queda dicho en la observación y editable en la revisión. */
  const partes = [
    netoGravado,
    iva,
    noGravado,
    exento,
    percepcionIva,
    percepcionIibbBsas,
    percepcionIibbCaba,
    otrosImpuestos,
  ]
  const sinDiscriminar = partes.every((p) => p === null || p === 0) && !!total

  if (sinDiscriminar) {
    notas.push("El comprobante no discrimina IVA: el total va como neto al 0 %.")
  }

  // Una columna que existe y no se pudo leer es un campo dudoso; una que no
  // existe en la planilla no lo es, o toda fila arrancaría en ámbar.
  if (mapa.total !== undefined && total === null) dudosos.push("total")
  if (numero === null) dudosos.push("numero")

  return {
    clase,
    puntoVenta,
    numero,
    fecha,
    fechaVencimiento: aFecha(crudo("fechaVencimiento")),
    emisorCuit,
    emisorRazonSocial,
    receptorCuit,
    receptorRazonSocial,
    emisorDomicilio: null,
    receptorDomicilio: null,
    emisorCondicionIva: null,
    receptorCondicionIva: null,
    // Sin columna de moneda se asume pesos: una planilla de AFIP sin moneda es
    // en pesos, y un comprobante en dólares tiene tipo de cambio, que si está
    // se ve en la pantalla de revisión.
    moneda: moneda ?? (mapa.moneda === undefined ? "ARS" : null),
    tc: monto("tc"),
    netoGravado: sinDiscriminar ? total : netoGravado,
    alicuotaIva: sinDiscriminar ? 0 : alicuotaIva,
    iva,
    noGravado,
    exento,
    percepcionIva,
    percepcionIibbBsas,
    percepcionIibbCaba,
    otrosImpuestos,
    total,
    detalle: texto("detalle"),
    condicionPago: texto("condicionPago"),
    confianza: "alta",
    camposDudosos: dudosos,
    observacionLectura: notas.length > 0 ? notas.join(" ") : null,
  }
}

function enteroDe(raw: string): number | null {
  const digitos = (raw ?? "").replace(/\D/g, "")
  if (!digitos) return null
  const n = Number(digitos)
  return Number.isSafeInteger(n) ? n : null
}
