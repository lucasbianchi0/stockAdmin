import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Los botones sólidos llevan una línea de luz interior arriba (`--elevation-inset`
 * vía shadow-[inset...]) y una sombra corta abajo. Es lo que separa un botón de
 * producto de un rectángulo de color: sugiere una superficie física iluminada
 * desde arriba, igual que las cards.
 *
 * `active:translate-y-px` da la respuesta táctil. Sin eso, un click en un botón
 * sin ripple ni spinner se siente muerto.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-[background-color,box-shadow,color,border-color,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_oklch(1_0_0/0.16),var(--elevation-1)] hover:bg-brand-700 active:bg-brand-800",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[inset_0_1px_0_0_oklch(1_0_0/0.16),var(--elevation-1)] hover:brightness-95",
        outline:
          "border border-line-strong bg-surface text-ink-secondary shadow-e1 hover:border-line-strong hover:bg-surface-subtle hover:text-ink",
        secondary:
          "bg-surface-muted text-ink-secondary hover:bg-surface-sunken hover:text-ink",
        ghost:
          "text-ink-muted hover:bg-surface-muted hover:text-ink",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5 text-[13px] [&_svg]:size-4",
        sm: "h-8 px-3 text-xs [&_svg]:size-3.5",
        xs: "h-7 rounded-md px-2.5 text-[11px] [&_svg]:size-3",
        lg: "h-10 px-6 text-sm [&_svg]:size-4",
        icon: "h-9 w-9 [&_svg]:size-4",
        "icon-sm": "h-8 w-8 rounded-md [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
