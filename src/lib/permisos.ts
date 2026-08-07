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

export const MODULOS = ["productos", "marketing", "administracion"] as const
export type Modulo = (typeof MODULOS)[number]

export const NOMBRE_MODULO: Record<Modulo, string> = {
  productos: "Productos",
  marketing: "Marketing",
  administracion: "Administración",
}

/** Adónde va cada módulo cuando es lo único que tiene un usuario. */
export const HOME_DE_MODULO: Record<Modulo, string> = {
  productos: "/",
  marketing: "/marketing",
  administracion: "/settings",
}

/** Rutas sin sesión. Cualquier otra cosa exige usuario. */
const PUBLICAS = ["/login", "/sin-acceso"]

/**
 * Prefijo de ruta → módulo. El orden importa: gana la primera coincidencia, así
 * que lo específico va antes que lo general. La raíz se compara aparte porque
 * como prefijo coincidiría con todo.
 */
const RUTAS: { prefijo: string; modulo: Modulo }[] = [
  // Marketing
  { prefijo: "/marketing", modulo: "marketing" },
  { prefijo: "/contenido", modulo: "marketing" },
  { prefijo: "/api/contenido", modulo: "marketing" },

  // Productos
  { prefijo: "/product", modulo: "productos" },
  { prefijo: "/mis-productos", modulo: "productos" },
  { prefijo: "/orders", modulo: "productos" },
  { prefijo: "/api/products", modulo: "productos" },
  { prefijo: "/api/my-products", modulo: "productos" },
  { prefijo: "/api/orders", modulo: "productos" },
  { prefijo: "/api/distecna", modulo: "productos" },
  { prefijo: "/api/dolar", modulo: "productos" },

  // Administración
  { prefijo: "/settings", modulo: "administracion" },
  { prefijo: "/api/settings", modulo: "administracion" },
  { prefijo: "/customers", modulo: "administracion" },
  { prefijo: "/reports", modulo: "administracion" },
]

export function esPublica(pathname: string): boolean {
  return PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Qué módulo exige una ruta. `null` = no está declarada, y entonces solo pasa un
 * administrador: una ruta nueva nace cerrada, no abierta.
 */
export function moduloDeRuta(pathname: string): Modulo | null {
  if (pathname === "/") return "productos"
  const hit = RUTAS.find(
    (r) => pathname === r.prefijo || pathname.startsWith(`${r.prefijo}/`)
  )
  return hit?.modulo ?? null
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
  const requerido = moduloDeRuta(pathname)
  if (requerido === null) return false
  return acceso.modulos.includes(requerido)
}

/** Adónde mandar a alguien que entró donde no debía. */
export function homeDe(acceso: Acceso): string {
  const primero = MODULOS.find((m) => acceso.modulos.includes(m))
  return primero ? HOME_DE_MODULO[primero] : "/sin-acceso"
}
