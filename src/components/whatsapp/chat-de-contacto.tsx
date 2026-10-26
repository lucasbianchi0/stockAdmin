"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"

import { Bloque } from "@/components/admin/detalle-dialog"
import { ChatHilo } from "@/components/whatsapp/chat-hilo"
import { claveDe, pedirJson } from "@/lib/admin/query"
import { telefonoLegible, type ConversacionWhatsapp, type MensajeWhatsapp } from "@/lib/whatsapp"

/**
 * El chat de WhatsApp en la ficha del contacto. Si la persona nunca escribió,
 * no se dibuja nada: una sección vacía en cada ficha sería ruido.
 */
export function ChatDeContacto({ contactoId }: { contactoId: string }) {
  const url = `/api/contactos/${contactoId}/whatsapp`
  const q = useQuery({
    queryKey: claveDe("marketing", url),
    queryFn: ({ signal }) =>
      pedirJson<{ chats: { conversacion: ConversacionWhatsapp; mensajes: MensajeWhatsapp[] }[] }>(url, { signal }),
  })

  const fondo = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (fondo.current) fondo.current.scrollTop = fondo.current.scrollHeight
  }, [q.data])

  const chats = q.data?.chats ?? []
  if (chats.length === 0) return null

  return (
    <Bloque titulo="WhatsApp">
      <div className="space-y-3">
        {chats.map(({ conversacion, mensajes }) => (
          <div key={conversacion.id} className="overflow-hidden rounded-xl border border-line">
            <p className="flex items-center justify-between gap-2 border-b border-line bg-surface px-3 py-1.5 text-[11.5px] text-ink-muted">
              <span className="num">{telefonoLegible(conversacion.telefono)}</span>
              <span>
                {conversacion.mensajes} mensaje{conversacion.mensajes === 1 ? "" : "s"}
              </span>
            </p>
            <div ref={fondo} className="max-h-[320px] overflow-y-auto bg-surface-subtle px-3 py-2">
              <ChatHilo mensajes={mensajes} />
            </div>
          </div>
        ))}
        <Link href="/marketing/whatsapp" className="inline-block text-[12px] font-medium text-brand-700 hover:underline">
          Ver todos los chats
        </Link>
      </div>
    </Bloque>
  )
}
