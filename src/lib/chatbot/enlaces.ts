import { EMPRESA } from "@/lib/brand-kit"
import { puede, type Acceso } from "@/lib/permisos"

/**
 * Qué enlaces escritos por el modelo se dibujan como enlace.
 *
 * Un enlace que escribe un modelo es un enlace que nadie revisó. Se aceptan
 * tres clases y nada más:
 *
 *  · Pantallas del backoffice que ESTA persona puede abrir. Se chequea con el
 *    mismo `puede()` del middleware: un enlace a una pantalla prohibida
 *    terminaría en una redirección, y además le cuenta que la pantalla existe.
 *  · Los archivos de marca de `/brand/` (logos y portadas), que son públicos.
 *  · Los sitios oficiales de Accedra, con comparación por prefijo con barra
 *    —`accedra.com.ar.otro-dominio.com` no pasa—.
 *
 * Lo que no matchea se muestra como texto. Nunca `/api`: los endpoints no son
 * pantallas, y abrir uno en una pestaña muestra JSON crudo.
 */

export type Destino = { tipo: "interno" | "archivo" | "externo"; href: string }

const EXTERNOS = [
  "https://www.accedra.com.ar",
  "https://accedra.com.ar",
  EMPRESA.linkedin,
  EMPRESA.instagram,
  `https://wa.me/${EMPRESA.whatsappE164}`,
  "https://www.facebook.com/Accedra",
]

const ARCHIVO_MARCA = /^\/brand\/[\w.-]+\.(svg|png|jpe?g)$/i

export function destinoPermitido(href: string, acceso: Acceso): Destino | null {
  const limpio = href.trim()

  if (limpio.startsWith("/") && !limpio.startsWith("//")) {
    const ruta = limpio.split(/[?#]/)[0] || "/"
    if (ARCHIVO_MARCA.test(ruta)) return { tipo: "archivo", href: limpio }
    // Los PDF de informes sí pasan por permisos: son de Marketing.
    if (/^\/informes\/[\w.-]+\.pdf$/i.test(ruta)) {
      return puede(acceso, ruta) ? { tipo: "archivo", href: limpio } : null
    }
    if (ruta === "/api" || ruta.startsWith("/api/")) return null
    if (ruta === "/login" || ruta === "/sin-acceso") return null
    return puede(acceso, ruta) ? { tipo: "interno", href: limpio } : null
  }

  const externo = EXTERNOS.some((base) => {
    const sinBarra = base.replace(/\/+$/, "")
    return limpio === sinBarra || limpio.startsWith(`${sinBarra}/`)
  })
  return externo ? { tipo: "externo", href: limpio } : null
}
