import type React from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type Tone = "brand" | "success" | "danger" | "warning" | "neutral"

const TONES: Record<Tone, { rail: string; icon: string; value: string }> = {
  brand: { rail: "bg-brand-500", icon: "bg-brand-50 text-brand-600", value: "text-ink" },
  success: {
    rail: "bg-success",
    icon: "bg-success-soft text-success-text",
    value: "text-success-text",
  },
  danger: {
    rail: "bg-danger",
    icon: "bg-danger-soft text-danger-text",
    value: "text-danger-text",
  },
  warning: {
    rail: "bg-warning",
    icon: "bg-warning-soft text-warning-text",
    value: "text-warning-text",
  },
  neutral: { rail: "bg-n-400", icon: "bg-surface-muted text-ink-muted", value: "text-ink" },
}

/**
 * Tarjeta de métrica. El acento es un riel de 3px sobre el borde izquierdo, no
 * un `border-l-4` — el borde grueso empuja el contenido y desalinea las cifras
 * entre tarjetas de distinto color.
 *
 * `children` deja meter un control en lugar de una cifra (el margen editable de
 * Nuestros Productos) sin duplicar el contenedor.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  children,
  className,
}: {
  label: string
  value?: React.ReactNode
  hint?: React.ReactNode
  icon: LucideIcon
  tone?: Tone
  children?: React.ReactNode
  className?: string
}) {
  const t = TONES[tone]

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-line bg-surface p-5 shadow-e1",
        "transition-shadow duration-200 hover:shadow-e2",
        className
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", t.rail)} aria-hidden />

      <div className="flex items-start justify-between gap-4 pl-1.5">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{label}</p>

          {value !== undefined && (
            <p className={cn("num mt-2 text-[28px] font-bold leading-none", t.value)}>
              {value}
            </p>
          )}

          {children}

          {hint && <p className="mt-2 text-[11.5px] text-ink-muted">{hint}</p>}
        </div>

        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105",
            t.icon
          )}
        >
          <Icon className="h-[17px] w-[17px]" strokeWidth={1.9} />
        </div>
      </div>
    </div>
  )
}
