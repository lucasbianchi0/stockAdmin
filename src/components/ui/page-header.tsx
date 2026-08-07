import type React from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: string
  /** Enlace de vuelta al nivel superior, arriba del título. */
  back?: { href: string; label: string }
  /** Acciones alineadas a la derecha (botones, filtros). */
  actions?: React.ReactNode
  className?: string
}

/**
 * Cabecera única de página. Antes cada `page.tsx` repetía el mismo bloque sticky
 * con variantes mínimas de padding y tamaño, y ninguna coincidía del todo con
 * las otras — que es exactamente lo que hace que un producto se vea armado a
 * pedazos.
 *
 * El truco visual es la máscara: el fondo semitransparente con blur necesita un
 * borde inferior de un solo píxel para separarse del contenido; más que eso y
 * la página se parte en dos.
 */
export function PageHeader({
  title,
  description,
  back,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 border-b border-line bg-background/80 px-5 py-4 backdrop-blur-xl sm:px-8 sm:py-5",
        className
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {back && (
            <Link
              href={back.href}
              className="group mb-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-muted transition-colors hover:text-ink"
            >
              <ArrowLeft className="h-3 w-3 transition-transform duration-200 group-hover:-translate-x-0.5" />
              {back.label}
            </Link>
          )}
          <h1 className="truncate text-[19px] font-semibold tracking-[-0.025em] text-ink">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
              {description}
            </p>
          )}
        </div>

        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

/** Contenedor del cuerpo de página, para que todas compartan el mismo aire. */
export function PageBody({
  children,
  className,
  width = "wide",
}: {
  children: React.ReactNode
  className?: string
  width?: "wide" | "narrow" | "full"
}) {
  return (
    <div
      className={cn(
        "px-5 py-6 sm:px-8",
        width === "wide" && "mx-auto w-full max-w-[1600px]",
        width === "narrow" && "w-full max-w-4xl",
        className
      )}
    >
      {children}
    </div>
  )
}
