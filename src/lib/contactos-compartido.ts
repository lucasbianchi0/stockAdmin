import type { EstadoCrm } from "@/lib/comercial/crm"

/**
 * Tipos de lo que comparten Contactos y el CRM (ver
 * `contactos-compartido-server.ts`).
 */

/** Alguien que se parece a la persona que se está cargando. */
export type Similar = {
  id: string
  nombre: string
  empresa: string
  cargo: string | null
  email: string | null
  /** mail: el mismo mail · persona: mismo nombre y empresa · nombre: mismo nombre, otra empresa */
  motivo: "mail" | "persona" | "nombre"
}

export type FichaEmpresa = {
  nombre: string
  vertical: string | null
  personas: {
    id: string
    nombre: string
    cargo: string | null
    departamento: string | null
    email: string | null
    telefono: string | null
    amId: string | null
    amNombre: string | null
    crm: {
      id: string
      ownerId: string
      ownerNombre: string
      estado: EstadoCrm
      proximaAccion: string | null
      fechaProxima: string | null
    }[]
  }[]
  /** El cliente del maestro con esa razón social, si ya lo es. */
  cliente: { id: string; razonSocial: string } | null
  presupuestos: { id: string; numero: number; referencia: string; estado: string; fecha: string }[]
}

export type PlantillaParaEnviar = {
  id: string
  titulo: string
  circunstancia: string
  canal: "email" | "whatsapp" | "linkedin"
  asunto: string | null
  cuerpo: string
  cuandoUsar: string | null
}

/**
 * Los valores que se completan solos en una plantilla, a partir de la persona
 * y de quien escribe. Las claves son las que usan las plantillas de Marketing
 * (`{{nombre}}`, `{{empresa}}`…), con sus variantes más probables.
 */
export function valoresDePersona(
  p: { nombre: string | null; apellido: string | null; empresa: string; cargo: string | null },
  yo: string | null
): Record<string, string> {
  const nombre = p.nombre ?? ""
  const completo = [p.nombre, p.apellido].filter(Boolean).join(" ")
  const mio = yo ?? ""
  return {
    nombre,
    apellido: p.apellido ?? "",
    "nombre completo": completo,
    nombre_completo: completo,
    empresa: p.empresa,
    "razón social": p.empresa,
    razon_social: p.empresa,
    cliente: p.empresa,
    cargo: p.cargo ?? "",
    "mi nombre": mio,
    mi_nombre: mio,
    yo: mio,
    remitente: mio,
    firma: mio,
    vendedor: mio,
    ejecutivo: mio,
    asesor: mio,
  }
}

/** El link que abre WhatsApp con el mensaje escrito. Argentina por defecto. */
export function linkWhatsapp(telefono: string, texto: string): string | null {
  let d = telefono.replace(/\D/g, "")
  if (!d) return null
  if (d.startsWith("00")) d = d.slice(2)
  else if (d.startsWith("0")) d = `54${d.slice(1)}`
  else if (!d.startsWith("54") && d.length <= 10) d = `54${d}`
  // Celulares argentinos: wa.me necesita el 9 después del 54.
  if (d.startsWith("54") && !d.startsWith("549") && d.length === 12) d = `549${d.slice(2)}`
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`
}

export function linkMail(email: string, asunto: string, cuerpo: string): string {
  const q = new URLSearchParams()
  if (asunto) q.set("subject", asunto)
  if (cuerpo) q.set("body", cuerpo)
  return `mailto:${email}?${q.toString().replace(/\+/g, "%20")}`
}
