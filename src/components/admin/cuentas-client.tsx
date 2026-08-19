"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeftRight,
  ChevronRight,
  FileInput,
  Landmark,
  Receipt,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"

import { AvisoSinAsiento } from "@/components/admin/aviso-sin-asiento"
import { LecturaGastoDialog } from "@/components/admin/lectura-gasto-dialog"
import {
  MovimientoDialog,
  type BorradorMovimiento,
} from "@/components/admin/movimiento-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import type { CuentaFinanciera } from "@/lib/admin/cobros"
import { formatearImporte } from "@/lib/admin/moneda"
import { cn } from "@/lib/utils"

/**
 * Caja y bancos — el índice.
 *
 * Antes esta pantalla era una tabla con todos los movimientos de todas las
 * cuentas mezclados y unas tarjetas arriba que hacían de filtro. Contestaba
 * "¿cuánta plata hay?" pero no "¿qué pasó en el Galicia?", que es la pregunta
 * que trae a alguien acá.
 *
 * Ahora son dos niveles, que es como se mira una cuenta de verdad:
 *
 *   1. **Acá**: el listado de cuentas —Caja, Mercado Libre, cada banco— con su
 *      saldo. Es la misma lista que muestra el reporte de saldos, pero desde acá
 *      se entra.
 *   2. **Adentro**: el extracto de esa cuenta, con el formato del resumen del
 *      banco y el saldo corriendo fila por fila.
 */

const ICONO = {
  caja: Wallet,
  banco: Landmark,
  billetera: Wallet,
} as const

const TIPO_LABEL = {
  caja: "Caja",
  banco: "Banco",
  billetera: "Billetera",
} as const

export function CuentasClient() {
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState<null | "gasto" | "transferencia" | "ajuste">(null)
  const [leyendo, setLeyendo] = useState(false)
  const [borrador, setBorrador] = useState<BorradorMovimiento | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/cuentas?detalle=1")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar las cuentas")
      setCuentas(data.cuentas ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las cuentas")
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const alGuardar = useCallback(() => {
    setDialogo(null)
    setBorrador(null)
    toast.success("Movimiento registrado")
    cargar()
  }, [cargar])

  /* Los totales por moneda, nunca consolidados: sumar pesos y dólares en un
     número obliga a elegir un tipo de cambio, y cualquiera que se elija engaña
     para algún uso. */
  const totales = cuentas.reduce(
    (acc, c) => {
      if (c.moneda === "ARS") acc.ars += c.saldo ?? 0
      else acc.usd += c.saldo ?? 0
      return acc
    },
    { ars: 0, usd: 0 }
  )

  return (
    <>
      {/* Los movimientos cargados a mano acá son la otra fuente de documentos
          que quedan fuera del mayor: el asiento de un recibo lo arma el recibo,
          pero una comisión o una transferencia tipeada necesita que alguien le
          diga contra qué cuenta va. */}
      <AvisoSinAsiento filtro={{ origen: "movimiento" }} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="mr-auto flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <p className="eyebrow">Total en pesos</p>
            <p
              className={cn(
                "num text-[22px] font-bold tracking-[-0.02em]",
                totales.ars < 0 ? "text-danger-text" : "text-ink"
              )}
            >
              {formatearImporte(totales.ars, "ARS")}
            </p>
          </div>
          <div>
            <p className="eyebrow">Total en dólares</p>
            <p
              className={cn(
                "num text-[22px] font-bold tracking-[-0.02em]",
                totales.usd < 0 ? "text-danger-text" : "text-ink"
              )}
            >
              {formatearImporte(totales.usd, "USD")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setDialogo("transferencia")}>
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Transferencia
          </Button>
          <Button variant="outline" onClick={() => setLeyendo(true)}>
            <FileInput className="h-3.5 w-3.5" />
            Carga inteligente
          </Button>
          <Button onClick={() => setDialogo("gasto")}>
            <Receipt className="h-3.5 w-3.5" />
            Nuevo gasto
          </Button>
        </div>
      </div>

      {cargando ? (
        <LoadingState label="Cargando las cuentas…" />
      ) : error ? (
        <ErrorState message={error} onRetry={cargar} />
      ) : cuentas.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Todavía no hay cuentas"
          description="Cargá una caja o un banco para empezar a registrar movimientos."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cuentas.map((c) => {
            const Icono = ICONO[c.tipo]
            const saldo = c.saldo ?? 0
            const movio = (c.entradasMes ?? 0) > 0 || (c.salidasMes ?? 0) > 0

            return (
              <Link
                key={c.id}
                href={`/admin/cuentas/${c.id}`}
                className={cn(
                  "group flex flex-col rounded-xl border border-line bg-surface p-4 shadow-e1",
                  "transition-all duration-150 hover:border-brand-200 hover:shadow-e2",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 rounded-lg bg-surface-muted p-2 text-ink-muted">
                    <Icono className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-ink">{c.nombre}</p>
                    <p className="text-[11.5px] text-ink-muted">
                      {TIPO_LABEL[c.tipo]} · {c.moneda}
                      {c.numeroCuenta && <span className="num"> · {c.numeroCuenta}</span>}
                    </p>
                  </div>

                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-500" />
                </div>

                <p
                  className={cn(
                    "num mt-3 text-[22px] font-bold tracking-[-0.02em]",
                    saldo < 0 ? "text-danger-text" : "text-ink"
                  )}
                >
                  {formatearImporte(saldo, c.moneda)}
                </p>

                {/* Lo del mes en dos números y no en uno neto: un saldo que no se
                    movió y uno que entró y salió lo mismo se ven igual en el
                    neto, y no son lo mismo. */}
                <div className="mt-2.5 flex items-center gap-3 border-t border-line-soft pt-2.5 text-[11.5px]">
                  {movio ? (
                    <>
                      <span className="num text-success-text">
                        +{formatearImporte(c.entradasMes ?? 0, c.moneda, { simbolo: false })}
                      </span>
                      <span className="num text-danger-text">
                        −{formatearImporte(c.salidasMes ?? 0, c.moneda, { simbolo: false })}
                      </span>
                      <span className="text-ink-faint">este mes</span>
                    </>
                  ) : (
                    <span className="text-ink-faint">Sin movimientos este mes</span>
                  )}

                  {(c.sinConciliar ?? 0) > 0 && (
                    <Badge tone="warning" size="sm" className="ml-auto">
                      {c.sinConciliar} sin conciliar
                    </Badge>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <LecturaGastoDialog
        abierto={leyendo}
        onCerrar={() => setLeyendo(false)}
        onUsar={(leido) => {
          setLeyendo(false)
          setBorrador(leido)
          setDialogo("gasto")
        }}
      />

      <MovimientoDialog
        modo={dialogo}
        cuentas={cuentas}
        borrador={borrador}
        onCerrar={() => {
          setDialogo(null)
          setBorrador(null)
        }}
        onGuardado={alGuardar}
      />
    </>
  )
}
