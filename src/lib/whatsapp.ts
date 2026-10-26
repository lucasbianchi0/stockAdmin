/**
 * Los chats de WhatsApp, del lado que comparten el servidor y la pantalla.
 *
 * La copia vive en `whatsapp_conversaciones` y `whatsapp_mensajes` (ver la
 * migración 20261025_01). La llenan el webhook de Kapso y la importación del
 * historial: `whatsapp-server.ts`.
 */

export type Direccion = "entrante" | "saliente"

export type ConversacionWhatsapp = {
  id: string
  telefono: string
  nombrePerfil: string | null
  contacto: { id: string; nombre: string; empresa: string } | null
  ultimoMensajeAt: string | null
  ultimoTexto: string | null
  ultimaDireccion: Direccion | null
  mensajes: number
}

export type MensajeWhatsapp = {
  id: string
  direccion: Direccion
  origen: string | null
  tipo: string
  texto: string | null
  enviadoAt: string
}

/** `5491133001233` → `+54 9 11 3300-1233`. Lo que no reconoce lo deja con `+`. */
export function telefonoLegible(t: string): string {
  const d = t.replace(/\D/g, "")
  const ar = d.match(/^549(11)(\d{4})(\d{4})$/)
  if (ar) return `+54 9 ${ar[1]} ${ar[2]}-${ar[3]}`
  const arInterior = d.match(/^549(\d{3,4})(\d{2,3})(\d{4})$/)
  if (arInterior) return `+54 9 ${arInterior[1]} ${arInterior[2]}-${arInterior[3]}`
  return `+${d}`
}

/**
 * Lo que identifica a un teléfono para cruzarlo con un contacto: los últimos
 * diez dígitos. WhatsApp manda `5491133001233` y en la ficha puede estar
 * `+54 11 3300-1233` o `11 3300 1233`; los diez últimos coinciden en todos.
 */
export function claveTelefono(t: string | null | undefined): string | null {
  const d = (t ?? "").replace(/\D/g, "")
  return d.length >= 8 ? d.slice(-10) : null
}
