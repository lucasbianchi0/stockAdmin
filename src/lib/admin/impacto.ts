import type { TipoComprobante } from "@/lib/admin/comprobantes"
import { formatearImporte } from "@/lib/admin/moneda"

/**
 * Qué tocó una carga en el resto del sistema.
 *
 * POR QUE EXISTE ESTO
 *
 * Cargar una factura no es guardar una fila. Da de alta un proveedor, mueve su
 * cuenta corriente, escribe un asiento en el diario y agrega plata a la cola de
 * lo que hay que pagar. Todo eso pasa solo, que es exactamente el punto — y
 * también el problema: lo que ocurre en silencio no se aprende nunca. Quien
 * carga seis PDF y ve un "6 facturas cargadas" no tiene forma de saber que
 * además se dieron de alta dos proveedores, ni por qué el mayor todavía no
 * muestra nada.
 *
 * El resumen contesta las dos preguntas que aparecen ahí: **qué se movió** y
 * **qué falta**. La segunda es la que más vale. Un borrador no genera asiento ni
 * deuda; decirlo en el momento es la diferencia entre entender el circuito y
 * pensar que el sistema se comió una factura.
 *
 * Los números salen de consultar la base después de guardar, no de contar lo que
 * se mandó. Si el asiento no se generó porque faltaba la cuenta, el resumen lo
 * dice: es un informe de lo que pasó, no un acuse de lo que se pidió.
 */

export type Impacto = {
  tipo: TipoComprobante
  /** En qué estado quedaron. Es lo que decide si hubo impacto contable o no. */
  estado: "borrador" | "confirmado"
  comprobantes: number
  /** Las fichas que esta carga dio de alta, por nombre. */
  entidadesNuevas: string[]
  /** Cuántas cuentas corrientes distintas se movieron. */
  entidades: number
  /** Asientos efectivamente escritos en el diario. */
  asientos: number
  /** Confirmados que no generaron asiento por no tener cuenta imputada. */
  sinAsiento: number
  /** Lo que se sumó a cobrar o a pagar, por moneda. */
  deuda: { ARS: number; USD: number }
  /** De esos, cuántos vencen dentro de la semana. */
  vencenPronto: number
}

export const IMPACTO_VACIO = (tipo: TipoComprobante): Impacto => ({
  tipo,
  estado: "borrador",
  comprobantes: 0,
  entidadesNuevas: [],
  entidades: 0,
  asientos: 0,
  sinAsiento: 0,
  deuda: { ARS: 0, USD: 0 },
  vencenPronto: 0,
})

/** Las claves son las del sidebar: cada fila del resumen lleva al módulo que
 *  nombra, que es la mitad de para qué sirve mostrarlo. */
export type ClaveModulo = "comprobantes" | "entidades" | "contabilidad" | "cobranza" | "bancos"

export type ModuloImpactado = {
  clave: ClaveModulo
  titulo: string
  href: string
  /** Lo que pasó, en frases cortas. */
  lineas: string[]
  /** `pendiente` es lo que todavía no ocurrió y va a ocurrir; `aviso` es lo que
   *  quedó a medias y alguien tiene que ir a completar. */
  tono: "hecho" | "pendiente" | "aviso"
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * El impacto traducido a módulos, en el orden en que la plata los recorre:
 * la factura, la ficha, el mayor, la cobranza, el banco.
 */
export function modulosImpactados(i: Impacto): ModuloImpactado[] {
  const esCompra = i.tipo === "compra"
  const confirmado = i.estado === "confirmado"
  const modulos: ModuloImpactado[] = []

  /* 1 · Los comprobantes */
  modulos.push({
    clave: "comprobantes",
    titulo: esCompra ? "Facturas de compra" : "Facturas de venta",
    href: esCompra ? "/admin/compras" : "/admin/ventas",
    lineas: [
      confirmado
        ? `${plural(i.comprobantes, "comprobante confirmado", "comprobantes confirmados")}`
        : `${plural(i.comprobantes, "comprobante cargado", "comprobantes cargados")} como borrador`,
    ],
    tono: confirmado ? "hecho" : "pendiente",
  })

  if (!confirmado) {
    modulos[0].lineas.push("Revisalos y confirmalos: recién ahí impactan en el resto.")
  }

  /* 2 · Las fichas */
  const lineasEntidad: string[] = []
  if (i.entidadesNuevas.length > 0) {
    lineasEntidad.push(
      i.entidadesNuevas.length <= 3
        ? `Alta: ${i.entidadesNuevas.join(", ")}`
        : `${plural(i.entidadesNuevas.length, "ficha nueva", "fichas nuevas")} dadas de alta`
    )
    lineasEntidad.push("Completales categoría, plazo de pago y cuenta contable cuando puedas.")
  }
  if (confirmado && i.entidades > 0) {
    lineasEntidad.push(
      `${plural(i.entidades, "cuenta corriente actualizada", "cuentas corrientes actualizadas")}`
    )
  }
  if (lineasEntidad.length > 0) {
    modulos.push({
      clave: "entidades",
      titulo: esCompra ? "Proveedores" : "Clientes",
      href: esCompra ? "/admin/proveedores" : "/admin/clientes",
      lineas: lineasEntidad,
      tono: i.entidadesNuevas.length > 0 ? "aviso" : "hecho",
    })
  }

  /* 3 · El mayor */
  modulos.push({
    clave: "contabilidad",
    titulo: "Contabilidad",
    href: "/admin/contabilidad",
    lineas: confirmado
      ? [
          i.asientos > 0
            ? `${plural(i.asientos, "asiento generado", "asientos generados")} en el diario`
            : "No se generó ningún asiento.",
          ...(i.sinAsiento > 0
            ? [
                `${plural(i.sinAsiento, "comprobante quedó", "comprobantes quedaron")} sin asiento por no tener cuenta imputada. Asignásela y se genera solo.`,
              ]
            : []),
        ]
      : ["Todavía nada: un borrador no genera asiento."],
    tono: !confirmado ? "pendiente" : i.sinAsiento > 0 ? "aviso" : "hecho",
  })

  /* 4 · Lo que hay que pagar o cobrar */
  const importes = [
    i.deuda.ARS !== 0 ? formatearImporte(i.deuda.ARS, "ARS") : null,
    i.deuda.USD !== 0 ? formatearImporte(i.deuda.USD, "USD") : null,
  ].filter((v): v is string => v !== null)

  modulos.push({
    clave: "cobranza",
    titulo: esCompra ? "Pagos a proveedores" : "Cobros",
    href: esCompra ? "/admin/pagos" : "/admin/cobros",
    lineas: confirmado
      ? [
          importes.length > 0
            ? `${importes.join(" y ")} ${esCompra ? "a pagar" : "a cobrar"}, ya en la cola de pendientes`
            : `Sin saldo pendiente nuevo.`,
          ...(i.vencenPronto > 0
            ? [`${plural(i.vencenPronto, "vence", "vencen")} dentro de los próximos 7 días.`]
            : []),
        ]
      : [`Todavía nada: aparecen acá al confirmarlos.`],
    tono: !confirmado ? "pendiente" : i.vencenPronto > 0 ? "aviso" : "hecho",
  })

  /* 5 · El banco, que es el que NO se movió */
  modulos.push({
    clave: "bancos",
    titulo: "Caja y bancos",
    href: "/admin/cuentas",
    lineas: [
      `Sin movimiento: el saldo del banco cambia cuando registres ${
        esCompra ? "el pago" : "el cobro"
      }, no al cargar la factura.`,
    ],
    tono: "pendiente",
  })

  return modulos
}

/** Una línea para el toast, cuando el resumen completo sería demasiado. */
export function resumenCorto(i: Impacto): string {
  const partes = [
    `${i.comprobantes} ${i.estado === "confirmado" ? "confirmados" : "cargados"}`,
  ]
  if (i.entidadesNuevas.length > 0) {
    partes.push(
      `${i.entidadesNuevas.length} ${
        i.tipo === "compra" ? "proveedor" : "cliente"
      }${i.entidadesNuevas.length === 1 ? "" : "es"} de alta`
    )
  }
  if (i.asientos > 0) partes.push(`${i.asientos} asientos`)
  return partes.join(" · ")
}
