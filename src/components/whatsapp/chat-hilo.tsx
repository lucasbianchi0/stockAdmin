"use client"

import { Fragment } from "react"
import { Smartphone } from "lucide-react"

import type { MensajeWhatsapp } from "@/lib/whatsapp"
import { cn } from "@/lib/utils"

/**
 * Un chat de WhatsApp como se ve en el celular: lo del cliente a la izquierda,
 * lo de Accedra a la derecha, con un separador por día. Lo usan la bandeja y la
 * ficha del contacto.
 *
 * Sólo lectura: se contesta desde el teléfono, como siempre.
 */

const ZONA = "America/Argentina/Buenos_Aires"

const dia = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { timeZone: ZONA, day: "numeric", month: "long", year: "numeric" })

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { timeZone: ZONA, hour: "2-digit", minute: "2-digit" })

const TIPO: Record<string, string> = {
  image: "Imagen",
  video: "Video",
  audio: "Audio",
  document: "Archivo",
  sticker: "Sticker",
  location: "Ubicación",
  contacts: "Contacto",
  reaction: "Reacción",
}

export function ChatHilo({ mensajes, className }: { mensajes: MensajeWhatsapp[]; className?: string }) {
  let diaAnterior = ""
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {mensajes.map((m) => {
        const d = dia(m.enviadoAt)
        const nuevoDia = d !== diaAnterior
        diaAnterior = d
        const nuestro = m.direccion === "saliente"
        const texto = m.texto ?? (TIPO[m.tipo] ? `[${TIPO[m.tipo]}]` : `[${m.tipo}]`)
        return (
          <Fragment key={m.id}>
            {nuevoDia && (
              <p className="my-2 self-center rounded-full bg-surface-muted px-2.5 py-0.5 text-[11px] font-medium text-ink-muted">
                {d}
              </p>
            )}
            <div
              className={cn(
                "max-w-[78%] rounded-2xl px-3 py-1.5 text-[13px] leading-snug shadow-e1",
                nuestro
                  ? "self-end rounded-br-md bg-brand-50 text-ink"
                  : "self-start rounded-bl-md border border-line bg-surface text-ink"
              )}
            >
              <p className="whitespace-pre-wrap break-words">{texto}</p>
              <p className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] text-ink-faint">
                {nuestro && m.origen === "business_app" && (
                  <Smartphone className="h-2.5 w-2.5" aria-label="Contestado desde el celular" />
                )}
                <span className="num">{hora(m.enviadoAt)}</span>
              </p>
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}
