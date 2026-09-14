import type { Acceso, Modulo } from "@/lib/permisos"

/**
 * LOS AGENTES — el catálogo que ven el selector y la ruta.
 *
 * Sin imports de servidor: lo leen el panel, la barra lateral y `/api/chat`. Lo
 * que cada agente sabe y cómo piensa (el prompt, las herramientas) vive en
 * `especialistas.ts`, que nunca llega al navegador.
 *
 * Un especialista por módulo del backoffice, además del asistente general. Un
 * módulo partido en varios agentes obliga a elegir entre dos que se pisan: un
 * plan de marketing mezcla pauta, contenido, eventos y ventas, y el que lo
 * revisa tiene que ver todo junto.
 *
 * Cada agente se ofrece sólo a quien tiene su módulo. Igual que las secciones
 * del panel, esconderlo del selector es comodidad: la barrera real es la ruta,
 * que vuelve a chequear el acceso con la sesión antes de armar el prompt.
 */

export type Atajo = { emoji: string; corto: string; texto: string }

export const AGENTE_IDS = ["asistente", "finanzas", "marketing", "ecommerce"] as const
export type AgenteId = (typeof AGENTE_IDS)[number]

export type Agente = {
  id: AgenteId
  nombre: string
  /** La línea corta debajo del nombre. */
  rol: string
  emoji: string
  /** Lo que se lee en la pantalla vacía y en el selector desplegado. */
  descripcion: string
  /** Basta con tener uno. Vacío = cualquiera con algún módulo. */
  modulos: Modulo[]
  placeholder: string
  /** El asistente general arma los suyos según el acceso (ver atajos.ts). */
  atajos: Atajo[]
}

export const AGENTES: Agente[] = [
  {
    id: "asistente",
    nombre: "Asistente",
    rol: "Backoffice, marca y números del día",
    emoji: "🧭",
    descripcion:
      "Preguntame por el backoffice, la marca o los números de tu área. Te respondo con lo que tenés habilitado y te dejo el enlace a cada cosa.",
    modulos: [],
    placeholder: "Preguntá lo que necesites…",
    atajos: [],
  },
  {
    id: "finanzas",
    nombre: "Auditor financiero",
    rol: "Administración · CFO y auditoría",
    emoji: "📊",
    descripcion:
      "Audito la salud financiera con los números reales: liquidez, cobranzas, pagos, márgenes y evolución. Te marco riesgos, inconsistencias y qué hacer primero, como lo haría un CFO con mirada de auditor.",
    modulos: ["administracion"],
    placeholder: "Pedime una auditoría, un diagnóstico o un plan de caja…",
    atajos: [
      { emoji: "🩺", corto: "Chequeo general", texto: "Hacé un chequeo de salud financiera completo: liquidez, cobranzas, pagos y evolución de los últimos 12 meses. Marcame los tres riesgos más importantes y qué haría primero." },
      { emoji: "⏳", corto: "Antigüedad de saldos", texto: "Analizá la antigüedad de lo que nos deben y de lo que debemos. ¿Qué tan sana está la cobranza y dónde hay riesgo de incobrables?" },
      { emoji: "💧", corto: "Caja", texto: "Con los saldos de caja y bancos y lo que vence en los próximos días, ¿cómo viene la liquidez? ¿Hay algún bache que anticipar?" },
      { emoji: "📉", corto: "Tendencia", texto: "Mirá la evolución mensual de ventas y compras del último año. ¿Qué tendencia ves, qué meses se salen de la norma y qué explicaciones habría que verificar?" },
      { emoji: "🔎", corto: "Control interno", texto: "Armame un checklist de auditoría interna para nuestro circuito de facturas, cobros, pagos y caja, con los controles que deberíamos hacer cada mes." },
      { emoji: "🧮", corto: "Indicadores", texto: "¿Qué indicadores financieros deberíamos seguir todos los meses con nuestros datos, cómo se calculan y qué valor sería una alerta?" },
    ],
  },
  {
    id: "marketing",
    nombre: "Marketing",
    rol: "Marketing · Ads, contenido, eventos y ventas B2B",
    emoji: "📣",
    descripcion:
      "Director de marketing B2B: audito campañas de Google, Meta y LinkedIn, reviso planes y presupuesto, evalúo los eventos, planifico y escribo contenido con la voz de Accedra y te ayudo a convertir leads en ventas.",
    modulos: ["marketing"],
    placeholder: "Pedime una auditoría, un plan, un presupuesto o un post…",
    atajos: [
      { emoji: "🔍", corto: "Auditar campañas", texto: "Leé el último informe de campañas y hacé una auditoría honesta: qué funciona, qué está roto y las tres acciones de mayor impacto para el mes que viene." },
      { emoji: "🗺️", corto: "Revisar el plan", texto: "Revisá el plan de campañas vigente como lo haría un director de marketing B2B: ¿tiene sentido la estrategia, el reparto por solución y los objetivos? ¿Qué cambiarías?" },
      { emoji: "💵", corto: "Presupuesto", texto: "¿Cómo repartirías el presupuesto de pauta entre Google Ads, LinkedIn y Meta para una empresa B2B como la nuestra? Dame un esquema por etapa del embudo y cómo medirlo." },
      { emoji: "🎤", corto: "Eventos", texto: "Evaluá los eventos que venimos haciendo: ¿conviene hacer más, menos o distintos? ¿Cómo medimos si un evento genera negocio?" },
      { emoji: "🗓️", corto: "Calendario", texto: "Armame un calendario de contenido de 4 semanas para LinkedIn e Instagram, mirando lo que ya está programado para no repetir." },
      { emoji: "🤝", corto: "De lead a venta", texto: "¿Cómo deberíamos calificar y seguir los leads que llegan de las campañas para que se conviertan en reuniones y oportunidades? Proponé el proceso y los indicadores." },
    ],
  },
  {
    id: "ecommerce",
    nombre: "E-commerce y Mercado Libre",
    rol: "Productos · marketplaces, precios y catálogo",
    emoji: "🛒",
    descripcion:
      "Especialista en Mercado Libre y e-commerce: publicaciones, precios contra el mínimo, stock, reputación, Product Ads y rentabilidad por producto. Miro nuestro catálogo real y te digo dónde se gana y dónde se pierde.",
    modulos: ["productos"],
    placeholder: "Preguntame por precios, publicaciones, stock o Mercado Libre…",
    atajos: [
      { emoji: "🚦", corto: "Auditar catálogo", texto: "Auditá Nuestros Productos: precios contra el mínimo, stock y publicaciones. ¿Qué productos están en riesgo y qué hago con cada grupo?" },
      { emoji: "💲", corto: "Precios", texto: "¿Qué estrategia de precios conviene en Mercado Libre para productos de tecnología como los nuestros, teniendo en cuenta comisiones, cuotas, envío y el dólar?" },
      { emoji: "🏷️", corto: "Publicaciones", texto: "¿Cómo optimizo una publicación de Mercado Libre para posicionar mejor? Título, ficha técnica, fotos, variantes y preguntas." },
      { emoji: "📢", corto: "Product Ads", texto: "¿Cómo armo y controlo campañas de Product Ads en Mercado Libre sin perder rentabilidad? Qué ACOS apuntar y cómo decidir qué productos promocionar." },
      { emoji: "⭐", corto: "Reputación", texto: "¿Qué cuida la reputación en Mercado Libre y qué procesos necesitamos para no perder la medalla con reclamos, demoras o cancelaciones?" },
      { emoji: "📦", corto: "Reposición", texto: "Con el stock y los pedidos a Distecna del último mes, ¿qué reponer, qué dejar de publicar y dónde hay oportunidad?" },
    ],
  },
]

export function esAgenteId(v: unknown): v is AgenteId {
  return typeof v === "string" && (AGENTE_IDS as readonly string[]).includes(v)
}

export function puedeUsarAgente(acceso: Acceso, agente: Agente): boolean {
  if (acceso.admin) return true
  if (acceso.modulos.length === 0) return false
  return agente.modulos.length === 0 || agente.modulos.some((m) => acceso.modulos.includes(m))
}

export function agentesPara(acceso: Acceso): Agente[] {
  return AGENTES.filter((a) => puedeUsarAgente(acceso, a))
}

export function agentePorId(id: AgenteId): Agente {
  return AGENTES.find((a) => a.id === id) ?? AGENTES[0]
}
