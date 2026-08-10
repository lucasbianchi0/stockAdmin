"use client"

import { Badge, Dot } from "@/components/ui/badge"
import {
  diasPara,
  estadoVencimiento,
  textoVencimiento,
  type EstadoVencimiento,
} from "@/lib/admin/comprobantes"
import { formatearFecha } from "@/lib/admin/fecha"
import { cn } from "@/lib/utils"

/**
 * El semáforo de vencimientos.
 *
 * Lo que pidió administración es "que lo cercano a vencer se vea de alguna
 * manera". La forma elegida son tres señales redundantes y no una sola, porque
 * cada una funciona en un contexto distinto:
 *
 *  · **Color** — se ve de un vistazo desde lejos, escaneando la columna.
 *  · **Texto** ("Vencida hace 12 días") — dice cuánto, que es lo que hace falta
 *    para priorizar. Un punto rojo no distingue un día de tres meses.
 *  · **Fila teñida** (`claseFila`) — hace que lo vencido salte sin tener que
 *    mirar la columna correcta.
 *
 * El color solo sería inaccesible para quien no distingue rojo de verde, y el
 * texto solo se pierde entre veinte filas iguales.
 */

const TONO: Record<EstadoVencimiento, "danger" | "warning" | "neutral" | "brand"> = {
  vencido: "danger",
  hoy: "danger",
  proximo: "warning",
  en_plazo: "neutral",
  lejano: "neutral",
  sin_fecha: "neutral",
}

export function SemaforoVencimiento({
  fecha,
  compacto = false,
  saldado = false,
}: {
  fecha: string | null
  /** Solo el punto y los días, para tablas apretadas. */
  compacto?: boolean
  /** Ya está cobrado o pagado. Apaga el semáforo entero. */
  saldado?: boolean
}) {
  const estado = estadoVencimiento(fecha)
  const dias = diasPara(fecha)

  if (estado === "sin_fecha") {
    return <span className="text-ink-faint">—</span>
  }

  // Un comprobante saldado no vence: la fecha queda como dato, sin color ni
  // "vencida hace 60 días". Decirle vencida a algo que ya se cobró manda a
  // reclamar plata que entró, que es el peor error que puede cometer esta
  // columna.
  if (saldado) {
    return <span className="num text-[12px] text-ink-faint">{formatearFecha(fecha)}</span>
  }

  const tono = TONO[estado]
  const destacado = estado === "vencido" || estado === "hoy" || estado === "proximo"

  if (compacto) {
    return (
      <span className="flex items-center gap-2">
        <Dot tone={tono} />
        <span
          className={cn(
            "num text-[12px]",
            estado === "vencido" || estado === "hoy"
              ? "font-semibold text-danger-text"
              : estado === "proximo"
                ? "font-medium text-warning-text"
                : "text-ink-secondary"
          )}
        >
          {dias !== null && dias < 0 ? `${Math.abs(dias)} d` : `${dias} d`}
        </span>
      </span>
    )
  }

  return (
    <span className="flex items-center gap-2">
      <Dot tone={tono} />
      <span
        className={cn(
          "text-[12px]",
          destacado ? "font-medium" : "",
          estado === "vencido" || estado === "hoy"
            ? "text-danger-text"
            : estado === "proximo"
              ? "text-warning-text"
              : "text-ink-secondary"
        )}
      >
        {textoVencimiento(fecha)}
      </span>
    </span>
  )
}

/** El fondo de la fila. Solo para lo vencido **e impago**: si se tiñe también lo
 *  que vence en una semana, la tabla entera queda de color y deja de señalar
 *  nada; y si se tiñe lo ya cobrado, señala lo que no hay que hacer. */
export function claseFilaVencimiento(fecha: string | null, saldado = false): string {
  if (saldado) return ""
  return estadoVencimiento(fecha) === "vencido" ? "bg-danger-soft/40" : ""
}

/** El resumen que va arriba de la tabla. */
export function BadgeVencidas({ cantidad }: { cantidad: number }) {
  if (cantidad === 0) return null
  return (
    <Badge tone="danger" size="sm">
      {cantidad} vencida{cantidad !== 1 ? "s" : ""}
    </Badge>
  )
}
