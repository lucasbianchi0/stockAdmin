import { CATEGORIAS_GASTO } from "@/lib/admin/movimientos"

/**
 * Carga inteligente de un gasto: leer un ticket, una boleta de servicio o el
 * comprobante de una transferencia y proponer el movimiento.
 *
 * Lo que hace útil a este lector no es ahorrar tipeo —un gasto son cuatro
 * campos— sino un aviso que ningún formulario da hoy: **si el papel es una
 * factura A o C, el gasto es la puerta equivocada**. Cargado como gasto, ese
 * IVA no entra al libro de compras y no se computa como crédito fiscal; la
 * plata sale igual de la cuenta, así que nada se descuadra y nadie se entera.
 * Por eso el esquema pregunta explícitamente si el documento discrimina IVA.
 */

const opcional = (tipo: string) => ({ anyOf: [{ type: tipo }, { type: "null" }] })

export const SCHEMA_GASTO = {
  type: "object",
  additionalProperties: false,
  properties: {
    fecha: opcional("string"),
    importe: opcional("number"),
    moneda: { anyOf: [{ type: "string", enum: ["ARS", "USD"] }, { type: "null" }] },
    tc: opcional("number"),
    categoria: {
      anyOf: [{ type: "string", enum: [...CATEGORIAS_GASTO] }, { type: "null" }],
    },
    detalle: opcional("string"),
    referencia: opcional("string"),
    /** Quién cobró. No se cruza contra proveedores: un gasto no genera cuenta
     *  corriente, y el nombre sirve como detalle. */
    beneficiario: opcional("string"),

    /** La pregunta que decide si esto va acá o en facturas de compra. */
    discriminaIva: { type: "boolean" },
    cuitEmisor: opcional("string"),

    tipoDocumento: opcional("string"),
    confianza: { type: "string", enum: ["alta", "media", "baja"] },
    camposDudosos: { type: "array", items: { type: "string" } },
    observacionLectura: opcional("string"),
  },
  required: [
    "fecha",
    "importe",
    "moneda",
    "tc",
    "categoria",
    "detalle",
    "referencia",
    "beneficiario",
    "discriminaIva",
    "cuitEmisor",
    "tipoDocumento",
    "confianza",
    "camposDudosos",
    "observacionLectura",
  ],
} as const

export type LecturaGasto = {
  fecha: string | null
  importe: number | null
  moneda: "ARS" | "USD" | null
  tc: number | null
  categoria: string | null
  detalle: string | null
  referencia: string | null
  beneficiario: string | null
  discriminaIva: boolean
  cuitEmisor: string | null
  tipoDocumento: string | null
  confianza: "alta" | "media" | "baja"
  camposDudosos: string[]
  observacionLectura: string | null
}

export type BorradorGasto = {
  gasto: LecturaGasto
  avisos: string[]
}

export const PROMPT_GASTO = `Sos el asistente de administración de una empresa argentina. Te paso el comprobante de un pago —un ticket, una boleta de un servicio, un resumen de tarjeta, el comprobante de una transferencia bancaria— y tenés que extraer los datos para registrarlo como movimiento de caja.

REGLAS, en orden de importancia:

1. **No inventes nada.** Si un dato no está o no se lee, devolvé null. Nunca pongas 0 en un importe que no leíste: un cero se ve igual que un importe real y nadie lo revisa.

2. **El importe va como número, sin símbolos ni separadores de miles.** En Argentina el punto separa miles y la coma los decimales: "1.234.567,89" es 1234567.89. Poné el **total efectivamente pagado**, no el subtotal.

3. **Las fechas en formato YYYY-MM-DD.** El formato argentino es día/mes/año: "01/08/2026" es 2026-08-01. Si el año viene con dos dígitos, asumí 20XX.

4. **discriminaIva**: true si el documento es una factura o nota que muestra el IVA como renglón aparte (típicamente una factura A, o una C que detalla impuestos). false si es un ticket sin IVA discriminado, una boleta de servicio, un comprobante de transferencia o un recibo simple. Es el campo más importante del documento: decide si esto va como gasto o como factura de compra.

5. **categoria**: la que mejor describa el gasto entre "impuestos", "bancarios", "sueldos", "cargas_sociales", "servicios" y "otros". Luz, gas, internet, alquiler y abonos son "servicios". Comisiones, mantenimiento de cuenta e intereses son "bancarios". AFIP, ARCA, rentas provinciales y municipales son "impuestos". Si no encaja en ninguna, "otros".

6. **referencia**: el número que identifica la operación —número de comprobante, de transferencia, de cupón—. Sin prefijos, solo el identificador.

7. **detalle**: una línea con el concepto, como para reconocer el movimiento en un listado. Corto y específico ("Edenor — factura julio", no "pago de un servicio").

8. **beneficiario**: a nombre de quién está el cobro, si figura.

9. **moneda**: "ARS" si está en pesos, "USD" si está en dólares. Si el documento muestra un tipo de cambio, poné el valor en "tc" (pesos por dólar).

10. **confianza**: "alta" si el documento se lee perfecto y el importe y la fecha están claros; "media" si tuviste que interpretar algo; "baja" si está borroso, cortado o no parece un comprobante de pago.

11. **camposDudosos**: los nombres de los campos que leíste con dudas, tal como se llaman en el esquema. Lista vacía si no dudaste de nada.

12. **observacionLectura**: si el documento no es un comprobante de pago, está cortado o hay algo que quien revise debería saber, escribilo en una frase. Si está todo bien, null.

Devolvé únicamente el objeto con los datos extraídos.`
