import type React from "react"
import type { LucideIcon } from "lucide-react"
import { AlertCircle, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/**
 * Vacío, carga y error tenían tres tratamientos distintos en cada tabla. Acá van
 * los tres con la misma métrica: el ícono en un contenedor redondo con anillo
 * suave — un ícono suelto al 20% de opacidad se lee como un bug de render, no
 * como un estado de diseño.
 */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-20 text-center",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted ring-1 ring-inset ring-line">
        <Icon className="h-5 w-5 text-ink-faint" strokeWidth={1.8} />
      </div>
      <div className="space-y-1">
        <p className="text-[13.5px] font-semibold text-ink">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-[12.5px] leading-relaxed text-ink-muted">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

export function LoadingState({
  label = "Cargando…",
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3 py-28", className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-6 w-6 animate-spin text-brand-500" strokeWidth={2.2} />
      <p className="text-[12.5px] font-medium text-ink-muted">{label}</p>
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-24 text-center",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft ring-1 ring-inset ring-danger-line">
        <AlertCircle className="h-5 w-5 text-danger-text" strokeWidth={1.9} />
      </div>
      <p className="max-w-sm text-[13px] font-medium text-ink">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          Reintentar
        </Button>
      )}
    </div>
  )
}

/** Bloque de esqueleto. `shimmer` en vez de `animate-pulse`: barre en lugar de
 *  parpadear, que a 10+ bloques en pantalla marea menos. */
export function Skeleton({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-gradient-to-r from-n-150 via-n-200 to-n-150 bg-[length:200%_100%]",
        className
      )}
      style={style}
    />
  )
}
