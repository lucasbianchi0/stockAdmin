"use client"

import { Badge, Dot } from "@/components/ui/badge"
import {
  estadoVencimiento,
  textoVencimiento,
  type EstadoVencimiento,
} from "@/lib/admin/comprobantes"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatearFecha, formatearFechaLarga } from "@/lib/admin/fecha"
import { cn } from "@/lib/utils"

/**
 * El semáforo de vencimientos.
 *
 * Lo que pidió administración es "que lo cercano a vencer se vea de alguna
 * manera". La forma elegida son tres señales redundantes y no una sola, porque
 * cada una funciona en un contexto distinto:
 *
 *  · **Color** — se ve de un vistazo desde lejos, escaneando la columna.
 *  · **La fecha** — es el dato, y el único que sirve para hablar con el cliente
 *    o buscar la factura en otro sistema.
 *  · **Fila teñida** (`claseFila`) — hace que lo vencido salte sin tener que
 *    mirar la columna correcta.
 *
 * El color solo sería inaccesible para quien no distingue rojo de verde, y la
 * fecha sola se pierde entre veinte filas iguales.
 *
 * LA COLUMNA DICE LA FECHA, NO "HACE 12 DÍAS"
 *
 * Antes se leía "Vencida hace 12 días" y la fecha no estaba en ningún lado.
 * Servía para priorizar y para nada más: al llamar al cliente hay que decirle
 * "la del 12 de agosto", no "la de hace doce días", y para conciliar contra el
 * sistema del otro también hace falta el día exacto. Restar a mano doce días de
 * hoy, en la cabeza, veinte veces por pantalla, es trabajo que no tiene por qué
 * existir.
 *
 * El "cuánto falta" no se perdió: se fue al tooltip, que es donde va lo que se
 * consulta de a una fila y no se escanea de a veinte.
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
  /** Para tablas apretadas: la misma fecha, sin el peso tipográfico del resto. */
  compacto?: boolean
  /** Ya está cobrado o pagado. Apaga el semáforo entero. */
  saldado?: boolean
}) {
  const estado = estadoVencimiento(fecha)

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

  const color =
    estado === "vencido" || estado === "hoy"
      ? "text-danger-text"
      : estado === "proximo"
        ? "text-warning-text"
        : "text-ink-secondary"

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="group/venc flex cursor-help items-center gap-2">
            <Dot tone={tono} />
            <span
              className={cn(
                "num text-[12px]",
                // El punteado aparece recién al pasar por encima. Fijo en
                // todas las filas armaba una textura de rayitas bajando por la
                // columna que competía con las fechas; apareciendo al hover
                // avisa lo mismo —hay algo más acá— justo cuando sirve.
                "border-b border-dashed border-transparent transition-colors",
                "group-hover/venc:border-ink-faint",
                destacado && !compacto ? "font-medium" : "",
                destacado && compacto ? "font-semibold" : "",
                color
              )}
            >
              {formatearFecha(fecha)}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          {/* La fecha larga además del "cuánto falta": el tooltip es el lugar
              donde hay espacio para decirla sin abreviar, y saca la duda de si
              "8/9/26" era agosto o septiembre. */}
          <span className="block font-medium text-white">{textoVencimiento(fecha)}</span>
          <span className="block text-n-300">{formatearFechaLarga(fecha)}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
