"use client"

import * as React from "react"
import { Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import { agentePorId, type AgenteId, type Atajo } from "@/lib/chatbot/agentes"
import type { Pantalla } from "@/lib/chatbot/pantalla"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useChatbotOpcional } from "./provider"

/**
 * "Preguntar" — el atajo de una pantalla al chat.
 *
 * Va al lado de lo que se presta a una pregunta: un diagnóstico, un embudo, un
 * saldo vencido, un informe. Al pasar el cursor, un cartel dice a quién se le
 * pregunta; al tocarlo, se abre el chat con ese agente y la pregunta sale sola
 * con el resumen de lo que hay en pantalla. Lo que se mandó queda a la vista en
 * el chip de la burbuja.
 *
 * `pantalla` puede ser una función: se arma al tocar, con los datos de ese
 * momento —el filtro elegido, el período— y no en cada render.
 *
 * Sin el chat montado (una página de impresión, alguien sin módulos) no
 * dibuja nada.
 */
export function Preguntar({
  agente = "asistente",
  pantalla,
  pregunta = "¿Qué está pasando acá? Explicámelo y decime qué harías.",
  seguimientos,
  etiqueta = "Preguntar",
  ayuda,
  compacto,
  className,
}: {
  agente?: AgenteId
  pantalla: Pantalla | (() => Pantalla)
  pregunta?: string
  /** Las repreguntas que quedan a mano en el chat después de la respuesta. */
  seguimientos?: Atajo[]
  etiqueta?: string
  /** La segunda línea del cartel: qué va a recibir el asistente. */
  ayuda?: string
  /** Sólo el ícono, para una fila de tabla o el rincón de una tarjeta. */
  compacto?: boolean
  className?: string
}) {
  const chat = useChatbotOpcional()
  if (!chat) return null

  // Si no tiene el especialista de esta pantalla, contesta el asistente general.
  const destino = chat.agentes.some((a) => a.id === agente) ? agentePorId(agente) : agentePorId("asistente")

  const onClick = (e: React.MouseEvent) => {
    // Dentro de una fila o una tarjeta clickeable, el click no abre además el detalle.
    e.stopPropagation()
    chat.preguntar({
      agente: destino.id,
      pantalla: typeof pantalla === "function" ? pantalla() : pantalla,
      pregunta,
      seguimientos,
    })
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            aria-label={`Preguntarle a ${destino.nombre} sobre esto`}
            className={cn(
              "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 font-medium text-brand-700",
              "transition-[background-color,border-color,transform] duration-150 hover:border-brand-300 hover:bg-brand-100 active:scale-95",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
              compacto ? "h-7 w-7" : "h-7 px-2.5 text-[11.5px]",
              className
            )}
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
            {!compacto && etiqueta}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-left">
          <p className="flex items-center gap-1.5 font-semibold text-white">
            <span aria-hidden>{destino.id === "asistente" ? "🧭" : destino.emoji}</span>
            Preguntale a {destino.nombre}
          </p>
          <p className="mt-0.5 text-white/60">
            {ayuda ?? "Abre el chat con lo que estás viendo y te explica qué pasa."}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
