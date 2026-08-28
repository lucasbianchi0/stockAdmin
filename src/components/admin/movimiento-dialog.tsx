"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, ArrowLeftRight, Loader2, Receipt, X } from "lucide-react"

import { SelectorCuenta } from "@/components/admin/selector-cuenta"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { CuentaFinanciera } from "@/lib/admin/cobros"
import { CATEGORIAS_GASTO, CATEGORIA_LABEL } from "@/lib/admin/movimientos"
import {
  NOMBRE_MONEDA,
  formatearImporte,
  formatearTc,
  parsearImporte,
  type Moneda,
} from "@/lib/admin/moneda"
import { useCotizacion } from "@/lib/admin/use-cotizacion"
import { cn } from "@/lib/utils"

/**
 * Gasto, ajuste o transferencia.
 *
 * Un solo diálogo para las tres porque comparten casi todo (fecha, cuenta,
 * importe, moneda) y separarlos serían tres formularios con los mismos campos
 * que hay que mantener sincronizados.
 *
 * La transferencia tiene un campo que las otras no: **el importe que llega puede
 * diferir del que sale**. Eso es lo que convierte a la transferencia en la forma
 * de registrar una compra de dólares — salen pesos de una cuenta, entran dólares
 * en otra — sin inventar un tipo de operación aparte.
 */
/** Lo que puede llegar precargado desde la carga inteligente. Todo opcional: el
 *  lector devuelve null lo que no leyó, y un campo sin dato tiene que quedar
 *  vacío para que se note que falta. */
export type BorradorMovimiento = {
  fecha?: string
  importe?: string
  moneda?: Moneda
  tc?: string
  categoria?: string
  referencia?: string
  detalle?: string
}

export function MovimientoDialog({
  modo,
  cuentas,
  borrador,
  cuentaFijaId,
  onCerrar,
  onGuardado,
}: {
  modo: null | "gasto" | "transferencia" | "ajuste"
  cuentas: CuentaFinanciera[]
  borrador?: BorradorMovimiento | null
  /** Cuando se abre desde el extracto de una cuenta, esa cuenta ya está
   *  elegida. Es la diferencia entre cargar un gasto en dos clics y tener que
   *  volver a decir dónde estás parado. */
  cuentaFijaId?: string
  onCerrar: () => void
  onGuardado: () => void
}) {
  const hoy = new Date().toISOString().slice(0, 10)

  const [fecha, setFecha] = useState(hoy)
  const [cuentaId, setCuentaId] = useState("")
  const [cuentaDestinoId, setCuentaDestinoId] = useState("")
  const [tipo, setTipo] = useState<"ingreso" | "egreso">("egreso")
  const [importe, setImporte] = useState("")
  const [importeDestino, setImporteDestino] = useState("")
  const [moneda, setMoneda] = useState<Moneda>("ARS")
  const [monedaDestino, setMonedaDestino] = useState<Moneda>("ARS")
  const [tc, setTc] = useState("")
  const [categoria, setCategoria] = useState<string>("otros")
  const [cuentaContableId, setCuentaContableId] = useState("")
  const [referencia, setReferencia] = useState("")
  const [detalle, setDetalle] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cotizacion = useCotizacion()
  const esTransferencia = modo === "transferencia"

  // Al abrir se arranca de cero, o de lo que haya leído la carga inteligente.
  //
  // La cuenta solo viene precargada si el diálogo se abrió desde el extracto de
  // una: ahí no se está inventando el dato, se está usando el que la pantalla ya
  // sabe. Desde la carga inteligente sigue vacía — de qué caja salió la plata no
  // está en el papel, y elegirla por defecto sería inventar el dato más fácil de
  // no mirar.
  useEffect(() => {
    if (!modo) return
    setFecha(borrador?.fecha ?? hoy)
    setCuentaId(cuentaFijaId ?? "")
    setCuentaDestinoId("")
    setTipo("egreso")
    setImporte(borrador?.importe ?? "")
    setImporteDestino("")
    setMoneda(borrador?.moneda ?? "ARS")
    setMonedaDestino("ARS")
    setTc(borrador?.tc ?? "")
    setCategoria(borrador?.categoria ?? "otros")
    setCuentaContableId("")
    setReferencia(borrador?.referencia ?? "")
    setDetalle(borrador?.detalle ?? "")
    setError(null)
  }, [modo, hoy, borrador, cuentaFijaId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !guardando) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar, guardando])

  // Al elegir una cuenta se adopta su moneda: una caja en pesos no recibe dólares.
  useEffect(() => {
    const c = cuentas.find((x) => x.id === cuentaId)
    if (c) setMoneda(c.moneda)
  }, [cuentaId, cuentas])

  useEffect(() => {
    const c = cuentas.find((x) => x.id === cuentaDestinoId)
    if (c) setMonedaDestino(c.moneda)
  }, [cuentaDestinoId, cuentas])

  useEffect(() => {
    const necesitaTc = moneda === "USD" || monedaDestino === "USD"
    if (necesitaTc && !tc && cotizacion.venta) setTc(String(cotizacion.venta))
  }, [moneda, monedaDestino, tc, cotizacion.venta])

  if (!modo) return null

  const imp = parsearImporte(importe) ?? 0
  const impDestino = parsearImporte(importeDestino) ?? imp
  const tcNum = parsearImporte(tc) ?? 0
  const cambiaMoneda = esTransferencia && moneda !== monedaDestino

  const puedeGuardar = esTransferencia
    ? Boolean(cuentaId && cuentaDestinoId && cuentaId !== cuentaDestinoId && imp > 0 && !guardando)
    : Boolean(cuentaId && imp > 0 && (moneda === "ARS" || tcNum > 0) && !guardando)

  const guardar = async () => {
    if (!puedeGuardar) return
    setGuardando(true)
    setError(null)

    try {
      const body = esTransferencia
        ? {
            origen: "transferencia",
            fecha,
            cuentaOrigenId: cuentaId,
            cuentaDestinoId,
            importeOrigen: imp,
            importeDestino: impDestino,
            monedaOrigen: moneda,
            monedaDestino,
            tc: tcNum || 1,
            referencia,
            detalle,
          }
        : {
            origen: modo === "gasto" ? "gasto" : "manual",
            fecha,
            cuentaId,
            tipo,
            importe: imp,
            moneda,
            tc: tcNum || 1,
            categoria: modo === "gasto" ? categoria : null,
            cuentaContableId: cuentaContableId || null,
            referencia,
            detalle,
          }

      const res = await fetch("/api/admin/movimientos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar")
      onGuardado()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  const titulo =
    modo === "gasto"
      ? "Otro movimiento"
      : modo === "transferencia"
        ? "Transferencia entre cuentas"
        : "Ajuste manual"

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={() => !guardando && onCerrar()}
      />

      <div className="relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-6 fade-in-0 duration-250 sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              {esTransferencia ? (
                <ArrowLeftRight className="h-[18px] w-[18px]" strokeWidth={1.9} />
              ) : (
                <Receipt className="h-[18px] w-[18px]" strokeWidth={1.9} />
              )}
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">{titulo}</h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                {modo === "gasto"
                  ? "Plata que se mueve sin factura: impuestos, bancarios, sueldos, fondos"
                  : esTransferencia
                    ? "Mover plata entre cuentas propias, o comprar dólares"
                    : "La corrección que no encaja en ninguna otra categoría"}
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            disabled={guardando}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          <Campo id="fecha" rotulo="Fecha">
            <Input
              id="fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="num"
              disabled={guardando}
            />
          </Campo>

          <Campo id="cuenta" rotulo={esTransferencia ? "Cuenta de origen" : "Cuenta"}>
            <Select
              id="cuenta"
              value={cuentaId}
              onChange={setCuentaId}
              disabled={guardando}
              opciones={[
                { valor: "", etiqueta: "Elegí la cuenta…" },
                ...cuentas.map((c) => ({
                  valor: c.id,
                  etiqueta: `${c.nombre} (${c.moneda})`,
                })),
              ]}
            />
          </Campo>

          {esTransferencia && (
            <Campo id="destino" rotulo="Cuenta de destino">
              <Select
                id="destino"
                value={cuentaDestinoId}
                onChange={setCuentaDestinoId}
                disabled={guardando}
                opciones={[
                  { valor: "", etiqueta: "Elegí la cuenta…" },
                  ...cuentas
                    .filter((c) => c.id !== cuentaId)
                    .map((c) => ({ valor: c.id, etiqueta: `${c.nombre} (${c.moneda})` })),
                ]}
              />
            </Campo>
          )}

          {/* Salió o entró.
              En "ajuste" siempre estuvo; en "gasto" hacía falta y no estaba, y
              era lo único que impedía registrar un rescate de FIMA — plata que
              vuelve a la cuenta sin ser una venta ni una transferencia. Sin esto
              el rescate había que anotarlo como ajuste, que es la categoría que
              nadie mira. Es el punto 1 de "otros movimientos" del pliego. */}
          {!esTransferencia && (
            <Campo id="tipo" rotulo="Dirección">
              <div className="flex gap-2">
                {(["ingreso", "egreso"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    aria-pressed={tipo === t}
                    disabled={guardando}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-colors disabled:opacity-60",
                      tipo === t
                        ? "border-brand-300 bg-brand-50 text-brand-700"
                        : "border-line bg-surface text-ink-secondary hover:border-line-strong"
                    )}
                  >
                    {t === "ingreso" ? "Entró a la cuenta" : "Salió de la cuenta"}
                  </button>
                ))}
              </div>
            </Campo>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="importe" rotulo={esTransferencia ? "Importe que sale" : "Importe"}>
              <Input
                id="importe"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                className="num text-right"
                disabled={guardando}
              />
              <p className="mt-1 text-right text-[11px] text-ink-muted">{NOMBRE_MONEDA[moneda]}</p>
            </Campo>

            {esTransferencia ? (
              <Campo
                id="importeDestino"
                rotulo="Importe que llega"
                ayuda={cambiaMoneda ? "Cambia de moneda: poné lo que realmente entró" : undefined}
              >
                <Input
                  id="importeDestino"
                  value={importeDestino}
                  onChange={(e) => setImporteDestino(e.target.value)}
                  placeholder={String(imp || "0,00")}
                  inputMode="decimal"
                  className="num text-right"
                  disabled={guardando}
                />
                <p className="mt-1 text-right text-[11px] text-ink-muted">
                  {NOMBRE_MONEDA[monedaDestino]}
                </p>
              </Campo>
            ) : (
              moneda === "USD" && (
                <Campo
                  id="tc"
                  rotulo="Tipo de cambio"
                  ayuda={cotizacion.venta ? `Hoy: ${formatearTc(cotizacion.venta)}` : undefined}
                >
                  <Input
                    id="tc"
                    value={tc}
                    onChange={(e) => setTc(e.target.value)}
                    className="num text-right"
                    disabled={guardando}
                  />
                </Campo>
              )
            )}
          </div>

          {/* El tipo de cambio implícito de la operación. Es el número que
              después hay que poder justificar: cuántos pesos costó cada dólar. */}
          {cambiaMoneda && imp > 0 && impDestino > 0 && (
            <p className="num rounded-lg bg-surface-subtle px-3 py-2 text-[12px] text-ink-secondary">
              Tipo de cambio de la operación:{" "}
              <strong className="font-semibold text-ink">
                {formatearTc(
                  moneda === "ARS" ? imp / impDestino : impDestino / imp
                )}
              </strong>{" "}
              <span className="text-ink-muted">
                ({formatearImporte(imp, moneda)} → {formatearImporte(impDestino, monedaDestino)})
              </span>
            </p>
          )}

          {modo === "gasto" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="categoria" rotulo="Categoría">
                <Select
                  id="categoria"
                  value={categoria}
                  onChange={setCategoria}
                  disabled={guardando}
                  opciones={CATEGORIAS_GASTO.map((c) => ({
                    valor: c,
                    etiqueta: CATEGORIA_LABEL[c],
                  }))}
                />
              </Campo>

              <Campo
                id="contable"
                rotulo="Cuenta contable"
                opcional
                ayuda={
                  tipo === "ingreso"
                    ? "Contra qué cuenta del plan entra la plata"
                    : "Contra qué cuenta del plan se imputa el gasto"
                }
              >
                {/* El rubro sugerido sigue la dirección: un egreso se imputa
                    casi siempre contra un gasto y un ingreso contra una
                    ganancia, y arrancar la lista por el rubro correcto es lo
                    que evita que se deje sin imputar. */}
                <SelectorCuenta
                  id="contable"
                  valor={cuentaContableId}
                  onElegir={setCuentaContableId}
                  disabled={guardando}
                  tipoSugerido={tipo === "ingreso" ? "ingreso" : "egreso"}
                />
              </Campo>
            </div>
          )}

          <Campo id="referencia" rotulo="Referencia" opcional>
            <Input
              id="referencia"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Nº de transferencia, cheque o comprobante"
              disabled={guardando}
            />
          </Campo>

          <Campo id="detalle" rotulo="Detalle" opcional>
            <Textarea
              id="detalle"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value.slice(0, 500))}
              className="min-h-[56px]"
              disabled={guardando}
            />
          </Campo>
        </div>

        <div className="shrink-0 border-t border-line bg-surface-subtle px-5 py-4 sm:px-6">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-danger-text" />
              <p className="text-[12px] text-danger-text">{error}</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={!puedeGuardar}>
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Registrar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Piezas ───────────────────────────────────────────────────────────────── */

function Campo({
  id,
  rotulo,
  opcional,
  ayuda,
  children,
}: {
  id: string
  rotulo: string
  opcional?: boolean
  ayuda?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <label htmlFor={id} className="text-[12.5px] font-semibold text-ink">
          {rotulo}
        </label>
        {opcional && <span className="text-[10.5px] text-ink-faint">opcional</span>}
      </div>
      {ayuda && <p className="mt-0.5 text-[11.5px] text-ink-muted">{ayuda}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function Select({
  id,
  value,
  onChange,
  opciones,
  disabled,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  opciones: { valor: string; etiqueta: string }[]
  disabled?: boolean
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        "flex h-9 w-full appearance-none rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-ink",
        "shadow-[inset_0_1px_2px_0_oklch(0.215_0.032_257/0.04)] transition-[border-color,box-shadow] duration-150",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b7280%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-[length:14px] bg-[right_0.6rem_center] bg-no-repeat pr-8",
        "hover:border-n-400",
        "focus-visible:border-brand-400 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_oklch(0.578_0.170_258/0.14)]",
        "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60"
      )}
    >
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </select>
  )
}
