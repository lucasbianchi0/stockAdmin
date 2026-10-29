import Image from "next/image"

import type { EstadoEntrada, FichaAgente } from "@/lib/agentes"
import { cn } from "@/lib/utils"

const ZONA = "America/Argentina/Buenos_Aires"

/** "hace 2 h", "en 3 días". */
export function relativo(iso: string | Date, ahora = new Date()): string {
  const ms = new Date(iso).getTime() - ahora.getTime()
  const rtf = new Intl.RelativeTimeFormat("es-AR", { numeric: "auto" })
  const min = Math.round(ms / 60_000)
  if (Math.abs(min) < 60) return rtf.format(min, "minute")
  const h = Math.round(ms / 3_600_000)
  if (Math.abs(h) < 24) return rtf.format(h, "hour")
  return rtf.format(Math.round(ms / 86_400_000), "day")
}

/** "dom 26 oct, 10:00". */
export function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: ZONA,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** "26 oct". */
export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { timeZone: ZONA, day: "numeric", month: "short" })
}

/**
 * La cara del agente. La ilustración ya trae su fondo de color: el marco sólo
 * la redondea y le da un borde de luz.
 */
export function AvatarAgente({
  ficha,
  tamano,
  className,
  prioridad,
}: {
  ficha: FichaAgente
  tamano: number
  className?: string
  prioridad?: boolean
}) {
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden ring-1 ring-black/5", ficha.tema.fondo, className)}
      style={{ width: tamano, height: tamano }}
    >
      <Image
        src={ficha.avatar}
        alt={`${ficha.apodo}, ${ficha.nombre.toLowerCase()}`}
        width={tamano * 2}
        height={tamano * 2}
        priority={prioridad}
        className="h-full w-full object-cover"
      />
    </div>
  )
}

const ESTADO: Record<Exclude<EstadoEntrada, null>, { rotulo: string; punto: string; latido: boolean }> = {
  activo: { rotulo: "Trabajando", punto: "bg-emerald-500", latido: true },
  planificado: { rotulo: "Todavía no corrió", punto: "bg-amber-400", latido: false },
  pausado: { rotulo: "En pausa", punto: "bg-ink-faint", latido: false },
}

/** El estado de su entrada en el Calendario, como una píldora con un punto vivo. */
export function PildoraEstado({ estado, className }: { estado: EstadoEntrada; className?: string }) {
  const e = ESTADO[estado ?? "planificado"]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-ink-secondary shadow-sm ring-1 ring-black/5 backdrop-blur",
        className
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {e.latido && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", e.punto)} />}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", e.punto)} />
      </span>
      {e.rotulo}
    </span>
  )
}
