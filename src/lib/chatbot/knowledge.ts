import {
  BLOQUES_CONTEXTO,
  COLORES_SOLUCION,
  LOGOS,
  PALETA,
  PROMPTS,
  armarPrompt,
} from "@/lib/brand-kit"
import { MEDIDA_PORTADA, PORTADAS_LINKEDIN } from "@/lib/brand-portadas"
import { DOMINIO, PAGINAS } from "@/lib/seo-kit"
import type { Acceso, Modulo } from "@/lib/permisos"

/**
 * EL MAPA DEL BACKOFFICE — lo que no cambia entre personas.
 *
 * Dónde queda cada cosa y qué se hace ahí, y el brand kit entero para quien
 * tiene Marketing. Se arma por módulo: a quien no tiene un módulo no le llega
 * ni el nombre de sus pantallas, que es la única forma de que el modelo no las
 * describa "por encima".
 *
 * El kit no se reescribe acá: sale de `armarPrompt`, el mismo texto que se
 * copia desde la página del Brand Kit. Si cambia un claim o un color, el
 * asistente se entera solo.
 */

const bloque = (id: string) => BLOQUES_CONTEXTO.find((b) => b.id === id)?.texto ?? ""

export const COMUN = `# El backoffice
Tiene tres módulos —Productos, Marketing y Administración— y cada persona ve los que tiene habilitados; el acceso lo asigna un administrador. La barra lateral agrupa las pantallas por módulo; en el teléfono se abre con el botón de menú de arriba a la izquierda.

# Ticketera — la ve todo el equipo
- \`/tickets\` Ticketera — el tablero de actividades, el primero de la barra lateral. Tres columnas: Backlog, En progreso y Hecho; las tarjetas se arrastran de una a otra y lo terminado se archiva para que Hecho no se llene. Arriba, los avatares del equipo filtran por persona y los chips filtran por proyecto. Cada ticket tiene título, descripción, quién lo pidió, a quién está asignado, un proyecto opcional e imágenes.
No pertenece a ningún módulo: la ve cualquiera que tenga alguno, porque su valor es que se vea en qué anda el resto sin preguntar. Con \`crear_ticket\` podés anotar ahí lo que la persona te pida —y sólo lo que te pida—; nace sin asignar, y el reparto se hace en esa pantalla.

# Datos públicos de Accedra
${bloque("identidad")}

${bloque("ficha")}`

export const PRODUCTOS = `# Módulo Productos
- \`/\` Inventario — el catálogo completo de Distecna, el mayorista: stock, precios e impuestos. Cada producto abre su ficha.
- \`/mis-productos\` Nuestros Productos — la selección de Accedra, con precio mínimo y semáforo de publicación.
- \`/orders\` Pedidos — los pedidos generados a Distecna desde Nuestros Productos, con su estado.`

const SECCIONES_KIT: [string, string][] = [
  ["prompts", "Prompts por disciplina, listos para pegar en cualquier modelo"],
  ["bloques", "Bloques de contexto de los que están hechos los prompts"],
  ["posicionamiento", "Posicionamiento y diferenciales"],
  ["boilerplate", "Boilerplate y bios en tres largos"],
  ["tono", "Tono de voz, decimos / no decimos, antes y después"],
  ["claims", "Claims y compliance"],
  ["logos", "Logos, con descarga en SVG y PNG"],
  ["paleta", "Paleta y colores por solución"],
  ["tipografia", "Tipografía"],
  ["fotografia", "Fotografía e iconos"],
  ["composicion", "Sistema de piezas y prompt base de imagen"],
  ["portadas-linkedin", "Portadas de LinkedIn para el perfil de cada persona"],
  ["personas", "Buyer personas"],
  ["servicios", "Catálogo de servicios"],
  ["prueba-social", "Prueba social: clientes y partners"],
  ["casos", "Casos de éxito"],
  ["canales", "Canales oficiales"],
  ["firma", "Generador del pie de firma de correo"],
  ["ficha", "Ficha de datos de la empresa"],
]

const MARKETING = `# Módulo Marketing
- \`/marketing\` Panel — el hub con una tarjeta por área.
- \`/marketing/informes\` Informes de campañas — un informe por mes de Google Ads, siempre con la misma estructura.
- \`/marketing/brand\` Brand Kit — cómo se ve, cómo habla y qué puede prometer Accedra.
- \`/marketing/mensajes\` Plantillas de mensajes — lo que el equipo escribe todos los días, escrito una vez y bien. Cualquiera crea y corrige.
- \`/marketing/brochures\` Brochures — el material institucional en PDF, en su versión vigente. Se abren y se descargan desde esa pantalla.
- \`/marketing/landings\` Landings y SEO — qué información tiene el sitio para buscadores y respuestas de IA, y cuánto puntúa.
- \`/marketing/popup\` Popup del sitio — el aviso sobre accedra.com.ar: se prende, se apaga y se programa desde ahí.
- \`/contenido/generacion\` Generación de contenido — lotes de piezas con imagen y copy; se revisan ahí y se programan después.
- \`/contenido/agenda\` Calendario de contenido — lo que ya está programado, listo para copiar y publicar.

## Secciones del Brand Kit
Cada una se abre directo con su enlace:
${SECCIONES_KIT.map(([id, nombre]) => `- [${nombre}](/marketing/brand#${id})`).join("\n")}

## Archivos de marca
Logos (enlace directo al SVG):
${LOGOS.map((l) => `- ${l.id}: [${l.nombre}](${l.archivo}) — fondo ${l.fondo}. ${l.uso}`).join("\n")}
El PNG de 1600 px con fondo transparente se baja desde la tarjeta del logo o desde [Logos](/marketing/brand#logos).

Portadas de LinkedIn para perfil personal, ${MEDIDA_PORTADA.ancho} × ${MEDIDA_PORTADA.alto} px, con el logotipo ya compuesto (no sirven para la página de empresa):
${PORTADAS_LINKEDIN.map((p) => `- [${p.nombre}](${p.archivo}) — ${p.cuando}`).join("\n")}

El pie de firma de correo se arma con el generador de [Pie de firma](/marketing/brand#firma): se completan los datos una vez y sale en dos modelos, listo para pegar en Gmail u Outlook.

## Tarjetas
Para mostrar un logo con sus botones de descarga escribí una línea sola: ::logo <id>. Para un color que se copia con un click: ::color <hex>. Una tarjeta por línea, sin nada más en esa línea, como máximo tres por respuesta, y sólo cuando la persona pide el logo o el color (no para decorar). Ids válidos: ${LOGOS.map((l) => l.id).join(", ")}. Hex válidos: ${[...PALETA, ...COLORES_SOLUCION].map((c) => c.hex).join(", ")}.

## Landings del sitio
Una por solución y por cruce solución × industria, en ${DOMINIO}:
${PAGINAS.map((p) => `- [${p.industria ? `${p.solucion} · ${p.industria}` : p.solucion}](${DOMINIO}${p.ruta})`).join("\n")}

## Una aclaración de negocio
Accedra no vende conectividad satelital ni Starlink como línea de servicio, aunque aparezca en el caso Finning y en textos del sitio: fue parte de una integración puntual. Si preguntan, aclaralo, y no lo propongas como servicio en una pieza.

# BRAND KIT DE ACCEDRA
Es la fuente de verdad de la marca. Todo lo que respondas de marca sale de acá.

${armarPrompt(PROMPTS[0])}`

export const ADMINISTRACION = `# Módulo Administración
Ordenado como el organigrama del contador:
1. \`/admin/maestros\` Datos maestros — el plan de cuentas del estudio contable y el Excel con el que se actualiza.
2. Proveedores
   - \`/admin/proveedores\` Proveedores — la ficha de cada proveedor, nacional o del exterior.
   - \`/admin/proveedores/cuenta-corriente\` Cuenta corriente — cada comprobante y cada pago del proveedor, con el saldo corrido.
   - \`/admin/compras\` Facturas de compras — el comprobante recibido, a mano o desde el PDF. El listado está en \`/admin/compras/listado\`.
   - \`/admin/pagos\` Pagos de facturas — qué comprobantes cancela el pago, con retenciones y medio de pago. Listado en \`/admin/pagos/listado\`.
   - \`/admin/movimientos\` Otros movimientos — todo movimiento de dinero que no pasa por una factura. Listado en \`/admin/movimientos/listado\`.
3. Clientes
   - \`/admin/clientes\` Clientes — la ficha de cada cliente; sólo la razón social es obligatoria.
   - \`/admin/clientes/cuenta-corriente\` Cuenta corriente — cada factura y cada cobro del cliente, con el saldo corrido.
   - \`/admin/ventas\` Facturas de ventas — el comprobante ya emitido, a mano o desde el PDF. Listado en \`/admin/ventas/listado\`.
   - \`/admin/cobros\` Cobros de facturas — qué facturas cancela el recibo, con retenciones y acreditación. Listado en \`/admin/cobros/listado\`.
4. \`/admin/cuentas\` Caja y bancos — saldos y movimientos de cada cuenta, con gastos, transferencias y conciliación.
5. \`/admin/contabilidad\` Contabilidad — los asientos que genera el sistema: diario, mayor y sumas y saldos, en pesos.
6. \`/admin/reportes\` Reportes — pendientes, saldos y estados de cuenta, en pesos y en dólares, exportables.

Los comprobantes en dólares llevan el tipo de cambio de su fecha; los totales se informan separados por moneda, nunca sumados.`

const POR_MODULO: Record<Modulo, string> = {
  productos: PRODUCTOS,
  marketing: MARKETING,
  administracion: ADMINISTRACION,
}

export function mapaPara(acceso: Acceso): string {
  const modulos = (Object.keys(POR_MODULO) as Modulo[]).filter(
    (m) => acceso.admin || acceso.modulos.includes(m)
  )
  return [COMUN, ...modulos.map((m) => POR_MODULO[m])].join("\n\n")
}
