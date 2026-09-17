import { puede, type Acceso } from "@/lib/permisos"

/**
 * BUSCADOR GLOBAL — el índice de pantallas del backoffice.
 *
 * Por qué es una lista escrita a mano y no se deriva del menú:
 *
 * 1. El menú no tiene todo. `/contenido`, `/contenido/calendario` y
 *    `/contenido/prompts` están fuera de la sidebar a propósito, y los listados
 *    (`/admin/compras/listado` y compañía) se llegan desde adentro de cada
 *    pantalla. Buscar tiene que alcanzarlos igual: es justamente para lo que
 *    está, para llegar adonde no hay un ítem de menú.
 *
 * 2. Hay destinos que no son páginas. "Pie de firma" no es una ruta: es una
 *    sección del Brand Kit. Quien la busca no sabe ni tiene por qué saber que
 *    vive ahí adentro, así que el buscador la trata como un destino propio y la
 *    abre con su ancla.
 *
 * 3. Nadie teclea el nombre del ítem del menú. Escribe "mail", "saldo" o
 *    "banco". Las `claves` son esas palabras — sinónimos, el nombre viejo de la
 *    pantalla, lo que dice el contador — y son la mitad del valor de esto.
 *
 * El filtro de permisos NO se replica acá: sale de `puede()`, la misma función
 * que usa el middleware. Un buscador que ofrece puertas que el middleware no
 * abre es peor que no tener buscador.
 */

export type Destino = {
  titulo: string
  /** Ruta, con ancla si el destino es una sección adentro de una página. */
  href: string
  /** El grupo al que pertenece. Agrupa la lista y se muestra al costado. */
  seccion: string
  descripcion?: string
  /** Lo que alguien teclearía para llegar acá, además del título. */
  claves?: string[]
}

export const DESTINOS: Destino[] = [
  // ─── Productos ───────────────────────────────────────────────────────────
  {
    titulo: "Inventario",
    href: "/",
    seccion: "Productos",
    descripcion: "Catálogo completo de Distecna: stock, precios e impuestos",
    claves: ["stock", "distecna", "catalogo", "precios", "articulos", "sku"],
  },
  {
    titulo: "Nuestros Productos",
    href: "/mis-productos",
    seccion: "Productos",
    descripcion: "Productos seleccionados, precios mínimos y semáforo de publicación",
    claves: ["publicacion", "precio minimo", "semaforo", "seleccionados"],
  },
  {
    titulo: "Pedidos",
    href: "/orders",
    seccion: "Productos",
    descripcion: "Pedidos generados a Distecna desde Nuestros Productos",
    claves: ["ordenes", "distecna", "compras"],
  },

  // ─── Marketing ───────────────────────────────────────────────────────────
  {
    titulo: "Resultados",
    href: "/marketing/resultados",
    seccion: "Marketing",
    descripcion: "De cada peso invertido a la consulta que entró: campañas, sitio y leads",
    claves: ["google ads", "leads", "campañas", "analytics", "visitas", "conversiones", "metricas"],
  },
  {
    titulo: "Informes de campañas",
    href: "/marketing/informes",
    seccion: "Marketing",
    descripcion: "Un informe por mes, con la misma estructura siempre",
    claves: ["reporte", "mensual", "pdf", "ads"],
  },
  {
    titulo: "Brand Kit",
    href: "/marketing/brand",
    seccion: "Marketing",
    descripcion: "Todo lo que define cómo se ve, cómo habla y qué puede prometer Accedra",
    claves: ["marca", "identidad", "manual"],
  },
  {
    titulo: "Plantillas de mensajes",
    href: "/marketing/mensajes",
    seccion: "Marketing",
    descripcion: "Lo que el equipo escribe todos los días, escrito una sola vez y bien",
    claves: ["mail", "mails", "correo", "email", "whatsapp", "plantilla", "respuestas", "textos"],
  },
  {
    titulo: "Brochures",
    href: "/marketing/brochures",
    seccion: "Marketing",
    descripcion: "El material institucional en PDF, en su versión vigente",
    claves: ["pdf", "folleto", "material", "institucional", "presentacion"],
  },
  {
    titulo: "Landings y SEO",
    href: "/marketing/landings",
    seccion: "Marketing",
    descripcion: "Qué información tiene hoy el sitio, en buscadores y en respuestas de IA",
    claves: ["seo", "sitio", "web", "paginas", "google", "posicionamiento"],
  },
  {
    titulo: "Popup del sitio",
    href: "/marketing/popup",
    seccion: "Marketing",
    descripcion: "El aviso que aparece sobre accedra.com.ar, se prende y se apaga desde acá",
    claves: ["aviso", "cartel", "banner", "modal", "sitio"],
  },
  {
    titulo: "Eventos y certificados",
    href: "/marketing/eventos",
    seccion: "Marketing",
    descripcion: "Workshops, webinars y capacitaciones, con los certificados de asistencia",
    claves: ["certificado", "certificados", "webinar", "workshop", "capacitacion", "inscriptos", "asistentes", "diploma"],
  },
  {
    titulo: "Generación de contenido",
    href: "/contenido/generacion",
    seccion: "Marketing",
    descripcion: "Lotes de piezas con su imagen y su copy, para revisar y programar",
    claves: ["ia", "redes", "copy", "imagenes", "piezas", "posteos"],
  },
  {
    titulo: "Calendario de contenido",
    href: "/contenido/agenda",
    seccion: "Marketing",
    descripcion: "Lo que ya está programado, listo para copiar y publicar",
    claves: ["agenda", "programado", "publicar", "redes", "linkedin", "instagram"],
  },
  {
    titulo: "Prompts de contenido",
    href: "/contenido/prompts",
    seccion: "Marketing",
    descripcion: "Los prompts que usa la generación, y los que crea el equipo",
    claves: ["prompt", "ia", "instrucciones"],
  },
  {
    titulo: "Planes de contenido",
    href: "/contenido/calendario",
    seccion: "Marketing",
    descripcion: "Planes para LinkedIn, Instagram y Facebook como un conjunto",
    claves: ["plan", "calendario", "quincena"],
  },
  {
    titulo: "Creación de contenido",
    href: "/contenido",
    seccion: "Marketing",
    descripcion: "Generá ideas, copy e imágenes para redes con IA",
    claves: ["content studio", "ideas", "ia"],
  },

  // ─── Brand Kit, sección por sección ──────────────────────────────────────
  // Son anclas, no rutas: `/marketing/brand#firma`. Van una por una porque el
  // Brand Kit es largo y nadie recuerda que "el pie de mail" está adentro.
  {
    titulo: "Pie de firma",
    href: "/marketing/brand#firma",
    seccion: "Brand Kit",
    descripcion: "La firma de correo del equipo, lista para pegar en Gmail o en Outlook",
    claves: ["mail", "mails", "correo", "email", "firma", "signature", "gmail", "outlook", "pie"],
  },
  {
    titulo: "Canales oficiales",
    href: "/marketing/brand#canales",
    seccion: "Brand Kit",
    claves: ["redes", "linkedin", "instagram", "whatsapp", "telefono", "web"],
  },
  {
    titulo: "Ficha de datos",
    href: "/marketing/brand#ficha",
    seccion: "Brand Kit",
    claves: ["cuit", "razon social", "domicilio", "datos fiscales", "direccion"],
  },
  {
    titulo: "Logos",
    href: "/marketing/brand#logos",
    seccion: "Brand Kit",
    descripcion: "Los archivos del logo, para bajar en cada versión",
    claves: ["logo", "isotipo", "svg", "png", "marca"],
  },
  {
    titulo: "Paleta",
    href: "/marketing/brand#paleta",
    seccion: "Brand Kit",
    claves: ["colores", "color", "hex", "azul"],
  },
  {
    titulo: "Tipografía",
    href: "/marketing/brand#tipografia",
    seccion: "Brand Kit",
    claves: ["fuente", "letra", "geist", "tipo"],
  },
  {
    titulo: "Fotografía e iconos",
    href: "/marketing/brand#fotografia",
    seccion: "Brand Kit",
    claves: ["fotos", "imagenes", "iconos", "banco de imagenes"],
  },
  {
    titulo: "Sistema de piezas",
    href: "/marketing/brand#composicion",
    seccion: "Brand Kit",
    claves: ["composicion", "plantillas", "diseño", "piezas"],
  },
  {
    titulo: "Portadas LinkedIn",
    href: "/marketing/brand#portadas-linkedin",
    seccion: "Brand Kit",
    claves: ["portada", "linkedin", "banner", "cover"],
  },
  {
    titulo: "Posicionamiento",
    href: "/marketing/brand#posicionamiento",
    seccion: "Brand Kit",
    claves: ["propuesta de valor", "diferencial", "que hacemos"],
  },
  {
    titulo: "Boilerplate y bios",
    href: "/marketing/brand#boilerplate",
    seccion: "Brand Kit",
    claves: ["bio", "descripcion de la empresa", "quienes somos", "about"],
  },
  {
    titulo: "Tono de voz",
    href: "/marketing/brand#tono",
    seccion: "Brand Kit",
    claves: ["como escribir", "estilo", "redaccion"],
  },
  {
    titulo: "Claims y compliance",
    href: "/marketing/brand#claims",
    seccion: "Brand Kit",
    claves: ["que podemos prometer", "legales", "promesas"],
  },
  {
    titulo: "Buyer personas",
    href: "/marketing/brand#personas",
    seccion: "Brand Kit",
    claves: ["publico", "audiencia", "a quien le vendemos", "perfiles"],
  },
  {
    titulo: "Catálogo de servicios",
    href: "/marketing/brand#servicios",
    seccion: "Brand Kit",
    claves: ["que vendemos", "soluciones", "servicios"],
  },
  {
    titulo: "Prueba social",
    href: "/marketing/brand#prueba-social",
    seccion: "Brand Kit",
    claves: ["clientes", "partners", "logos de clientes", "testimonios"],
  },
  {
    titulo: "Casos de éxito",
    href: "/marketing/brand#casos",
    seccion: "Brand Kit",
    claves: ["casos", "referencias", "historias"],
  },
  {
    titulo: "Prompts por disciplina",
    href: "/marketing/brand#prompts",
    seccion: "Brand Kit",
    claves: ["prompt", "ia", "chatgpt", "contexto"],
  },
  {
    titulo: "Bloques de contexto",
    href: "/marketing/brand#bloques",
    seccion: "Brand Kit",
    claves: ["prompt", "contexto", "ia"],
  },

  // ─── Administración ──────────────────────────────────────────────────────
  {
    titulo: "Datos maestros",
    href: "/admin/maestros",
    seccion: "Administración",
    descripcion: "El plan de cuentas del estudio contable, y el Excel con el que se actualiza",
    claves: ["plan de cuentas", "contador", "excel", "imputaciones", "rubros"],
  },
  {
    titulo: "Proveedores",
    href: "/admin/proveedores",
    seccion: "Administración",
    descripcion: "La ficha de cada proveedor, nacional o del exterior",
    claves: ["alta", "ficha", "cuit", "exterior"],
  },
  {
    titulo: "Cuenta corriente proveedor",
    href: "/admin/proveedores/cuenta-corriente",
    seccion: "Administración",
    descripcion: "Cada comprobante y cada pago del proveedor, con el saldo corrido",
    claves: ["saldo", "deuda", "le debemos", "cuenta corriente"],
  },
  {
    titulo: "Facturas de compras",
    href: "/admin/compras",
    seccion: "Administración",
    descripcion: "Cargá el comprobante recibido del proveedor, a mano o desde el PDF",
    claves: ["factura", "comprobante", "cargar", "compra", "gasto", "percepciones"],
  },
  {
    titulo: "Facturas de compras cargadas",
    href: "/admin/compras/listado",
    seccion: "Administración",
    descripcion: "Comprobantes recibidos de proveedores, con percepciones y saldo pendiente",
    claves: ["listado", "facturas cargadas", "buscar factura"],
  },
  {
    titulo: "Pagos de facturas",
    href: "/admin/pagos",
    seccion: "Administración",
    descripcion: "Elegí qué comprobantes cancela el pago, con retenciones y medio de pago",
    claves: ["orden de pago", "pagar", "retencion", "ganancias"],
  },
  {
    titulo: "Pagos registrados",
    href: "/admin/pagos/listado",
    seccion: "Administración",
    descripcion: "Órdenes de pago con imputación, retención de ganancias y medio de pago",
    claves: ["listado", "pagos hechos"],
  },
  {
    titulo: "Otros movimientos",
    href: "/admin/movimientos",
    seccion: "Administración",
    descripcion: "Todo movimiento de dinero que no pasa por una factura, en cualquier cuenta",
    claves: ["gasto", "transferencia", "sin factura", "retiro", "deposito"],
  },
  {
    titulo: "Movimientos cargados",
    href: "/admin/movimientos/listado",
    seccion: "Administración",
    descripcion: "Todo lo que se movió sin factura, en todas las cuentas",
    claves: ["listado", "gastos"],
  },
  {
    titulo: "Clientes",
    href: "/admin/clientes",
    seccion: "Administración",
    descripcion: "La ficha de cada cliente. Solo la razón social es obligatoria.",
    claves: ["alta", "ficha", "cuit", "dni", "razon social"],
  },
  {
    titulo: "Cuenta corriente cliente",
    href: "/admin/clientes/cuenta-corriente",
    seccion: "Administración",
    descripcion: "Cada factura y cada cobro del cliente, con el saldo corrido",
    claves: ["saldo", "nos deben", "deuda", "cuenta corriente"],
  },
  {
    titulo: "Facturas de ventas",
    href: "/admin/ventas",
    seccion: "Administración",
    descripcion: "Registrá el comprobante que ya se emitió, a mano o desde el PDF",
    claves: ["factura", "vender", "emitir", "venta"],
  },
  {
    titulo: "Facturas de ventas emitidas",
    href: "/admin/ventas/listado",
    seccion: "Administración",
    descripcion: "Comprobantes emitidos, en pesos y en dólares, con su vencimiento y su saldo",
    claves: ["listado", "facturas emitidas", "vencimiento"],
  },
  {
    titulo: "Cobros de facturas",
    href: "/admin/cobros",
    seccion: "Administración",
    descripcion: "Elegí qué facturas cancela el recibo, con retenciones y acreditación",
    claves: ["recibo", "cobrar", "retencion", "acreditacion"],
  },
  {
    titulo: "Cobros registrados",
    href: "/admin/cobros/listado",
    seccion: "Administración",
    descripcion: "Recibos con imputación a facturas, retenciones y acreditación en la cuenta",
    claves: ["listado", "cobros hechos"],
  },
  {
    titulo: "Caja y bancos",
    href: "/admin/cuentas",
    seccion: "Administración",
    descripcion: "Saldos y movimientos de cada cuenta, con gastos, transferencias y conciliación",
    claves: ["banco", "caja", "efectivo", "saldo", "conciliacion", "cuentas", "dolares"],
  },
  {
    titulo: "Contabilidad",
    href: "/admin/contabilidad",
    seccion: "Administración",
    descripcion: "Los asientos que genera el sistema — diario, mayor y sumas y saldos, en pesos",
    claves: ["asientos", "diario", "mayor", "sumas y saldos", "balance", "libro"],
  },
  {
    titulo: "Reportes",
    href: "/admin/reportes",
    seccion: "Administración",
    descripcion: "Pendientes, saldos y estados de cuenta — en pesos y en dólares, exportables",
    claves: ["estado de cuenta", "exportar", "excel", "pendientes", "informe"],
  },

  // ─── Del equipo ──────────────────────────────────────────────────────────
  {
    titulo: "Ticketera",
    href: "/tickets",
    seccion: "Equipo",
    descripcion: "Lo que el equipo tiene entre manos, en un tablero solo",
    claves: ["tickets", "tareas", "tablero", "kanban", "pendientes"],
  },
]

/** Sin tildes y en minúscula: quien busca "generacion" tiene que encontrar "Generación". */
const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

const palabrasDe = (texto: string) =>
  normalizar(texto).split(/[^a-z0-9]+/).filter(Boolean)

/** La ruta del destino sin el ancla, que es lo que entiende `puede()`. */
const rutaDe = (href: string) => href.split("#")[0] || "/"

/* El índice se arma una sola vez al cargar el módulo: normalizar 60 destinos en
   cada tecleada es trabajo repetido para siempre el mismo resultado. */
const INDICE = DESTINOS.map((destino) => ({
  destino,
  ruta: rutaDe(destino.href),
  titulo: normalizar(destino.titulo),
  palabrasTitulo: palabrasDe(destino.titulo),
  claves: (destino.claves ?? []).map(normalizar),
  seccion: normalizar(destino.seccion),
  descripcion: normalizar(destino.descripcion ?? ""),
}))

type Entrada = (typeof INDICE)[number]

/**
 * Cuánto pesa un término en un destino. 0 = no aparece.
 *
 * La escala no es arbitraria: un término que empieza el título vale más que uno
 * que aparece perdido en la descripción, porque "cob" tiene que traer "Cobros"
 * antes que "Facturas de ventas" (que menciona cobros en su texto).
 */
function puntaje(entrada: Entrada, termino: string): number {
  if (entrada.titulo.startsWith(termino)) return 100
  if (entrada.palabrasTitulo.some((p) => p.startsWith(termino))) return 70
  if (entrada.titulo.includes(termino)) return 50

  const clave = entrada.claves.find((c) => c.includes(termino))
  if (clave) return clave.startsWith(termino) ? 45 : 30

  if (entrada.seccion.startsWith(termino)) return 20
  if (entrada.descripcion.includes(termino)) return 12
  return 0
}

/**
 * Los destinos que puede abrir este usuario, ordenados por qué tan bien
 * responden a la consulta. Sin consulta devuelve todo: el buscador abierto en
 * blanco es además el mapa del backoffice.
 *
 * Los términos se exigen todos —"factura compra" no puede traer todas las
 * facturas—, pero cada uno puede aparecer en un campo distinto.
 */
export function buscar(consulta: string, acceso: Acceso): Destino[] {
  const permitidos = INDICE.filter((e) => puede(acceso, e.ruta))
  const terminos = normalizar(consulta).split(/\s+/).filter(Boolean)
  if (terminos.length === 0) return permitidos.map((e) => e.destino)

  return permitidos
    .map((entrada) => {
      let total = 0
      for (const termino of terminos) {
        const p = puntaje(entrada, termino)
        if (p === 0) return null
        total += p
      }
      return { destino: entrada.destino, total }
    })
    .filter((r): r is { destino: Destino; total: number } => r !== null)
    .sort((a, b) => b.total - a.total)
    .map((r) => r.destino)
}

/** Los resultados agrupados por sección, en el orden en el que llegaron. */
export function agrupar(destinos: Destino[]): { seccion: string; destinos: Destino[] }[] {
  const grupos: { seccion: string; destinos: Destino[] }[] = []
  for (const destino of destinos) {
    const grupo = grupos.find((g) => g.seccion === destino.seccion)
    if (grupo) grupo.destinos.push(destino)
    else grupos.push({ seccion: destino.seccion, destinos: [destino] })
  }
  return grupos
}
