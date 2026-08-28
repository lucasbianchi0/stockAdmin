import { TIPOS_CUENTA, type TipoCuenta } from "@/lib/admin/cuentas-vocabulario"
import { normalizarCabecera } from "@/lib/admin/importar-csv"
import type { Grilla } from "@/lib/admin/xlsx"

/**
 * El Excel del plan de cuentas del estudio contable → filas de `plan_cuentas`.
 *
 * Es el punto 1 del pliego —«DATOS MAESTROS: cargamos el Excel del plan de
 * cuentas»— y lo que hace que ese punto sea una pantalla y no una migración.
 * Hasta acá el plan entró una sola vez, escrito a mano en el SQL de
 * `20260813_01`: cada cuenta nueva que abría el contador era una migración, un
 * deploy y una espera. Ahora se sube el mismo archivo que él mantiene.
 *
 * LO QUE ESTE ARCHIVO NO HACE
 *
 * No borra. Una cuenta que desapareció del Excel se deja como está y se informa
 * aparte, porque borrarla se llevaría por delante todo lo imputado contra ella:
 * la FK es `on delete set null` y las facturas quedarían sin cuenta en silencio,
 * que es exactamente el error que el módulo entero está diseñado para evitar.
 * Desactivarla es una decisión de quien mira el listado, no del importador.
 *
 * LAS COLUMNAS
 *
 * Son las del archivo del contador, que ya venían documentadas en la migración:
 *
 *   Codigo · Nombre · Subcuent · Tipo_SubCta · Rubro
 *   Banco · Valores · L_Iva · Mon_Extr · Medio_Pago
 */

/* ── Columnas ─────────────────────────────────────────────────────────────── */

export type CampoPlan =
  | "codigo"
  | "nombre"
  | "llevaSubcuenta"
  | "tipoSubcuenta"
  | "rubro"
  | "esBanco"
  | "esValores"
  | "libroIva"
  | "monedaExtranjera"
  | "esMedioPago"

/** El primer alias de cada lista es el encabezado exacto del archivo del
 *  estudio; los demás cubren que alguien lo renombre a algo legible. */
const ALIAS: Record<CampoPlan, string[]> = {
  codigo: ["codigo", "cuenta", "nro cuenta", "numero"],
  nombre: ["nombre", "denominacion", "descripcion"],
  llevaSubcuenta: ["subcuent", "subcuenta", "lleva subcuenta"],
  tipoSubcuenta: ["tipo subcta", "tipo subcuenta", "tipo de subcuenta"],
  rubro: ["rubro", "tipo"],
  esBanco: ["banco", "es banco"],
  esValores: ["valores", "es valores"],
  libroIva: ["l iva", "libro iva"],
  monedaExtranjera: ["mon extr", "moneda extranjera"],
  esMedioPago: ["medio pago", "medio de pago", "es medio pago"],
}

export type MapaPlan = Partial<Record<CampoPlan, number>>

export function mapearColumnasPlan(cabeceras: string[]): MapaPlan {
  const mapa: MapaPlan = {}
  cabeceras.forEach((cabecera, i) => {
    const norm = normalizarCabecera(cabecera)
    if (!norm) return
    const campo = (Object.keys(ALIAS) as CampoPlan[]).find((c) => ALIAS[c].includes(norm))
    if (campo && mapa[campo] === undefined) mapa[campo] = i
  })
  return mapa
}

/** Sin código ni nombre no hay cuenta; el resto son banderas y su ausencia
 *  quiere decir "no". */
export function columnasFaltantesPlan(mapa: MapaPlan): string[] {
  const faltan: string[] = []
  if (mapa.codigo === undefined) faltan.push("Codigo")
  if (mapa.nombre === undefined) faltan.push("Nombre")
  if (mapa.rubro === undefined) faltan.push("Rubro")
  return faltan
}

/* ── Celda a dato ─────────────────────────────────────────────────────────── */

/** Los rubros como los escribe el contador. */
const RUBRO: Record<string, TipoCuenta> = {
  act: "activo",
  pas: "pasivo",
  pat: "patrimonio",
  gan: "ingreso",
  per: "egreso",
  // Por si alguien escribe la palabra entera en vez de la sigla.
  activo: "activo",
  pasivo: "pasivo",
  patrimonio: "patrimonio",
  ganancia: "ingreso",
  ganancias: "ingreso",
  perdida: "egreso",
  perdidas: "egreso",
}

/** `SI` es sí; el vacío y cualquier otra cosa es no. La planilla no usa `NO`:
 *  la celda se deja en blanco. */
const bandera = (v: string): boolean => /^(si|sí|s|x|1|true)$/i.test(v.trim())

/* ── Una fila ─────────────────────────────────────────────────────────────── */

/** Una cuenta lista para escribir, con los nombres de columna de la base. */
export type FilaPlan = {
  codigo: string
  nombre: string
  tipo: TipoCuenta
  orden: number
  lleva_subcuenta: boolean
  tipo_subcuenta: "cliente" | "proveedor" | null
  es_banco: boolean
  es_valores: boolean
  libro_iva: "compras" | "ventas" | null
  moneda_extranjera: boolean
  es_medio_pago: boolean
  /** Solo se usa al dar de alta. Ver `activaPorDefecto`. */
  activo: boolean
}

export type LecturaPlan = {
  cuentas: FilaPlan[]
  /** Fila por fila, lo que no se pudo leer. La importación no escribe nada si
   *  hay uno solo: media planilla cargada es peor que ninguna, porque no queda
   *  registro de dónde se cortó. */
  errores: { linea: number; motivo: string }[]
}

/**
 * Una cuenta que el propio contador marcó muerta.
 *
 * El plan trae unas cuantas —«No USARRet. Gcias a Pagar», «Nro de cuenta SIN
 * USO», «Gs de Ferreteria - NO USAR»—: existen para que lo histórico que las
 * referencia no quede colgado, pero ofrecerlas en un formulario es invitar a
 * imputar contra algo que el estudio ya no mira. Nacen inactivas, igual que en
 * la migración que sembró el plan.
 */
function activaPorDefecto(nombre: string): boolean {
  return !/(no\s*usar|sin\s*uso)/i.test(nombre)
}

export function leerPlanDeCuentas(grilla: Grilla): LecturaPlan {
  const mapa = mapearColumnasPlan(grilla.cabeceras)
  const cuentas: FilaPlan[] = []
  const errores: { linea: number; motivo: string }[] = []
  const vistos = new Set<string>()

  grilla.filas.forEach((fila, i) => {
    // La línea es la de la planilla abierta en Excel: el encabezado es la 1.
    const linea = i + 2
    const celda = (campo: CampoPlan): string => {
      const j = mapa[campo]
      return j === undefined ? "" : (fila[j] ?? "").trim()
    }

    const codigo = celda("codigo")
    const nombre = celda("nombre")

    // Una fila sin código ni nombre es una separadora o un resto del formato:
    // no es un error, simplemente no es una cuenta.
    if (!codigo && !nombre) return

    if (!codigo) {
      errores.push({ linea, motivo: `«${nombre}» no tiene código de cuenta` })
      return
    }
    if (!nombre) {
      errores.push({ linea, motivo: `La cuenta ${codigo} no tiene nombre` })
      return
    }
    if (vistos.has(codigo)) {
      errores.push({ linea, motivo: `El código ${codigo} aparece dos veces en la planilla` })
      return
    }

    const tipo = RUBRO[celda("rubro").toLowerCase().replace(/\./g, "")]
    if (!tipo) {
      errores.push({
        linea,
        motivo: `La cuenta ${codigo} tiene el rubro «${celda("rubro")}», que no es ninguno de ${TIPOS_CUENTA.join(", ")} (ACT, PAS, PAT, GAN, PER)`,
      })
      return
    }

    const subcuenta = celda("tipoSubcuenta").toUpperCase()
    const libro = celda("libroIva").toUpperCase()

    vistos.add(codigo)
    cuentas.push({
      codigo,
      nombre,
      tipo,
      /* El orden de presentación es el código leído como número. `codigo` es
         texto —y tiene que serlo, porque un plan puede usar `1.1.01`—, así que
         ordenar por él pondría la 10 antes que la 9. Lo que no es un número
         entero va al final, que es donde se lo espera. */
      orden: /^\d+$/.test(codigo) ? Number(codigo) : 999_999,
      lleva_subcuenta: bandera(celda("llevaSubcuenta")),
      tipo_subcuenta: subcuenta === "CL" ? "cliente" : subcuenta === "PR" ? "proveedor" : null,
      es_banco: bandera(celda("esBanco")),
      es_valores: bandera(celda("esValores")),
      libro_iva: libro === "CO" ? "compras" : libro === "VE" ? "ventas" : null,
      moneda_extranjera: bandera(celda("monedaExtranjera")),
      es_medio_pago: bandera(celda("esMedioPago")),
      activo: activaPorDefecto(nombre),
    })
  })

  return { cuentas, errores }
}

/* ── El resultado, para la pantalla ───────────────────────────────────────── */

export type ResultadoImportacion = {
  altas: number
  cambios: number
  sinCambios: number
  /** Las que están en la base y ya no vienen en el archivo. No se tocan: se
   *  listan para que alguien decida si desactivarlas. */
  ausentes: { codigo: string; nombre: string }[]
}
