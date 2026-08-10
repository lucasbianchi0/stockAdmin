"use client"

import { useEffect } from "react"
import { Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * El panel de detalle: qué hay adentro de una fila.
 *
 * Es un panel lateral y no un diálogo centrado por lo que se hace acá adentro:
 * mirar un dato de una fila y seguir trabajando sobre la tabla. Un modal al
 * medio tapa la lista y obliga a cerrarlo para ubicarse; el panel deja la fila a
 * la vista, así que abrir tres fichas seguidas no desorienta.
 *
 * La regla de qué va acá y qué va en el formulario de edición: **este panel se
 * lee, el otro se escribe**. Todo lo que no sirve para decidir algo y solo hace
 * falta al cargar la ficha —los campos vacíos, los códigos internos— no se
 * dibuja; para eso está el botón de editar del pie.
 */
export function DetalleDialog({
  abierto,
  onCerrar,
  titulo,
  subtitulo,
  badges,
  acciones,
  cargando = false,
  error = null,
  children,
}: {
  abierto: boolean
  onCerrar: () => void
  titulo: React.ReactNode
  subtitulo?: React.ReactNode
  badges?: React.ReactNode
  /** El pie. Va fijo abajo: con el panel scrolleado, un botón que quedó arriba
   *  de todo es un botón que no existe. */
  acciones?: React.ReactNode
  cargando?: boolean
  error?: string | null
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar])

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-[55] flex justify-end" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-navy-950/45 backdrop-blur-[2px] animate-in fade-in-0 duration-200"
        onClick={onCerrar}
      />

      <aside className="relative flex h-full w-full flex-col border-l border-line bg-surface shadow-e4 animate-in slide-in-from-right-6 fade-in-0 duration-200 sm:max-w-[560px]">
        <header className="flex items-start gap-3 border-b border-line bg-surface-subtle px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[15.5px] font-semibold tracking-[-0.015em] text-ink">
                {titulo}
              </h2>
              {badges}
            </div>
            {subtitulo && (
              <p className="mt-0.5 text-[12.5px] text-ink-muted">{subtitulo}</p>
            )}
          </div>

          <Button variant="ghost" size="icon-sm" onClick={onCerrar} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {cargando ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[12.5px] text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : error ? (
            <p className="rounded-lg border border-danger-line bg-danger-soft px-3.5 py-3 text-[12.5px] text-danger-text">
              {error}
            </p>
          ) : (
            <div className="space-y-6">{children}</div>
          )}
        </div>

        {acciones && (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5">
            {acciones}
          </footer>
        )}
      </aside>
    </div>
  )
}

/* ── Piezas de adentro ────────────────────────────────────────────────────── */

/** Un grupo de datos con su rótulo. */
export function Bloque({
  titulo,
  accion,
  children,
}: {
  titulo: string
  accion?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="eyebrow">{titulo}</h3>
        {accion}
      </div>
      {children}
    </section>
  )
}

/**
 * Un dato con su etiqueta, en dos columnas.
 *
 * Los vacíos no se dibujan: una ficha con ocho renglones que dicen "—" hace que
 * los tres que tienen contenido se pierdan entre el ruido. Si hace falta ver que
 * un campo está sin cargar, se ve en el formulario de edición.
 */
export function Dato({
  rotulo,
  valor,
  children,
  mostrarVacio = false,
  className,
}: {
  rotulo: string
  valor?: string | number | null
  children?: React.ReactNode
  mostrarVacio?: boolean
  className?: string
}) {
  const vacio =
    children === undefined && (valor === null || valor === undefined || valor === "")
  if (vacio && !mostrarVacio) return null

  return (
    <div className="grid grid-cols-[116px_1fr] gap-3 py-[5px]">
      <dt className="text-[12px] text-ink-muted">{rotulo}</dt>
      <dd className={cn("min-w-0 text-[12.5px] text-ink-secondary", className)}>
        {children ?? (vacio ? <span className="text-ink-faint">—</span> : valor)}
      </dd>
    </div>
  )
}

export function ListaDatos({ children }: { children: React.ReactNode }) {
  return <dl className="divide-y divide-line-soft">{children}</dl>
}

/** La tarjeta de un número que importa: saldo, total, vencido. */
export function Cifra({
  rotulo,
  valor,
  tono = "neutral",
  pie,
}: {
  rotulo: string
  valor: string
  tono?: "neutral" | "danger" | "success"
  pie?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-subtle px-3.5 py-2.5">
      <p className="eyebrow truncate">{rotulo}</p>
      <p
        className={cn(
          "num mt-1 text-[15.5px] font-bold tracking-[-0.02em]",
          tono === "danger"
            ? "text-danger-text"
            : tono === "success"
              ? "text-success-text"
              : "text-ink"
        )}
      >
        {valor}
      </p>
      {pie && <p className="mt-0.5 text-[11px] text-ink-muted">{pie}</p>}
    </div>
  )
}

/** El renglón de una lista de cosas relacionadas: un comprobante, un recibo. */
export function Renglon({
  izquierda,
  derecha,
  onClick,
}: {
  izquierda: React.ReactNode
  derecha: React.ReactNode
  onClick?: () => void
}) {
  const contenido = (
    <>
      <div className="min-w-0 flex-1">{izquierda}</div>
      <div className="shrink-0 text-right">{derecha}</div>
    </>
  )

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-muted"
      >
        {contenido}
      </button>
    )
  }

  return <div className="flex w-full items-center gap-3 px-3 py-2">{contenido}</div>
}

export function Lista({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-line-soft overflow-hidden rounded-lg border border-line">
      {children}
    </div>
  )
}

export function Vacio({ texto }: { texto: string }) {
  return <p className="px-3 py-3 text-[12px] text-ink-faint">{texto}</p>
}
