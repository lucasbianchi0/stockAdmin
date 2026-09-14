import { Sparkles } from "lucide-react"

import { agentePorId, esAgenteId } from "@/lib/chatbot/agentes"
import { cn } from "@/lib/utils"

/**
 * "Lo anotó un agente".
 *
 * Un ticket dictado por el asistente es una propuesta que todavía nadie revisó,
 * y se lee igual que uno que escribió una persona. La etiqueta es lo que evita
 * que dentro de dos semanas nadie sepa de dónde salió la mitad del Backlog.
 *
 * Dice qué agente fue y no sólo "IA": la diferencia entre una tarea que dictó
 * el auditor financiero y una del especialista de marketing es el criterio con
 * el que fue escrita, y eso cambia cuánto hay que revisarla.
 *
 * Si el id ya no existe —un agente que sacamos del código— queda el rótulo
 * genérico. Perder el nombre no puede borrar el aviso.
 */
export function EtiquetaAgente({
  origen,
  className,
}: {
  origen: string
  className?: string
}) {
  const agente = esAgenteId(origen) ? agentePorId(origen) : null

  return (
    <span
      title={
        agente
          ? `Lo anotó el agente ${agente.nombre} — revisalo antes de arrancar`
          : "Lo anotó un agente del asistente"
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-[3px] text-[10px] font-semibold text-violet-700",
        className
      )}
    >
      <Sparkles className="h-2.5 w-2.5" />
      {agente ? agente.nombre : "Agente"}
    </span>
  )
}
