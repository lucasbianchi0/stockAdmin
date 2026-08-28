import { CODIGOS_CLASE } from "@/lib/admin/comprobantes"
import type { FormaJuridica, Origen } from "@/lib/admin/entidades"

/**
 * Carga inteligente de comprobantes: extracción de una factura de AFIP.
 *
 * El principio que gobierna todo el módulo: **nada se guarda sin que una persona
 * lo confirme**. Este archivo produce un borrador, no un comprobante. La
 * extracción es buena pero no infalible, y una factura mal cargada en silencio
 * es peor que una que hubo que tipear: descuadra el IVA y aparece dos meses
 * después en la declaración jurada.
 *
 * De ahí las tres cosas que el modelo tiene que devolver además de los datos:
 * `confianza`, `camposDudosos` y nulos honestos. Un campo que no se leyó vuelve
 * `null` — nunca inventado, nunca en cero, porque un cero se ve igual que un
 * importe real y nadie lo revisa. (En los campos de texto ese "no se leyó" viaja
 * como `""` y `normalizarExtraccion` lo pasa a `null` apenas llega; el porqué
 * está en el comentario del esquema, acá abajo.)
 */

/* ── Schema de salida ─────────────────────────────────────────────────────── */

/**
 * Cómo viaja "este dato no lo pude leer".
 *
 * Los importes vuelven `null`: un número no tiene valor vacío que no se
 * confunda con un importe real. Todo lo demás —texto y enums— vuelve `""`, y
 * `normalizarExtraccion` lo convierte en `null` apenas llega la respuesta, así
 * que de la frontera para adentro el sistema sigue viendo nulos honestos.
 *
 * El rodeo es obligado. La API compila el esquema a una gramática y pone dos
 * techos sobre esa compilación: 16 campos con unión (`anyOf`, que es como se
 * escribe "o null") y 24 opcionales. Los 27 campos anulables que había acá
 * daban 400 antes de mirar el documento —la carga inteligente de comprobantes
 * estaba caída entera, con cualquier archivo, no solo con los difíciles—. Con
 * los 12 importes anulables y el resto con `""` quedan 12 uniones y ningún
 * opcional, o sea la mitad del techo. Antes de agregar un campo anulable nuevo,
 * contá: si es un número suma unión, si es texto no suma nada.
 */
const numero = { anyOf: [{ type: "number" }, { type: "null" }] } as const
const entero = { anyOf: [{ type: "integer" }, { type: "null" }] } as const
const texto = { type: "string" } as const

/** Los de los dos circuitos, no solo los de venta: una factura C de un
 *  monotributista existe únicamente del lado de compras, y con el enum limitado
 *  a las clases de venta el modelo no tenía forma de devolverla. */
const CODIGOS = [...CODIGOS_CLASE, ""]

/** Las mismas cuatro que acepta `forma_juridica` en clientes y proveedores. El
 *  enum coincide a propósito: lo leído entra en la ficha sin traducción. */
const CONDICION_IVA = {
  type: "string",
  enum: ["responsable_inscripto", "monotributo", "consumidor_final", "exento", ""],
} as const

/**
 * El esquema que la API garantiza. No es una sugerencia: con
 * `output_config.format` la respuesta valida contra esto o no vuelve, así que no
 * hay que parsear texto ni sacar el JSON de adentro de un bloque de markdown.
 */
export const SCHEMA_EXTRACCION = {
  type: "object",
  additionalProperties: false,
  properties: {
    clase: { type: "string", enum: CODIGOS },
    puntoVenta: entero,
    numero: entero,
    fecha: texto,
    fechaVencimiento: texto,

    // Los dos CUIT, sin decidir cuál es el cliente: eso se resuelve del lado del
    // servidor cruzando contra el maestro. El modelo no sabe cuál de las dos
    // empresas somos nosotros.
    emisorCuit: texto,
    emisorRazonSocial: texto,
    receptorCuit: texto,
    receptorRazonSocial: texto,

    // El resto de la cabecera. No hace falta para asentar la factura, pero es
    // exactamente lo que lleva la ficha del proveedor que se da de alta con
    // ella: sin esto la ficha nueva nace con la razón social y nada más.
    emisorDomicilio: texto,
    receptorDomicilio: texto,
    emisorCondicionIva: CONDICION_IVA,
    receptorCondicionIva: CONDICION_IVA,

    moneda: { type: "string", enum: ["ARS", "USD", ""] },
    tc: numero,

    netoGravado: numero,
    alicuotaIva: numero,
    iva: numero,
    noGravado: numero,
    exento: numero,
    percepcionIva: numero,
    percepcionIibbBsas: numero,
    percepcionIibbCaba: numero,
    otrosImpuestos: numero,
    total: numero,

    detalle: texto,
    condicionPago: texto,

    confianza: { type: "string", enum: ["alta", "media", "baja"] },
    /** Los nombres de los campos que el modelo leyó con dudas. La UI los marca
     *  en ámbar para que el ojo vaya primero ahí. */
    camposDudosos: { type: "array", items: { type: "string" } },
    /** Qué documento cree que es, en una frase. Sirve cuando alguien adjunta
     *  algo que no es una factura. */
    observacionLectura: texto,
  },
  required: [
    "clase",
    "puntoVenta",
    "numero",
    "fecha",
    "fechaVencimiento",
    "emisorCuit",
    "emisorRazonSocial",
    "receptorCuit",
    "receptorRazonSocial",
    "emisorDomicilio",
    "receptorDomicilio",
    "emisorCondicionIva",
    "receptorCondicionIva",
    "moneda",
    "tc",
    "netoGravado",
    "alicuotaIva",
    "iva",
    "noGravado",
    "exento",
    "percepcionIva",
    "percepcionIibbBsas",
    "percepcionIibbCaba",
    "otrosImpuestos",
    "total",
    "detalle",
    "condicionPago",
    "confianza",
    "camposDudosos",
    "observacionLectura",
  ],
} as const

export type Extraccion = {
  clase: string | null
  puntoVenta: number | null
  numero: number | null
  fecha: string | null
  fechaVencimiento: string | null
  emisorCuit: string | null
  emisorRazonSocial: string | null
  receptorCuit: string | null
  receptorRazonSocial: string | null
  emisorDomicilio: string | null
  receptorDomicilio: string | null
  emisorCondicionIva: FormaJuridica | null
  receptorCondicionIva: FormaJuridica | null
  moneda: "ARS" | "USD" | null
  tc: number | null
  netoGravado: number | null
  alicuotaIva: number | null
  iva: number | null
  noGravado: number | null
  exento: number | null
  percepcionIva: number | null
  /** Abierta por jurisdicción, igual que en el formulario: cada una imputa
   *  contra su propia cuenta del plan (50 BS AS · 51 CABA). */
  percepcionIibbBsas: number | null
  percepcionIibbCaba: number | null
  otrosImpuestos: number | null
  total: number | null
  detalle: string | null
  condicionPago: string | null
  confianza: "alta" | "media" | "baja"
  camposDudosos: string[]
  observacionLectura: string | null
}

/**
 * Lo que devuelve el modelo, antes de traducir los `""`.
 *
 * Se deriva de `Extraccion` a propósito: un campo nuevo aparece acá solo, sin
 * que haya que acordarse de agregarlo en dos listas que después se desfasan.
 * Los anulables que son números quedan igual —esos sí vuelven `null`— y el
 * resto de los anulables pasa a `string`, que es como viajan.
 */
export type ExtraccionCruda = {
  [K in keyof Extraccion]: null extends Extraccion[K]
    ? NonNullable<Extraccion[K]> extends number
      ? Extraccion[K]
      : string
    : Extraccion[K]
}

/** `""` es "no lo pude leer". El trim además saca los espacios de un campo que
 *  el modelo devolvió con un blanco adentro y nada más. */
const sinVacio = (v: string): string | null => v.trim() || null

/**
 * Traduce la respuesta cruda a la forma que usa el resto del sistema.
 *
 * Es la única frontera donde existe el `""`: de acá para adentro un campo que no
 * se leyó es `null` y nada más, que es lo que después decide si se muestra en
 * ámbar, si bloquea el guardado o si sale un aviso.
 */
export function normalizarExtraccion(c: ExtraccionCruda): Extraccion {
  return {
    ...c,
    clase: sinVacio(c.clase),
    fecha: sinVacio(c.fecha),
    fechaVencimiento: sinVacio(c.fechaVencimiento),
    emisorCuit: sinVacio(c.emisorCuit),
    emisorRazonSocial: sinVacio(c.emisorRazonSocial),
    receptorCuit: sinVacio(c.receptorCuit),
    receptorRazonSocial: sinVacio(c.receptorRazonSocial),
    emisorDomicilio: sinVacio(c.emisorDomicilio),
    receptorDomicilio: sinVacio(c.receptorDomicilio),
    emisorCondicionIva: sinVacio(c.emisorCondicionIva) as FormaJuridica | null,
    receptorCondicionIva: sinVacio(c.receptorCondicionIva) as FormaJuridica | null,
    moneda: sinVacio(c.moneda) as "ARS" | "USD" | null,
    detalle: sinVacio(c.detalle),
    condicionPago: sinVacio(c.condicionPago),
    observacionLectura: sinVacio(c.observacionLectura),
  }
}

/** La ficha del maestro a la que se va a colgar el comprobante, ya resuelta. */
export type EntidadDelBorrador = {
  id: string
  razonSocial: string
  cuit: string | null
  /** Contra qué cuenta se imputan sus facturas por defecto. */
  cuentaContableId: string | null
  /** Los días de plazo pactados, que proponen el vencimiento. */
  condicionPagoDias: number | null
  activo: boolean
  /** Cómo se encontró. `cuit` es certeza; `razon_social` es un match por
   *  nombre y la pantalla lo dice, porque ahí sí puede haberse equivocado. */
  por: "cuit" | "razon_social"
}

/**
 * La ficha que se va a dar de alta cuando el maestro no tiene ninguna.
 *
 * Es una propuesta, no un hecho: viaja al navegador, se muestra editable y el
 * alta ocurre recién cuando se guarda el comprobante. Lo que la vuelve segura es
 * que se resuelve por CUIT del lado del servidor en el mismo pedido —dos
 * archivos del mismo proveedor nuevo terminan en una sola ficha, no en dos.
 */
export type AltaSugerida = {
  razonSocial: string
  cuit: string | null
  origen: Origen
  formaJuridica: FormaJuridica | null
  direccion: string | null
}

/**
 * Un archivo procesado: la extracción cruda más todo lo que el modelo no puede
 * saber (si el proveedor existe, contra qué cuenta se imputa, si la factura ya
 * está cargada, si los importes cierran). Es lo que consume la pantalla de
 * preview.
 */
export type Borrador = {
  archivo: string
  error?: string
  extraccion?: Extraccion
  /** La ficha del maestro que matchea, si la hay. */
  entidad?: EntidadDelBorrador | null
  /** Con qué datos darla de alta cuando no matcheó ninguna. */
  alta?: AltaSugerida | null
  /** El CUIT de la contraparte, aunque no haya ficha ni alta posible. */
  cuitEntidad?: string | null
  /** La imputación propuesta: la de la ficha, y si no la del tipo. Es lo que
   *  hace que la factura llegue al mayor sin un paso extra. */
  cuentaContableId?: string | null
  /** El vencimiento propuesto cuando el papel no lo trae: fecha + los días de
   *  plazo de la ficha. */
  fechaVencimiento?: string | null
  /** Lo que la persona tiene que mirar antes de guardar. */
  avisos: string[]
}

/* ── El prompt ────────────────────────────────────────────────────────────── */

/**
 * Los códigos numéricos de AFIP. Una factura impresa dice "COD. 01" arriba a la
 * derecha y la letra grande en el medio; sin esta tabla el modelo tiene que
 * adivinar la correspondencia y a veces confunde una nota de débito con una de
 * crédito — que es un error de signo, o sea el peor error posible acá.
 */
const CODIGOS_AFIP = `
| Código AFIP | Comprobante              | clase |
|-------------|--------------------------|-------|
| 01          | Factura A                | FCA   |
| 06          | Factura B                | FCB   |
| 11          | Factura C (monotributo)  | FCC   |
| 19          | Factura E (exportación)  | FCE   |
| 201         | Factura de crédito electrónica MiPyME A | FCEA |
| 03          | Nota de crédito A        | NCA   |
| 08          | Nota de crédito B        | NCB   |
| 13          | Nota de crédito C        | NCC   |
| 21          | Nota de crédito E        | NCE   |
| 203         | Nota de crédito electrónica MiPyME A | NCEA |
| 02          | Nota de débito A         | NDA   |
| 07          | Nota de débito B         | NDB   |
| 12          | Nota de débito C         | NDC   |
| 20          | Nota de débito E         | NDE   |
| 202         | Nota de débito electrónica MiPyME A | NDEA |
`.trim()

export const PROMPT_EXTRACCION = `Sos el asistente de administración de Accedra SA, una empresa argentina. Te paso un comprobante emitido en AFIP y tenés que extraer sus datos para cargarlo en el sistema.

${CODIGOS_AFIP}

REGLAS, en orden de importancia:

1. **No inventes nada.** Si un dato no está en el documento o no se lee: en los importes y los números devolvé null, y en todo lo que es texto o una opción de una lista devolvé "" (la cadena vacía). Las dos cosas significan lo mismo —"esto no lo pude leer"— y el sistema las trata igual. Nunca pongas 0 en un importe que no leíste: un cero se ve igual que un importe real y nadie lo revisa. Nunca elijas una opción de la lista "porque es la más probable". Nunca deduzcas un número "porque debería ser".

2. **Los importes van como número, sin símbolos ni separadores de miles.** En Argentina el punto separa miles y la coma los decimales: "1.234.567,89" es 1234567.89. Si el documento está en dólares, los importes van en dólares (no los conviertas).

3. **La alícuota de IVA va como fracción**: 21% → 0.21, 10,5% → 0.105, 27% → 0.27. Si hay varias alícuotas en el mismo comprobante, poné la de mayor importe y agregá "alicuotaIva" a camposDudosos.

4. **Las fechas en formato YYYY-MM-DD.** El formato argentino es día/mes/año: "01/08/2026" es 2026-08-01, no 2026-01-08. Si el año viene con dos dígitos, asumí 20XX.

5. **Las dos partes por separado.** "emisor" es quien emitió la factura, "receptor" es a quién se la emitió. No decidas cuál es el cliente — eso lo resuelve el sistema. Los CUIT van con 11 dígitos y sin guiones. De cada uno traé también la razón social tal cual está impresa, el domicilio en una línea, y la condición frente al IVA usando exactamente uno de estos valores: "responsable_inscripto", "monotributo" (incluye "Responsable Monotributo"), "consumidor_final", "exento". Si la condición no figura, "" — salvo que la clase la implique: una factura A solo se emite entre responsables inscriptos, y una C la emite un monotributista o un exento.

6. **Moneda**: "ARS" si está en pesos, "USD" si está en dólares, "" si no se puede saber. Si el documento muestra un tipo de cambio, poné el valor en "tc" (pesos por dólar).

7. **Las percepciones de Ingresos Brutos van abiertas por jurisdicción.** "percepcionIibbBsas" es la de la Provincia de Buenos Aires (ARBA) y "percepcionIibbCaba" la de la Ciudad de Buenos Aires (AGIP). Fijate en el renglón: suele decir "PERC. IIBB BS AS", "ARBA", "Percepción IB Provincia", o bien "PERC. IIBB CABA", "AGIP", "Percepción IB Capital". Si la factura trae las dos, poné cada una en su campo. Si trae una sola y **no dice de qué jurisdicción es**, dejá las dos en null y agregá "percepcionIibbBsas" y "percepcionIibbCaba" a camposDudosos con la aclaración en observacionLectura: adivinar la provincia manda el crédito fiscal a la cuenta equivocada, y eso se descubre recién cuando el fisco lo rechaza. Si es de otra provincia (Santa Fe, Córdoba, Mendoza), no la pongas en ninguno de los dos y decilo en observacionLectura.

8. **detalle**: una línea con el concepto principal de la factura, como para reconocerla en un listado. No copies el detalle entero si son muchos ítems: resumilo.

9. **confianza**: "alta" si el documento se lee perfecto y todos los campos clave (clase, número, fecha, total) están claros; "media" si tuviste que interpretar algo; "baja" si la imagen está borrosa, cortada, o no parece un comprobante.

10. **camposDudosos**: la lista de nombres de campos que leíste con dudas, usando exactamente los nombres del esquema ("total", "numero", "fecha"...). Es lo que hace que la persona mire primero donde hay que mirar. Si no dudaste de nada, devolvé una lista vacía.

11. **observacionLectura**: si el documento no es una factura, está cortado, o hay algo que quien lo revise debería saber, escribilo acá en una frase. Si está todo bien, "".

Devolvé únicamente el objeto con los datos extraídos.`

/* ── Normalización ────────────────────────────────────────────────────────── */

/** Tipos de archivo que la API puede leer. El resto se rechaza antes de gastar
 *  una llamada al modelo. */
export const TIPOS_ACEPTADOS = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const

export const TAMANO_MAX_MB = 8
export const ARCHIVOS_MAX = 8

export function tipoAceptado(mime: string): boolean {
  return (TIPOS_ACEPTADOS as readonly string[]).includes(mime)
}
