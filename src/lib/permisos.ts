import type { User } from "@supabase/supabase-js"

/**
 * PERMISOS POR MÓDULO — fuente única de verdad de quién ve qué.
 *
 * Tres decisiones que sostienen todo lo demás:
 *
 * 1. El permiso vive en `app_metadata` del usuario, no en una tabla. El propio
 *    usuario no puede tocarlo (a diferencia de `user_metadata`, que se edita
 *    desde el cliente) y viaja dentro del JWT, así que el middleware lo lee sin
 *    una consulta a la base en cada navegación.
 *
 * 2. Todo cierra por defecto. Una ruta que nadie declaró acá queda prohibida
 *    para todos menos para los administradores. Al revés —abierto salvo que se
 *    prohíba— cada ruta nueva es un agujero que nadie nota hasta que alguien lo
 *    encuentra.
 *
 * 3. Esconder ítems en la sidebar NO es seguridad; es comodidad. La barrera
 *    real son el middleware y el chequeo dentro de cada handler de API.
 */

/* El orden es el de la sidebar: Comercial va entre Marketing y Administración,
   que es el recorrido de una venta —se promociona, se presupuesta, se factura. */
export const MODULOS = ["productos", "marketing", "comercial", "administracion"] as const
export type Modulo = (typeof MODULOS)[number]

export const NOMBRE_MODULO: Record<Modulo, string> = {
  productos: "Productos",
  marketing: "Marketing",
  comercial: "Comercial",
  administracion: "Administración",
}

/** Adónde va cada módulo cuando es lo único que tiene un usuario. */
export const HOME_DE_MODULO: Record<Modulo, string> = {
  productos: "/",
  marketing: "/marketing/informes",
  comercial: "/comercial/presupuestos",
  administracion: "/admin/clientes",
}

/** Rutas sin sesión. Cualquier otra cosa exige usuario. */
const PUBLICAS = ["/login", "/sin-acceso"]

/**
 * Prefijo de ruta → módulos que la habilitan. El orden importa: gana la primera
 * coincidencia, así que lo específico va antes que lo general. La raíz se compara
 * aparte porque como prefijo coincidiría con todo.
 *
 * Casi todas las rutas pertenecen a un módulo y punto. La lista es de módulos —y
 * no un valor suelto— por las pocas que son genuinamente compartidas: la
 * cotización del dólar la necesitan tanto el que arma precios como el que carga
 * una factura, y duplicar el endpoint para duplicar el permiso garantizaría que
 * algún día los dos devuelvan cotizaciones distintas.
 */
const RUTAS: { prefijo: string; modulos: Modulo[] }[] = [
  // Marketing
  { prefijo: "/marketing", modulos: ["marketing"] },
  // Los PDF de informes de campañas, que la página de Informes enlaza. Sin esta
  // línea sólo los podía abrir un administrador: el middleware no excluye .pdf.
  { prefijo: "/informes", modulos: ["marketing"] },
  { prefijo: "/contenido", modulos: ["marketing"] },
  { prefijo: "/api/marketing", modulos: ["marketing"] },
  { prefijo: "/api/contenido", modulos: ["marketing"] },

  // Productos
  { prefijo: "/product", modulos: ["productos"] },
  { prefijo: "/mis-productos", modulos: ["productos"] },
  { prefijo: "/orders", modulos: ["productos"] },
  { prefijo: "/api/products", modulos: ["productos"] },
  { prefijo: "/api/my-products", modulos: ["productos"] },
  { prefijo: "/api/orders", modulos: ["productos"] },
  { prefijo: "/api/distecna", modulos: ["productos"] },

  // Comercial
  { prefijo: "/comercial", modulos: ["comercial"] },
  { prefijo: "/api/comercial", modulos: ["comercial"] },

  /*
   * Clientes es UNA base para los dos módulos.
   *
   * Comercial presupuesta y Administración factura sobre la misma ficha, así
   * que el maestro de clientes —y lo que su formulario necesita, categorías y
   * vendedores— se habilita para los dos. Van antes que `/api/admin`, que como
   * prefijo se las comería, porque gana la primera coincidencia.
   *
   * La alternativa era un `/api/comercial/clientes` que devolviera lo mismo, y
   * eso es exactamente lo que el pedido dice que NO quiere: dos caminos a la
   * misma ficha son dos caminos que algún día se contestan distinto.
   */
  { prefijo: "/api/admin/clientes", modulos: ["comercial", "administracion"] },
  { prefijo: "/api/admin/categorias", modulos: ["comercial", "administracion"] },
  { prefijo: "/api/admin/vendedores", modulos: ["comercial", "administracion"] },

  // Administración
  { prefijo: "/admin", modulos: ["administracion"] },
  { prefijo: "/api/admin", modulos: ["administracion"] },
  { prefijo: "/api/settings", modulos: ["administracion"] },

  // Compartidas
  // La ticketera es del equipo entero, no de un área: alcanza con tener algún
  // módulo. Quien no tiene ninguno no entra a la app y tampoco acá.
  { prefijo: "/tickets", modulos: [...MODULOS] },
  { prefijo: "/api/tickets", modulos: [...MODULOS] },
  // El dólar lo necesitan el que arma precios, el que presupuesta y el que
  // carga una factura. Un endpoint por módulo garantizaría que algún día tres
  // pantallas muestren tres cotizaciones distintas.
  { prefijo: "/api/dolar", modulos: ["productos", "comercial", "administracion"] },
  // El asistente es de todos los que tienen algún módulo. Lo que ve cada uno lo
  // recorta la propia ruta según el acceso de la sesión.
  { prefijo: "/api/chat", modulos: [...MODULOS] },
]

export function esPublica(pathname: string): boolean {
  return PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Qué módulos habilitan una ruta. `null` = no está declarada, y entonces solo
 * pasa un administrador: una ruta nueva nace cerrada, no abierta.
 */
export function modulosDeRuta(pathname: string): Modulo[] | null {
  if (pathname === "/") return ["productos"]
  const hit = RUTAS.find(
    (r) => pathname === r.prefijo || pathname.startsWith(`${r.prefijo}/`)
  )
  return hit?.modulos ?? null
}

/**
 * El acceso de un usuario. `admin` no es "tiene los tres módulos": es una
 * categoría aparte, y la diferencia importa en dos casos concretos.
 *
 *  · Un módulo nuevo. Si el acceso total fuera la lista completa de módulos, el
 *    día que agreguemos el cuarto habría que reeditar el metadata de cada
 *    administrador — y hasta que alguien se acuerde, quedan sin verlo.
 *  · Una ruta sin declarar. Nace cerrada para todos; el admin es el único que
 *    puede entrar, que es justamente quien tiene que poder diagnosticarla.
 */
export type Acceso = { admin: boolean; modulos: Modulo[] }

export const SIN_ACCESO: Acceso = { admin: false, modulos: [] }

/**
 * Acceso leído del JWT.
 *
 * Sin `app_metadata` el usuario no tiene nada. Si esto devolviera acceso total
 * por omisión, cualquier usuario nuevo nacería como administrador y el sistema
 * entero sería decorativo. El precio es que hay que sembrar el metadata de los
 * usuarios existentes ANTES de desplegar — ver docs/PERMISOS.md.
 */
export function accesoDeUsuario(user: User | null): Acceso {
  if (!user) return SIN_ACCESO
  const meta = (user.app_metadata ?? {}) as Record<string, unknown>

  if (meta.admin === true) return { admin: true, modulos: [...MODULOS] }

  const crudo = Array.isArray(meta.modulos) ? meta.modulos : []
  return {
    admin: false,
    modulos: crudo.filter((m): m is Modulo => MODULOS.includes(m as Modulo)),
  }
}

export function puede(acceso: Acceso, pathname: string): boolean {
  if (acceso.admin) return true
  const requeridos = modulosDeRuta(pathname)
  if (requeridos === null) return false
  // Basta con uno: los módulos de una ruta compartida son alternativas, no
  // requisitos acumulativos.
  return requeridos.some((m) => acceso.modulos.includes(m))
}

/** Adónde mandar a alguien que entró donde no debía. */
export function homeDe(acceso: Acceso): string {
  const primero = MODULOS.find((m) => acceso.modulos.includes(m))
  return primero ? HOME_DE_MODULO[primero] : "/sin-acceso"
}
