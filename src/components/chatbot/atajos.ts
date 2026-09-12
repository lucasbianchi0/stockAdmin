import type { Acceso, Modulo } from "@/lib/permisos"

/**
 * Los accesos rápidos del asistente.
 *
 * Tres campos y no uno: el chip muestra `corto` y lo que se manda es `texto`.
 * Un chip con la pregunta entera no entra; una pregunta de dos palabras no le
 * alcanza al modelo para contestar bien. El emoji hace que la fila se lea de un
 * vistazo en vez de como seis rectángulos iguales.
 *
 * El criterio para elegirlos: lo que cada persona necesita hacer, no lo que el
 * sistema sabe hacer.
 */

export type Atajo = { emoji: string; corto: string; texto: string }

const POR_MODULO: Record<Modulo, Atajo[]> = {
  marketing: [
    { emoji: "🎨", corto: "Paleta", texto: "¿Cuáles son los colores de la marca y cuándo se usa cada uno?" },
    { emoji: "🖼️", corto: "Logos", texto: "Pasame los logos de Accedra y decime cuál uso sobre fondo oscuro y cuál sobre claro." },
    { emoji: "✍️", corto: "Tono", texto: "¿Cómo escribe Accedra? Dame los principios del tono y qué no decimos nunca." },
    { emoji: "📄", corto: "Boilerplate", texto: "Dame el boilerplate corto de Accedra, listo para copiar." },
    { emoji: "📑", corto: "Brochures", texto: "¿Qué brochures hay? Contame qué dice el de firma biométrica." },
    { emoji: "📅", corto: "Agenda", texto: "¿Qué contenido hay programado para los próximos días?" },
  ],
  productos: [
    { emoji: "🧾", corto: "Pedidos", texto: "¿Cómo vienen los pedidos a Distecna del último mes?" },
    { emoji: "📦", corto: "Inventario", texto: "¿Qué muestra el inventario y cómo encuentro un producto?" },
    { emoji: "⭐", corto: "Nuestros productos", texto: "¿Para qué sirve Nuestros Productos y qué significa el semáforo?" },
    { emoji: "🛒", corto: "Hacer un pedido", texto: "¿Desde dónde se genera un pedido a Distecna?" },
    { emoji: "🏢", corto: "Datos de Accedra", texto: "Pasame los datos de la empresa: razón social, CUIT, domicilio y contacto." },
    { emoji: "🧭", corto: "Qué tengo", texto: "¿Qué pantallas tengo habilitadas y para qué sirve cada una?" },
  ],
  administracion: [
    { emoji: "💰", corto: "Por cobrar", texto: "¿Cuánto hay por cobrar, cuánto está vencido y qué vence esta semana?" },
    { emoji: "💸", corto: "Por pagar", texto: "¿Cuánto hay por pagar, cuánto está vencido y qué vence esta semana?" },
    { emoji: "📈", corto: "Mi mes", texto: "¿Cuánto se facturó y cuánto se compró en lo que va del mes?" },
    { emoji: "🧮", corto: "Cargar un cobro", texto: "¿Cómo registro el cobro de una factura con retenciones?" },
    { emoji: "🏦", corto: "Caja y bancos", texto: "¿Cómo cargo un gasto o una transferencia entre cuentas?" },
    { emoji: "📚", corto: "Contabilidad", texto: "¿Qué asientos genera el sistema y dónde veo el mayor?" },
  ],
}

const ADMIN: Atajo[] = [
  { emoji: "📊", corto: "Resumen", texto: "Dame un resumen general de la operación: cobros, pagos, facturación del mes, pedidos y contenido." },
  { emoji: "💰", corto: "Por cobrar", texto: "¿Cuánto hay por cobrar, cuánto está vencido y qué vence esta semana?" },
  { emoji: "💸", corto: "Por pagar", texto: "¿Cuánto hay por pagar, cuánto está vencido y qué vence esta semana?" },
  { emoji: "📈", corto: "Mi mes", texto: "¿Cuánto se facturó y cuánto se compró en lo que va del mes?" },
  { emoji: "🧾", corto: "Pedidos", texto: "¿Cómo vienen los pedidos a Distecna del último mes?" },
  { emoji: "🎨", corto: "Brand kit", texto: "¿Qué tiene el brand kit y dónde encuentro cada cosa?" },
]

/**
 * Seis para esta persona. Con un solo módulo son los de ese módulo; con varios,
 * se intercalan para que ninguno quede afuera.
 */
export function atajosPara(acceso: Acceso): Atajo[] {
  if (acceso.admin) return ADMIN

  const listas = (Object.keys(POR_MODULO) as Modulo[])
    .filter((m) => acceso.modulos.includes(m))
    .map((m) => POR_MODULO[m])

  const elegidos: Atajo[] = []
  for (let i = 0; elegidos.length < 6 && listas.some((l) => i < l.length); i++) {
    for (const lista of listas) {
      if (lista[i] && elegidos.length < 6 && !elegidos.some((a) => a.texto === lista[i].texto)) {
        elegidos.push(lista[i])
      }
    }
  }
  return elegidos
}
