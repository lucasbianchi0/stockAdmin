import { Linkedin, Mail, MessageCircle, MessageSquare, Phone } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { Canal } from "@/lib/marketing/mensajes"
import { cn } from "@/lib/utils"

/**
 * El glifo de cada canal, en un archivo propio porque lo comparten la lista, la
 * ficha y el formulario. Con el mapa duplicado, un canal nuevo aparecería con
 * ícono en dos de los tres lugares y nadie lo notaría hasta verlo.
 *
 * Todos de lucide y ninguno de marca: los logos de WhatsApp y LinkedIn traen su
 * verde y su azul, y dos colores ajenos en una lista de veinte filas la
 * convierten en un semáforo. Acá el color lo pone el estado, no la empresa.
 */
export const ICONO_CANAL: Record<Canal, LucideIcon> = {
  whatsapp: MessageCircle,
  email: Mail,
  linkedin: Linkedin,
  llamada: Phone,
  otro: MessageSquare,
}

export function CanalIcono({
  canal,
  className,
}: {
  canal: Canal
  className?: string
}) {
  const Icon = ICONO_CANAL[canal]
  return <Icon className={cn("h-[15px] w-[15px]", className)} strokeWidth={1.9} />
}
