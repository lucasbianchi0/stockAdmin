"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { es } from "date-fns/locale"
import { DayPicker } from "react-day-picker"
import { CalendarRange, ChevronDown, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * El filtro de fecha de los reportes: una píldora chica, como los demás
 * filtros, que al tocarla abre un panel flotante debajo de ella con los
 * atajos en una fila y, abajo, dos calendarios abiertos: desde y hasta.
 *
 * Las fechas viajan como `YYYY-MM-DD` (las mismas que guarda la base) y se
 * aplican al instante: la tabla de atrás se va filtrando mientras se elige.
 *
 * El panel es propio y no el `Menu`: el menú se posiciona un cuadro después de
 * montarse y con un panel de este alto se veía saltar. Acá la posición se
 * calcula antes de pintar, y hasta tenerla el panel no se muestra.
 */

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

const aFecha = (f: string) => {
  const [a, m, d] = f.split("-").map(Number)
  return new Date(a, m - 1, d)
}

const corta = (f: string) => {
  const [a, m, d] = f.split("-")
  return `${Number(d)}/${Number(m)}/${a.slice(2)}`
}

/** Se calculan al usarlos y en hora local: la fecha de hoy en UTC ya es
 *  mañana a partir de las 21. */
const ATAJOS: { valor: string; etiqueta: string; rango: () => [string, string] }[] = [
  {
    valor: "hoy",
    etiqueta: "Hoy",
    rango: () => [iso(new Date()), iso(new Date())],
  },
  {
    valor: "mes",
    etiqueta: "Este mes",
    rango: () => {
      const h = new Date()
      return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(new Date(h.getFullYear(), h.getMonth() + 1, 0))]
    },
  },
  {
    valor: "mes-pasado",
    etiqueta: "Mes pasado",
    rango: () => {
      const h = new Date()
      return [iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), iso(new Date(h.getFullYear(), h.getMonth(), 0))]
    },
  },
  {
    valor: "3-meses",
    etiqueta: "Últimos 3 meses",
    rango: () => {
      const h = new Date()
      return [iso(new Date(h.getFullYear(), h.getMonth() - 2, 1)), iso(h)]
    },
  },
  {
    valor: "anio",
    etiqueta: "Este año",
    rango: () => {
      const a = new Date().getFullYear()
      return [`${a}-01-01`, `${a}-12-31`]
    },
  },
]

export function FiltroFecha({
  desde,
  hasta,
  onCambio,
}: {
  desde: string
  hasta: string
  onCambio: (desde: string, hasta: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ancla = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  const activo = Boolean(desde || hasta)
  const atajo = ATAJOS.find((a) => {
    const [d, h] = a.rango()
    return d === desde && h === hasta
  })
  const texto = atajo
    ? atajo.etiqueta
    : desde && hasta
      ? `${corta(desde)} → ${corta(hasta)}`
      : desde
        ? `desde ${corta(desde)}`
        : `hasta ${corta(hasta)}`

  // Debajo de la píldora, alineado a su izquierda; si no entra a la derecha,
  // se corre hasta que entre. Antes de pintar, para que no salte.
  useLayoutEffect(() => {
    if (!abierto || !ancla.current || !panel.current) return
    const r = ancla.current.getBoundingClientRect()
    const ancho = panel.current.offsetWidth
    setPos({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)),
    })
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node
      if (!ancla.current?.contains(t) && !panel.current?.contains(t)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false)
    const reubicar = () => setAbierto(false)
    document.addEventListener("mousedown", fuera)
    document.addEventListener("keydown", tecla)
    window.addEventListener("resize", reubicar)
    return () => {
      document.removeEventListener("mousedown", fuera)
      document.removeEventListener("keydown", tecla)
      window.removeEventListener("resize", reubicar)
    }
  }, [abierto])

  const abrir = () => {
    setPos(null)
    setAbierto((v) => !v)
  }

  const rango = desde && hasta ? { from: aFecha(desde), to: aFecha(hasta) } : undefined

  return (
    <>
      <span
        ref={ancla}
        className={cn(
          "relative inline-flex h-8 shrink-0 items-center rounded-full border text-[12.5px] transition-colors",
          activo
            ? "border-brand-200 bg-brand-50 text-brand-700"
            : "border-line bg-surface text-ink-secondary hover:border-line-strong hover:text-ink",
          abierto && !activo && "border-line-strong text-ink"
        )}
      >
        <button
          type="button"
          onClick={abrir}
          aria-expanded={abierto}
          className="flex h-full items-center gap-1.5 pl-3 pr-2.5"
        >
          <CalendarRange className={cn("h-3.5 w-3.5", activo ? "text-brand-600" : "text-ink-faint")} />
          {activo ? (
            <>
              <span className="text-brand-700/70">Fecha:</span>
              <span className="num font-medium">{texto}</span>
            </>
          ) : (
            <>
              Fecha
              <ChevronDown className={cn("h-3 w-3 text-ink-faint transition-transform", abierto && "rotate-180")} />
            </>
          )}
        </button>
        {activo && (
          <button
            type="button"
            onClick={() => onCambio("", "")}
            aria-label="Quitar filtro de fecha"
            className="-ml-1 mr-1 rounded-full p-1 text-brand-700/60 transition-colors hover:bg-brand-100 hover:text-brand-700"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </span>

      {abierto &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label="Elegir fechas"
            style={
              pos
                ? { position: "fixed", top: pos.top, left: pos.left, maxHeight: `calc(100dvh - ${pos.top + 8}px)` }
                : { position: "fixed", top: 0, left: 0 }
            }
            className={cn(
              // En el celular los dos calendarios van uno abajo del otro: si no
              // entran, el panel se desplaza adentro en vez de salirse.
              "z-[80] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-xl border border-line bg-surface p-3 shadow-e4",
              // Sin `duration-*`: en Tailwind 4 esa clase también le da
              // transición a todo, y el panel se deslizaba desde la esquina
              // (donde nace, sin posición) hasta abajo de la píldora.
              "transition-none",
              pos ? "visible animate-in fade-in-0 slide-in-from-top-1 [animation-duration:150ms]" : "invisible"
            )}
          >
            <div className="flex flex-wrap gap-1.5">
              {ATAJOS.map((a) => {
                const on = atajo?.valor === a.valor
                return (
                  <button
                    key={a.valor}
                    type="button"
                    onClick={() => onCambio(...a.rango())}
                    aria-pressed={on}
                    className={cn(
                      "h-7 rounded-full border px-3 text-[12px] font-medium transition-colors",
                      on
                        ? "border-brand-200 bg-brand-50 text-brand-700"
                        : "border-line text-ink-secondary hover:border-line-strong hover:text-ink"
                    )}
                  >
                    {a.etiqueta}
                  </button>
                )
              })}
            </div>

            <div className="mt-3 grid gap-4 border-t border-line pt-3 sm:grid-cols-2">
              <Calendario
                rotulo="Desde"
                valor={desde}
                rango={rango}
                deshabilitar={hasta ? { after: aFecha(hasta) } : undefined}
                onElegir={(f) => onCambio(f, hasta)}
              />
              <Calendario
                rotulo="Hasta"
                valor={hasta}
                rango={rango}
                deshabilitar={desde ? { before: aFecha(desde) } : undefined}
                onElegir={(f) => onCambio(desde, f)}
              />
            </div>

            <div className="mt-2 flex items-center justify-end gap-2 border-t border-line pt-3">
              {activo && (
                <Button variant="ghost" size="sm" onClick={() => onCambio("", "")}>
                  Borrar fechas
                </Button>
              )}
              <Button size="sm" onClick={() => setAbierto(false)}>
                Listo
              </Button>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

function Calendario({
  rotulo,
  valor,
  rango,
  deshabilitar,
  onElegir,
}: {
  rotulo: string
  valor: string
  rango: { from: Date; to: Date } | undefined
  deshabilitar: { after: Date } | { before: Date } | undefined
  onElegir: (f: string) => void
}) {
  const elegida = valor ? aFecha(valor) : undefined
  // El mes que se ve sigue a la fecha elegida: al tocar «Mes pasado» el
  // calendario salta a ese mes. Navegar con las flechas sigue siendo libre.
  const [mes, setMes] = useState<Date>(() => elegida ?? new Date())
  useEffect(() => {
    if (valor) setMes(aFecha(valor))
  }, [valor])
  return (
    <div>
      <p className="mb-1 flex items-baseline justify-between px-1">
        <span className="eyebrow">{rotulo}</span>
        <span className="num text-[12px] font-medium text-ink">{valor ? corta(valor) : "—"}</span>
      </p>
      <DayPicker
        mode="single"
        locale={es}
        weekStartsOn={1}
        showOutsideDays
        selected={elegida}
        month={mes}
        onMonthChange={setMes}
        onSelect={(d) => onElegir(d ? iso(d) : "")}
        disabled={deshabilitar}
        modifiers={rango ? { enRango: rango } : undefined}
        modifiersClassNames={{ enRango: "bg-brand-50/70 text-brand-700" }}
        classNames={{
          root: "w-[252px]",
          months: "relative",
          month: "space-y-1",
          month_caption: "flex h-8 items-center px-1",
          caption_label: "text-[13px] font-semibold capitalize text-ink",
          nav: "absolute right-0 top-0 z-10 flex h-8 items-center gap-0.5",
          button_previous:
            "flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-30",
          button_next:
            "flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-30",
          chevron: "h-3.5 w-3.5 fill-current",
          month_grid: "w-full border-collapse",
          weekdays: "flex",
          weekday: "w-9 pb-1 text-center text-[10.5px] font-medium uppercase text-ink-faint",
          week: "flex",
          day: "h-9 w-9 p-0 text-center text-[12.5px] rounded-md",
          day_button:
            "num h-9 w-9 rounded-md text-ink transition-colors hover:bg-surface-muted disabled:pointer-events-none",
          selected: "[&>button]:bg-brand-600 [&>button]:font-semibold [&>button]:text-white [&>button]:hover:bg-brand-700",
          today: "[&>button]:font-semibold [&>button]:text-brand-700",
          outside: "[&>button]:text-ink-faint",
          disabled: "[&>button]:text-ink-faint/50",
          hidden: "invisible",
        }}
      />
    </div>
  )
}
