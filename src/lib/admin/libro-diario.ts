import type { Asiento } from "@/lib/admin/asientos"
import { redondear } from "@/lib/admin/moneda"

/**
 * El libro diario con el formato del estudio contable: el que se imprime y se
 * encuaderna en los libros rubricados, idéntico al que venían usando.
 *
 * Tres reglas que no son las de la pantalla:
 *
 *  · Las facturas de compra y de venta no van una por una. Se resumen en un
 *    asiento "IVA Compras" y otro "IVA Ventas" por mes, fechados el último día,
 *    con una línea por cuenta y por lado (si una cuenta tiene debe y haber en
 *    el mes van en dos líneas, no neteadas: así lo copia el estudio). Lo demás
 *    —cobros, pagos, movimientos, manuales— va asiento por asiento. Los cobros
 *    traen sus retenciones en su propio asiento, así que quedan ahí.
 *  · El número de asiento vuelve a 1 cada día: es el orden dentro de la fecha.
 *  · Cada línea lleva su descripción (PA … PR: proveedor / RE … CL: cliente en
 *    los recibos), recortada al ancho de la columna.
 *
 * Es sólo una forma de imprimir: los asientos registrados no cambian.
 */

export type RenglonLibro =
  | { tipo: "linea"; fecha: string; asto: number; codigo: string; cuenta: string; descripcion: string; debe: number; haber: number }
  | { tipo: "blanco" }

/** Lo que entra en las columnas del formato original. */
const ANCHO_CUENTA = 25
const ANCHO_DESCRIPCION = 35

const recortar = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n)

/** "2024-09-01" → "1/09/24", como el libro original. */
export function fechaLibro(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${Number(d)}/${m}/${a.slice(2)}`
}

/** El último día del mes de una fecha ISO. */
function finDeMes(iso: string): string {
  const [a, m] = iso.split("-").map(Number)
  const dia = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return `${iso.slice(0, 7)}-${String(dia).padStart(2, "0")}`
}

type LineaLibro = { codigo: string; cuenta: string; descripcion: string; debe: number; haber: number }
type AsientoLibro = { fecha: string; prioridad: number; orden: number; lineas: LineaLibro[] }

/** Cómo se dice el recibo en cada línea: "PA PR: proveedor" o "RE CL: cliente". */
function descripcionDeRecibo(a: Asiento): string {
  const aux = a.lineas.find((l) => l.auxiliarNombre)
  if (!aux) return a.descripcion
  const esCobro = aux.auxiliarTipo === "cliente"
  return `${esCobro ? "RE CL:" : "PA PR:"} ${aux.auxiliarNombre}`
}

/**
 * Factura de compra o de venta. El servidor lo manda con `completo=1`; si un
 * asiento viejo no lo trae, la descripción que arma la base lo dice igual.
 */
function ladoDeIva(a: Asiento): "compra" | "venta" | null {
  if (a.origen !== "comprobante") return null
  if (a.comprobanteTipo) return a.comprobanteTipo
  if (/^Factura de venta/i.test(a.descripcion)) return "venta"
  if (/^Factura de compra/i.test(a.descripcion)) return "compra"
  return null
}

export function armarLibroDiario(
  asientos: Asiento[],
  { desde, hasta }: { desde?: string; hasta?: string } = {}
): RenglonLibro[] {
  const libro: AsientoLibro[] = []

  type Acumulado = { codigo: string; cuenta: string; debe: number; haber: number }
  const resumenes = new Map<string, { mes: string; lado: "compra" | "venta"; cuentas: Map<string, Acumulado> }>()

  asientos.forEach((a, i) => {
    const lado = ladoDeIva(a)
    if (lado) {
      const mes = a.fecha.slice(0, 7)
      const clave = `${mes}|${lado}`
      let r = resumenes.get(clave)
      if (!r) {
        r = { mes, lado, cuentas: new Map() }
        resumenes.set(clave, r)
      }
      for (const l of a.lineas) {
        const c = r.cuentas.get(l.cuentaId) ?? { codigo: l.cuentaCodigo, cuenta: l.cuentaNombre, debe: 0, haber: 0 }
        c.debe += l.debeArs
        c.haber += l.haberArs
        r.cuentas.set(l.cuentaId, c)
      }
      return
    }

    const recibo = a.origen === "pago" ? descripcionDeRecibo(a) : null
    libro.push({
      fecha: a.fecha,
      prioridad: 2,
      orden: i,
      lineas: a.lineas.map((l) => ({
        codigo: l.cuentaCodigo,
        cuenta: l.cuentaNombre,
        // En un movimiento el detalle de la línea es el nombre del banco, que
        // ya dice la cuenta: el libro original repite la del asiento.
        descripcion: recibo ?? (a.origen === "manual" ? l.detalle || a.descripcion : a.descripcion),
        debe: l.debeArs,
        haber: l.haberArs,
      })),
    })
  })

  for (const r of resumenes.values()) {
    // El último día del mes, salvo que el período termine antes: un asiento
    // fechado después del "hasta" no puede estar en el libro de ese período.
    let fin = finDeMes(`${r.mes}-01`)
    if (hasta && hasta < fin) fin = hasta
    let inicio = `${r.mes}-01`
    if (desde && desde > inicio) inicio = desde
    const [a, m, d] = fin.split("-")
    const descripcion = `IVA ${r.lado === "compra" ? "Compras" : "Ventas"} del ${inicio.slice(8)} al ${d}/${m}/${a.slice(2)}`

    const lineas: LineaLibro[] = []
    const cuentas = [...r.cuentas.values()].sort((x, y) => x.codigo.localeCompare(y.codigo, "es", { numeric: true }))
    for (const c of cuentas) {
      const debe = redondear(c.debe)
      const haber = redondear(c.haber)
      if (debe) lineas.push({ codigo: c.codigo, cuenta: c.cuenta, descripcion, debe, haber: 0 })
      if (haber) lineas.push({ codigo: c.codigo, cuenta: c.cuenta, descripcion, debe: 0, haber })
    }
    // Compras antes que ventas y los dos antes que el resto del día: el orden
    // del libro original.
    if (lineas.length) libro.push({ fecha: fin, prioridad: r.lado === "compra" ? 0 : 1, orden: 0, lineas })
  }

  libro.sort((x, y) => x.fecha.localeCompare(y.fecha) || x.prioridad - y.prioridad || x.orden - y.orden)

  const renglones: RenglonLibro[] = []
  let fechaAnterior = ""
  let asto = 0
  for (const a of libro) {
    if (!a.lineas.length) continue
    asto = a.fecha === fechaAnterior ? asto + 1 : 1
    fechaAnterior = a.fecha
    if (renglones.length) renglones.push({ tipo: "blanco" })
    for (const l of a.lineas) {
      renglones.push({
        tipo: "linea",
        fecha: fechaLibro(a.fecha),
        asto,
        codigo: l.codigo,
        cuenta: recortar(l.cuenta, ANCHO_CUENTA),
        descripcion: recortar(l.descripcion, ANCHO_DESCRIPCION),
        debe: l.debe,
        haber: l.haber,
      })
    }
  }
  return renglones
}

/**
 * Corta los renglones en hojas de un alto fijo. Se pagina acá y no con el
 * contador de páginas de CSS (`@page` con cajas de margen) porque Safari y
 * Firefox no lo dibujan: el número de hoja tiene que salir en cualquier
 * navegador. Un renglón en blanco no abre una hoja.
 */
export function paginarLibro(renglones: RenglonLibro[], porHoja: number): RenglonLibro[][] {
  const hojas: RenglonLibro[][] = []
  let hoja: RenglonLibro[] = []
  for (const r of renglones) {
    if (r.tipo === "blanco" && hoja.length === 0) continue
    if (hoja.length === porHoja) {
      hojas.push(hoja)
      hoja = []
      if (r.tipo === "blanco") continue
    }
    hoja.push(r)
  }
  if (hoja.length) hojas.push(hoja)
  return hojas
}
