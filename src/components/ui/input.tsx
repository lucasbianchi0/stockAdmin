import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * El input tiene fondo blanco explícito, no transparente: sobre el fondo gris de
 * la app un campo transparente desaparece, y sobre una card se confunde con
 * texto plano. El borde inferior apenas más oscuro (inset) imita el hueco de un
 * campo real.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-lg border border-line-strong bg-surface px-3 py-1 text-[13px] text-ink",
          "shadow-[inset_0_1px_2px_0_oklch(0.215_0.032_257/0.04)] transition-[border-color,box-shadow] duration-150",
          "placeholder:text-ink-faint",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "hover:border-n-400",
          "focus-visible:border-brand-400 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_oklch(0.578_0.170_258/0.14)]",
          "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60",
          "[&[type=search]]:[&::-webkit-search-cancel-button]:appearance-none",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
