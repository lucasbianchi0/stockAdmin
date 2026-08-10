"use client"

import { Input } from "@/components/ui/input"
import {
  SIMBOLO_MONEDA,
  contravalor,
  formatearImporte,
  monedaOpuesta,
  parsearImporte,
  type Moneda,
} from "@/lib/admin/moneda"
import { cn } from "@/lib/utils"

/**
 * Campo de importe con el contravalor en vivo.
 *
 * La línea gris de abajo —"≈ $ 3.891.200,00"— es la razón de ser del componente.
 * Sin ella, cargar una factura en dólares obliga a abrir la calculadora para
 * saber si el número que se está tipeando tiene el orden de magnitud correcto, y
 * un cero de más en un importe en dólares son varios millones de pesos que nadie
 * detecta hasta el cierre.
 *
 * El valor se mantiene como texto y no como número mientras se escribe: si se
 * parseara en cada tecla, escribir "1500,5" sería imposible — al llegar a la
 * coma el número ya se habría normalizado a 1500 y el cursor saltaría.
 */
export function CampoMoneda({
  id,
  valor,
  onChange,
  moneda,
  tc,
  disabled,
  placeholder = "0,00",
  className,
  destacado = false,
}: {
  id: string
  valor: string
  onChange: (v: string) => void
  moneda: Moneda
  /** Pesos por dólar. Sin TC válido no se muestra contravalor. */
  tc: number
  disabled?: boolean
  placeholder?: string
  className?: string
  /** El total: más grande y en negrita, porque es el número que se controla
   *  contra el papel. */
  destacado?: boolean
}) {
  const numero = parsearImporte(valor) ?? 0
  const otra = monedaOpuesta(moneda)
  const equivalente = tc > 0 ? contravalor(numero, moneda, tc) : null

  return (
    <div className={className}>
      <div className="relative">
        <span
          className={cn(
            "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint",
            destacado ? "text-[13px]" : "text-[11.5px]"
          )}
        >
          {SIMBOLO_MONEDA[moneda]}
        </span>
        <Input
          id={id}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode="decimal"
          disabled={disabled}
          className={cn(
            "num text-right",
            moneda === "ARS" ? "pl-7" : "pl-12",
            destacado && "h-11 text-[16px] font-bold"
          )}
        />
      </div>

      {/* El contravalor solo cuando hay algo que convertir: con el campo vacío
          un "≈ $ 0,00" es ruido. */}
      {equivalente !== null && numero !== 0 && (
        <p className="num mt-1 text-right text-[11px] text-ink-muted">
          ≈ {formatearImporte(equivalente, otra)}
        </p>
      )}
    </div>
  )
}
