import { CLASES_VENTA } from "@/lib/admin/comprobantes"

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
 * importe real y nadie lo revisa.
 */

/* ── Schema de salida ─────────────────────────────────────────────────────── */

/** Un tipo que además admite null. Los structured outputs no aceptan
 *  `"type": ["number","null"]`, pero sí `anyOf`. */
const opcional = (tipo: string) => ({ anyOf: [{ type: tipo }, { type: "null" }] })

const CODIGOS = CLASES_VENTA.map((c) => c.codigo)

/**
 * El esquema que la API garantiza. No es una sugerencia: con
 * `output_config.format` la respuesta valida contra esto o no vuelve, así que no
 * hay que parsear texto ni sacar el JSON de adentro de un bloque de markdown.
 */
export const SCHEMA_EXTRACCION = {
  type: "object",
  additionalProperties: false,
  properties: {
    clase: { anyOf: [{ type: "string", enum: CODIGOS }, { type: "null" }] },
    puntoVenta: opcional("integer"),
    numero: opcional("integer"),
    fecha: opcional("string"),
    fechaVencimiento: opcional("string"),

    // Los dos CUIT, sin decidir cuál es el cliente: eso se resuelve del lado del
    // servidor cruzando contra el maestro. El modelo no sabe cuál de las dos
    // empresas somos nosotros.
    emisorCuit: opcional("string"),
    emisorRazonSocial: opcional("string"),
    receptorCuit: opcional("string"),
    receptorRazonSocial: opcional("string"),

    moneda: { anyOf: [{ type: "string", enum: ["ARS", "USD"] }, { type: "null" }] },
    tc: opcional("number"),

    netoGravado: opcional("number"),
    alicuotaIva: opcional("number"),
    iva: opcional("number"),
    noGravado: opcional("number"),
    exento: opcional("number"),
    percepcionIva: opcional("number"),
    percepcionIibb: opcional("number"),
    otrosImpuestos: opcional("number"),
    total: opcional("number"),

    detalle: opcional("string"),
    condicionPago: opcional("string"),

    confianza: { type: "string", enum: ["alta", "media", "baja"] },
    /** Los nombres de los campos que el modelo leyó con dudas. La UI los marca
     *  en ámbar para que el ojo vaya primero ahí. */
    camposDudosos: { type: "array", items: { type: "string" } },
    /** Qué documento cree que es, en una frase. Sirve cuando alguien adjunta
     *  algo que no es una factura. */
    observacionLectura: opcional("string"),
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
    "moneda",
    "tc",
    "netoGravado",
    "alicuotaIva",
    "iva",
    "noGravado",
    "exento",
    "percepcionIva",
    "percepcionIibb",
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
  moneda: "ARS" | "USD" | null
  tc: number | null
  netoGravado: number | null
  alicuotaIva: number | null
  iva: number | null
  noGravado: number | null
  exento: number | null
  percepcionIva: number | null
  percepcionIibb: number | null
  otrosImpuestos: number | null
  total: number | null
  detalle: string | null
  condicionPago: string | null
  confianza: "alta" | "media" | "baja"
  camposDudosos: string[]
  observacionLectura: string | null
}

/**
 * Un archivo procesado: la extracción cruda más todo lo que el modelo no puede
 * saber (si el cliente existe, si la factura ya está cargada, si los importes
 * cierran). Es lo que consume la pantalla de preview.
 */
export type Borrador = {
  archivo: string
  error?: string
  extraccion?: Extraccion
  /** El cliente del maestro que matchea por CUIT, si lo hay. */
  cliente?: { id: string; razonSocial: string; cuit: string | null } | null
  /** El CUIT que se buscó, para poder ofrecer «crear cliente» con él ya puesto. */
  cuitCliente?: string | null
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
| 19          | Factura E (exportación)  | FCEA  |
| 03          | Nota de crédito A        | NCA   |
| 08          | Nota de crédito B        | NCB   |
| 21          | Nota de crédito E        | NCEA  |
| 02          | Nota de débito A         | NDA   |
| 07          | Nota de débito B         | NDB   |
| 20          | Nota de débito E         | NDEA  |
`.trim()

export const PROMPT_EXTRACCION = `Sos el asistente de administración de Accedra SA, una empresa argentina. Te paso un comprobante emitido en AFIP y tenés que extraer sus datos para cargarlo en el sistema.

${CODIGOS_AFIP}

REGLAS, en orden de importancia:

1. **No inventes nada.** Si un dato no está en el documento o no se lee, devolvé null. Nunca pongas 0 en un importe que no leíste: un cero se ve igual que un importe real y nadie lo revisa. Nunca deduzcas un número "porque debería ser".

2. **Los importes van como número, sin símbolos ni separadores de miles.** En Argentina el punto separa miles y la coma los decimales: "1.234.567,89" es 1234567.89. Si el documento está en dólares, los importes van en dólares (no los conviertas).

3. **La alícuota de IVA va como fracción**: 21% → 0.21, 10,5% → 0.105, 27% → 0.27. Si hay varias alícuotas en el mismo comprobante, poné la de mayor importe y agregá "alicuotaIva" a camposDudosos.

4. **Las fechas en formato YYYY-MM-DD.** El formato argentino es día/mes/año: "01/08/2026" es 2026-08-01, no 2026-01-08. Si el año viene con dos dígitos, asumí 20XX.

5. **Los dos CUIT por separado.** "emisor" es quien emitió la factura, "receptor" es a quién se la emitió. No decidas cuál es el cliente — eso lo resuelve el sistema. Los CUIT van con 11 dígitos y sin guiones.

6. **Moneda**: "ARS" si está en pesos, "USD" si está en dólares. Si el documento muestra un tipo de cambio, poné el valor en "tc" (pesos por dólar).

7. **detalle**: una línea con el concepto principal de la factura, como para reconocerla en un listado. No copies el detalle entero si son muchos ítems: resumilo.

8. **confianza**: "alta" si el documento se lee perfecto y todos los campos clave (clase, número, fecha, total) están claros; "media" si tuviste que interpretar algo; "baja" si la imagen está borrosa, cortada, o no parece un comprobante.

9. **camposDudosos**: la lista de nombres de campos que leíste con dudas, usando exactamente los nombres del esquema ("total", "numero", "fecha"...). Es lo que hace que la persona mire primero donde hay que mirar. Si no dudaste de nada, devolvé una lista vacía.

10. **observacionLectura**: si el documento no es una factura, está cortado, o hay algo que quien lo revise debería saber, escribilo acá en una frase. Si está todo bien, null.

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
