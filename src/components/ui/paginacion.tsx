"use client"

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * El pie de paginación de las tablas de administración.
 *
 * Extraído del pie que la tabla de productos tenía escrito a mano: son nueve
 * pantallas las que lo van a usar, y nueve copias con variantes mínimas es
 * exactamente lo que hace que un producto se sienta armado a pedazos.
 *
 * Dos diferencias con el de productos, que vienen de paginar en el servidor:
 *
 *  · Se dibuja aunque haya una sola página. Con paginación del servidor el
 *    rótulo "1–25 de 340" es la única forma de saber cuántos registros hay en
 *    total, y esconderlo cuando entran en una página deja al usuario sin ese dato.
 *  · Los botones se deshabilitan también mientras carga: en el cliente el salto
 *    de página es instantáneo, acá es un fetch, y sin esto tres clicks rápidos
 *    disparan tres pedidos de los que gana cualquiera.
 */

const VENTANA = 5

export function Paginacion({
  pagina,
  totalPaginas,
  total,
  porPagina,
  cargando = false,
  onIr,
  className,
}: {
  pagina: number
  totalPaginas: number
  total: number
  porPagina: number
  cargando?: boolean
  onIr: (p: number) => void
  className?: string
}) {
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1
  const hasta = Math.min(pagina * porPagina, total)

  // Ventana deslizante de 5 números centrada en la página actual, sin salirse de
  // los extremos.
  const numeros = Array.from({ length: Math.min(VENTANA, totalPaginas) }, (_, i) => {
    if (totalPaginas <= VENTANA) return i + 1
    if (pagina <= 3) return i + 1
    if (pagina >= totalPaginas - 2) return totalPaginas - VENTANA + 1 + i
    return pagina - 2 + i
  })

  const enPrimera = pagina <= 1 || cargando
  const enUltima = pagina >= totalPaginas || cargando

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-between gap-3 border-t border-line bg-surface-subtle px-5 py-3 sm:flex-row",
        className
      )}
    >
      <p className="num order-2 text-[11.5px] text-ink-muted sm:order-1">
        {total === 0 ? (
          "Sin registros"
        ) : (
          <>
            {desde.toLocaleString("es-AR")}–{hasta.toLocaleString("es-AR")} de{" "}
            {total.toLocaleString("es-AR")}
          </>
        )}
      </p>

      {totalPaginas > 1 && (
        <div className="order-1 flex items-center gap-1 sm:order-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onIr(1)}
            disabled={enPrimera}
            aria-label="Primera página"
          >
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onIr(pagina - 1)}
            disabled={enPrimera}
            aria-label="Página anterior"
          >
            <ChevronLeft />
          </Button>

          <div className="mx-1 flex items-center gap-1">
            {numeros.map((p) => (
              <Button
                key={p}
                variant={p === pagina ? "default" : "ghost"}
                size="icon-sm"
                className="num text-[11.5px]"
                onClick={() => onIr(p)}
                disabled={cargando}
                aria-current={p === pagina ? "page" : undefined}
              >
                {p}
              </Button>
            ))}
          </div>

          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onIr(pagina + 1)}
            disabled={enUltima}
            aria-label="Página siguiente"
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onIr(totalPaginas)}
            disabled={enUltima}
            aria-label="Última página"
          >
            <ChevronsRight />
          </Button>
        </div>
      )}
    </div>
  )
}
