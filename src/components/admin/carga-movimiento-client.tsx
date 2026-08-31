"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeftRight, ArrowRight, FileInput, Pencil, Receipt } from "lucide-react"
import { toast } from "sonner"

import { LecturaGastoDialog } from "@/components/admin/lectura-gasto-dialog"
import {
  MovimientoDialog,
  type BorradorMovimiento,
} from "@/components/admin/movimiento-dialog"
import { Button } from "@/components/ui/button"
import type { CuentaFinanciera } from "@/lib/admin/cobros"
import { cn } from "@/lib/utils"

type Modo = "gasto" | "transferencia" | "ajuste"

const MODOS: { valor: Modo; etiqueta: string; icon: typeof Receipt }[] = [
  { valor: "gasto", etiqueta: "Gasto", icon: Receipt },
  { valor: "transferencia", etiqueta: "Transferencia", icon: ArrowLeftRight },
  { valor: "ajuste", etiqueta: "Ajuste", icon: Pencil },
]

/**
 * Otros movimientos: la pantalla es el formulario, como las otras cinco de
 * carga del módulo.
 *
 * Los tres modos van arriba y no escondidos detrás de un botón cada uno, porque
 * elegir cuál es el primer paso del trabajo, no una variante del mismo. El
 * **ajuste** aparece acá por primera vez: el formulario estaba escrito hace
 * rato y ningún botón de ninguna pantalla lo disparaba, así que la corrección
 * manual —la que el propio código dice que existe "porque siempre hay una"— no
 * se podía hacer.
 *
 * Y arriba de todo, la regla que separa esta pantalla de las facturas de
 * compra. Es la única confusión cara del módulo: un movimiento no tiene entidad
 * ni IVA discriminado (ver `Movimiento` en `lib/admin/movimientos.ts`), así que
 * cargar acá un gasto que sí vino con factura pierde dos cosas de una —el
 * proveedor, que entonces no queda con saldo en su cuenta corriente, y el
 * crédito fiscal—. No se valida ni se bloquea nada: se dice, con el link al
 * lado, que es lo que alcanza cuando el que carga sabe lo que tiene en la mano.
 */
export function CargaMovimientoClient() {
  const [modo, setModo] = useState<Modo>("gasto")
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([])
  const [leyendo, setLeyendo] = useState(false)
  const [borrador, setBorrador] = useState<BorradorMovimiento | null>(null)

  /** Remonta el formulario para vaciarlo. Ver `CargaComprobanteClient`. */
  const [serie, setSerie] = useState(0)
  const limpiar = () => {
    setBorrador(null)
    setSerie((n) => n + 1)
  }

  useEffect(() => {
    fetch("/api/admin/cuentas")
      .then((r) => r.json())
      .then((d) => setCuentas(d.cuentas ?? []))
      .catch(() => setCuentas([]))
  }, [])

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
          {MODOS.map((m) => (
            <button
              key={m.valor}
              onClick={() => {
                setModo(m.valor)
                limpiar()
              }}
              aria-pressed={modo === m.valor}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                modo === m.valor
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-muted hover:bg-surface-muted hover:text-ink"
              )}
            >
              <m.icon className="h-3.5 w-3.5" />
              {m.etiqueta}
            </button>
          ))}
        </div>

        {/* Solo para el gasto: un comprobante de transferencia o un ajuste no
            son papeles que haya que leer. */}
        {modo === "gasto" && (
          <Button variant="outline" onClick={() => setLeyendo(true)}>
            <FileInput className="h-3.5 w-3.5" />
            Carga inteligente
          </Button>
        )}
      </div>

      {modo === "gasto" && (
        <p className="rounded-lg border border-warning-line bg-warning-soft/50 px-3.5 py-2.5 text-[12px] text-ink-secondary">
          Si el gasto vino con factura de un proveedor, cargalo en{" "}
          <Link
            href="/admin/compras"
            className="font-semibold text-brand-700 underline-offset-2 hover:underline"
          >
            Facturas de compras
          </Link>
          : acá no se guarda ni el proveedor ni el IVA discriminado.
        </p>
      )}

      <MovimientoDialog
        key={`${modo}-${serie}`}
        modo={modo}
        embebido
        cuentas={cuentas}
        borrador={borrador}
        onCerrar={limpiar}
        onGuardado={() => {
          limpiar()
          toast.success("Movimiento registrado")
        }}
      />

      <div className="flex justify-center">
        <Link
          href="/admin/movimientos/listado"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted transition-colors hover:text-brand-600"
        >
          Ver los movimientos cargados
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <LecturaGastoDialog
        abierto={leyendo}
        onCerrar={() => setLeyendo(false)}
        onUsar={(leido) => {
          setLeyendo(false)
          setBorrador(leido)
          setSerie((n) => n + 1)
        }}
      />
    </div>
  )
}
