import { FORMAS_JURIDICAS, PROVINCIAS } from "@/lib/admin/entidades"

/**
 * Carga inteligente de una ficha: leer una constancia de AFIP —o cualquier
 * papel con membrete fiscal— y proponer el alta de un cliente o un proveedor.
 *
 * Es el mismo principio que la carga de facturas: **produce un borrador, no una
 * ficha**. Acá el riesgo es distinto y más silencioso que en un comprobante. Un
 * CUIT mal leído no descuadra nada visible: la ficha se guarda, se le factura,
 * y el error aparece cuando el cliente reclama que la factura está a nombre de
 * otro. Por eso el CUIT vuelve tal cual se leyó y se valida con el dígito
 * verificador del lado del servidor.
 *
 * Un documento puede traer dos empresas —una factura tiene emisor y receptor—,
 * así que se devuelven las dos y quien carga elige. El modelo no puede saber
 * cuál de las dos somos nosotros.
 */

const opcional = (tipo: string) => ({ anyOf: [{ type: tipo }, { type: "null" }] })

const EMPRESA = {
  type: "object",
  additionalProperties: false,
  properties: {
    razonSocial: opcional("string"),
    cuit: opcional("string"),
    formaJuridica: {
      anyOf: [{ type: "string", enum: [...FORMAS_JURIDICAS] }, { type: "null" }],
    },
    direccion: opcional("string"),
    provincia: { anyOf: [{ type: "string", enum: [...PROVINCIAS] }, { type: "null" }] },
    telefono: opcional("string"),
    email: opcional("string"),
    contacto: opcional("string"),
    /** Qué es esta empresa dentro del documento. Sirve para ordenar cuál se
     *  ofrece primero según se esté cargando un cliente o un proveedor. */
    rol: { anyOf: [{ type: "string", enum: ["emisor", "receptor", "titular"] }, { type: "null" }] },
  },
  required: [
    "razonSocial",
    "cuit",
    "formaJuridica",
    "direccion",
    "provincia",
    "telefono",
    "email",
    "contacto",
    "rol",
  ],
} as const

export const SCHEMA_FICHA = {
  type: "object",
  additionalProperties: false,
  properties: {
    empresas: { type: "array", items: EMPRESA },
    tipoDocumento: opcional("string"),
    confianza: { type: "string", enum: ["alta", "media", "baja"] },
    camposDudosos: { type: "array", items: { type: "string" } },
    observacionLectura: opcional("string"),
  },
  required: ["empresas", "tipoDocumento", "confianza", "camposDudosos", "observacionLectura"],
} as const

export type EmpresaLeida = {
  razonSocial: string | null
  cuit: string | null
  formaJuridica: string | null
  direccion: string | null
  provincia: string | null
  telefono: string | null
  email: string | null
  contacto: string | null
  rol: "emisor" | "receptor" | "titular" | null
}

export type LecturaFicha = {
  empresas: EmpresaLeida[]
  tipoDocumento: string | null
  confianza: "alta" | "media" | "baja"
  camposDudosos: string[]
  observacionLectura: string | null
}

/** Una empresa leída, ya cruzada contra el maestro. */
export type CandidatoFicha = EmpresaLeida & {
  /** Si ya existe una ficha con ese CUIT, cuál es. */
  existente: { id: string; razonSocial: string } | null
  /** El CUIT normalizado a 11 dígitos, o null si no pasó el verificador. */
  cuitNormalizado: string | null
  cuitInvalido: boolean
}

export type BorradorFicha = {
  candidatos: CandidatoFicha[]
  tipoDocumento: string | null
  confianza: "alta" | "media" | "baja"
  camposDudosos: string[]
  avisos: string[]
}

export const PROMPT_FICHA = `Sos el asistente de administración de una empresa argentina. Te paso un documento —lo más común es una constancia de inscripción de AFIP, pero puede ser una factura, un remito o un membrete— y tenés que extraer los datos de las empresas que aparecen, para dar de alta su ficha en el sistema.

REGLAS, en orden de importancia:

1. **No inventes nada.** Si un dato no está en el documento o no se lee, devolvé null. Nunca completes una dirección "porque debería ser", nunca deduzcas un CUIT a partir del nombre.

2. **El CUIT va con 11 dígitos y sin guiones.** Si en el documento aparece como 30-71234567-8, devolvé 30712345678. Si no se lee completo, devolvé null: un CUIT a medias es peor que ninguno.

3. **Devolvé todas las empresas que aparezcan como partes del documento**, en el array "empresas". Una constancia de AFIP tiene una sola (rol "titular"). Una factura tiene dos: el que la emitió (rol "emisor") y a quién se la emitió (rol "receptor"). No incluyas empresas que solo se mencionen de pasada —un banco en el pie de página, el sistema que imprimió el papel.

4. **formaJuridica** es la condición frente al IVA: "responsable_inscripto", "monotributo", "consumidor_final" o "exento". En una constancia de AFIP figura explícita; en una factura se deduce de la letra (A → responsable inscripto). Si no estás seguro, null.

5. **provincia** tiene que ser exactamente uno de los nombres de la lista del esquema. La Ciudad de Buenos Aires es "Ciudad Autónoma de Buenos Aires", no "Buenos Aires" —son dos jurisdicciones distintas y confundirlas cambia el impuesto—. Si el domicilio no dice la provincia, null.

6. **direccion** es la calle, el número y la localidad, en una línea. Sin la provincia, que va aparte.

7. **contacto** es el nombre de una persona, si el documento trae alguna. No pongas ahí la razón social.

8. **tipoDocumento**: qué es el papel que estás leyendo, en dos o tres palabras ("constancia de inscripción", "factura A", "presupuesto").

9. **confianza**: "alta" si el documento se lee perfecto y la razón social y el CUIT están claros; "media" si tuviste que interpretar algo; "baja" si está borroso, cortado o no parece un documento con datos fiscales.

10. **camposDudosos**: los nombres de los campos que leíste con dudas, tal como se llaman en el esquema ("cuit", "razonSocial", "provincia"...). Lista vacía si no dudaste de nada.

11. **observacionLectura**: si el documento no tiene datos fiscales, está cortado o hay algo que quien revise debería saber, escribilo en una frase. Si está todo bien, null.

Devolvé únicamente el objeto con los datos extraídos.`
