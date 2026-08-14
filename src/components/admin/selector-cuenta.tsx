"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Search, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import {
  TIPO_CUENTA_LABEL,
  cuentasRecientes,
  etiquetaCuenta,
  filtrarCuentas,
  recordarCuenta,
  usePlanCuentas,
  type CuentaContable,
} from "@/lib/admin/plan-cuentas"
import { cn } from "@/lib/utils"

/**
 * Elegir una cuenta contable entre las 224 del plan del contador.
 *
 * Reemplaza al `<select>` que servía cuando el plan eran 50 cuentas genéricas.
 * Con el plan real, un desplegable obliga a recorrer una lista de dos pantallas
 * y media para encontrar `513 Internet`, y lo que termina pasando es que se deja
 * sin imputar.
 *
 * Tres cosas hacen que 224 opciones no se sientan:
 *
 *  · **Se escribe, no se busca.** Tipear "inter" deja `513 Internet` primero.
 *  · **Las últimas usadas están arriba** apenas se abre, sin escribir nada: una
 *    empresa imputa siempre contra las mismas diez o quince.
 *  · **Se navega con el teclado.** Quien carga cincuenta facturas seguidas no
 *    quiere soltar las manos para ir al mouse.
 */
export function SelectorCuenta({
  id,
  valor,
  onElegir,
  disabled,
  placeholder = "Buscar por código o nombre…",
  /** Qué se ofrece primero cuando no hay nada escrito. Sirve para que el
   *  formulario de gastos arranque mostrando cuentas de egreso. */
  tipoSugerido,
}: {
  id: string
  valor: string
  onElegir: (cuentaId: string) => void
  disabled?: boolean
  placeholder?: string
  tipoSugerido?: CuentaContable["tipo"]
}) {
  const { cuentas, cargando } = usePlanCuentas()
  const [q, setQ] = useState("")
  const [abierto, setAbierto] = useState(false)
  const [marcado, setMarcado] = useState(0)
  const [recientes, setRecientes] = useState<string[]>([])

  const caja = useRef<HTMLDivElement>(null)
  const lista = useRef<HTMLDivElement>(null)

  const elegida = useMemo(() => cuentas.find((c) => c.id === valor) ?? null, [cuentas, valor])

  // Se leen al abrir y no al montar: si se cargaron tres facturas seguidas, la
  // cuarta tiene que ver las cuentas de las tres anteriores.
  useEffect(() => {
    if (abierto) setRecientes(cuentasRecientes())
  }, [abierto])

  /**
   * Qué se muestra. Con texto escrito manda el filtro y nada más. Sin texto, van
   * primero las últimas usadas y después el resto —empezando por el rubro
   * sugerido, si el formulario dijo cuál—, porque una lista que arranca en
   * `1 Caja` no ayuda a cargar un gasto.
   */
  const visibles = useMemo(() => {
    if (q.trim()) return filtrarCuentas(cuentas, q)

    const porId = new Map(cuentas.map((c) => [c.id, c]))
    const usadas = recientes.map((rid) => porId.get(rid)).filter((c): c is CuentaContable => !!c)
    const usadasIds = new Set(usadas.map((c) => c.id))

    const resto = cuentas.filter((c) => !usadasIds.has(c.id))
    if (tipoSugerido) {
      resto.sort((a, b) => {
        const pa = a.tipo === tipoSugerido ? 0 : 1
        const pb = b.tipo === tipoSugerido ? 0 : 1
        return pa - pb || a.orden - b.orden
      })
    }

    return [...usadas, ...resto]
  }, [cuentas, q, recientes, tipoSugerido])

  /** Cuántas de las visibles son "últimas usadas", para dibujar el separador. */
  const cantRecientes = q.trim()
    ? 0
    : visibles.filter((c) => recientes.includes(c.id)).length

  useEffect(() => {
    setMarcado(0)
  }, [q, abierto])

  // Que el ítem marcado con el teclado no quede fuera de la ventana visible.
  useEffect(() => {
    if (!abierto || !lista.current) return
    const nodo = lista.current.querySelector<HTMLElement>(`[data-indice="${marcado}"]`)
    nodo?.scrollIntoView({ block: "nearest" })
  }, [marcado, abierto])

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener("mousedown", fuera)
    return () => document.removeEventListener("mousedown", fuera)
  }, [])

  const elegir = (c: CuentaContable) => {
    recordarCuenta(c.id)
    onElegir(c.id)
    setAbierto(false)
    setQ("")
  }

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setAbierto(true)
      setMarcado((i) => Math.min(i + 1, visibles.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setMarcado((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      if (!abierto) return
      e.preventDefault()
      const c = visibles[marcado]
      if (c) elegir(c)
    } else if (e.key === "Escape") {
      setAbierto(false)
      setQ("")
    }
  }

  return (
    <div ref={caja} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
        <Input
          id={id}
          value={abierto ? q : elegida ? etiquetaCuenta(elegida) : ""}
          onChange={(e) => {
            setQ(e.target.value)
            setAbierto(true)
          }}
          onFocus={() => {
            setQ("")
            setAbierto(true)
          }}
          onKeyDown={teclas}
          placeholder={cargando ? "Cargando el plan de cuentas…" : placeholder}
          className={cn("pl-9", elegida && !abierto && "pr-16 font-medium")}
          disabled={disabled || cargando}
          autoComplete="off"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={`${id}-opciones`}
        />

        {elegida && !abierto && (
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            <Check className="h-3.5 w-3.5 text-success" />
            {/* Sin esto, una cuenta imputada por error no se puede sacar: el
                campo es opcional pero el buscador no ofrece "ninguna". */}
            <button
              type="button"
              onClick={() => onElegir("")}
              disabled={disabled}
              aria-label="Quitar la cuenta contable"
              title="Sin imputar"
              className="rounded p-0.5 text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {abierto && (
        <div
          ref={lista}
          id={`${id}-opciones`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-e3"
        >
          {visibles.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-ink-muted">
              Ninguna cuenta coincide con «{q}».
            </p>
          ) : (
            visibles.map((c, i) => (
              <div key={c.id}>
                {/* El separador solo aparece cuando hay recientes y ya se
                    terminaron: sin él, las últimas usadas se confunden con el
                    principio del plan. */}
                {cantRecientes > 0 && i === 0 && (
                  <p className="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
                    Últimas usadas
                  </p>
                )}
                {cantRecientes > 0 && i === cantRecientes && (
                  <p className="mt-1 border-t border-line px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
                    Todo el plan
                  </p>
                )}

                <button
                  type="button"
                  role="option"
                  aria-selected={c.id === valor}
                  data-indice={i}
                  onMouseEnter={() => setMarcado(i)}
                  onClick={() => elegir(c)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors",
                    i === marcado ? "bg-brand-50" : "hover:bg-brand-50"
                  )}
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="num shrink-0 text-[11.5px] tabular-nums text-ink-muted">
                      {c.codigo}
                    </span>
                    <span className="truncate text-[13px] text-ink">{c.nombre}</span>
                  </span>
                  <span className="shrink-0 text-[10.5px] text-ink-faint">
                    {TIPO_CUENTA_LABEL[c.tipo]}
                  </span>
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
