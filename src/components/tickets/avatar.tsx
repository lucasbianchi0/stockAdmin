import { inicialesDe } from "@/lib/usuario"
import { colorDeUsuario } from "@/lib/tickets"
import { cn } from "@/lib/utils"

/**
 * Las iniciales de una persona, siempre del mismo color.
 *
 * El color sale del id y no de una columna en la base: así cada uno es del
 * mismo color en el tablero, en la tarjeta y en el diálogo, sin que nadie tenga
 * que elegirlo al dar de alta a alguien.
 *
 * Sin nombre es un círculo punteado: "sin asignar" tiene que verse como un
 * hueco, no como una persona más.
 */
export function Avatar({
  id,
  nombre,
  size = "md",
  className,
}: {
  id: string | null
  nombre: string | null
  size?: "xs" | "sm" | "md" | "lg"
  className?: string
}) {
  const medida = {
    xs: "h-5 w-5 text-[8.5px]",
    sm: "h-6 w-6 text-[9.5px]",
    md: "h-8 w-8 text-[11px]",
    lg: "h-10 w-10 text-[13px]",
  }[size]

  if (!nombre) {
    return (
      <span
        aria-hidden
        title="Sin asignar"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border border-dashed border-n-400 text-n-400",
          medida,
          className
        )}
      >
        ?
      </span>
    )
  }

  return (
    <span
      aria-hidden
      title={nombre}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border font-bold leading-none",
        colorDeUsuario(id).avatar,
        medida,
        className
      )}
    >
      {inicialesDe(nombre)}
    </span>
  )
}
