import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Un solo badge para toda la app. Antes cada tabla repetía la tripleta
 * `bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20` con matices
 * distintos, así que el mismo estado se veía diferente según la pantalla.
 *
 * `soft` es el default (relleno claro + línea + tinta oscura): legible sobre
 * blanco y sobre gris, y no compite con los botones. `solid` queda para lo que
 * tiene que interrumpir — un QA, un error.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border font-semibold leading-none whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-line bg-surface-muted text-ink-secondary",
        brand: "border-brand-200 bg-brand-50 text-brand-700",
        success: "border-success-line bg-success-soft text-success-text",
        warning: "border-warning-line bg-warning-soft text-warning-text",
        danger: "border-danger-line bg-danger-soft text-danger-text",
        solid: "border-transparent bg-ink text-n-25",
      },
      size: {
        sm: "px-1.5 py-[3px] text-[10px] tracking-[0.02em]",
        md: "px-2 py-1 text-[11px]",
        lg: "px-2.5 py-1.5 text-[13px]",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />
}

/**
 * Punto de color para semáforos. Va con un halo del mismo color al 22% para que
 * un círculo de 6px no se pierda contra el fondo de la fila.
 */
function Dot({
  tone,
  className,
}: {
  tone: "success" | "warning" | "danger" | "neutral" | "brand"
  className?: string
}) {
  const map = {
    success: "bg-success shadow-[0_0_0_3px_oklch(0.585_0.140_162/0.20)]",
    warning: "bg-warning shadow-[0_0_0_3px_oklch(0.740_0.155_70/0.22)]",
    danger: "bg-danger shadow-[0_0_0_3px_oklch(0.585_0.215_25/0.18)]",
    neutral: "bg-n-400 shadow-[0_0_0_3px_oklch(0.760_0.018_256/0.25)]",
    brand: "bg-brand-600 shadow-[0_0_0_3px_oklch(0.578_0.170_258/0.18)]",
  }
  return (
    <span
      aria-hidden
      className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", map[tone], className)}
    />
  )
}

export { Badge, badgeVariants, Dot }
