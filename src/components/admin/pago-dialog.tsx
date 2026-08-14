"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, HandCoins, Loader2, Plus, Search, Trash2, X } from "lucide-react"

import { SemaforoVencimiento } from "@/components/admin/semaforo-vencimiento"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatearCuit } from "@/lib/admin/cuit"
import { formatearNumero } from "@/lib/admin/comprobantes"
import {
  JURISDICCIONES,
  JURISDICCION_LABEL,
  RETENCIONES,
  RETENCION_LABEL,
  balancear,
  convertir,
  sumaRetenciones,
  type CuentaFinanciera,
  type Pendiente,
  type Jurisdiccion,
  type Retencion,
} from "@/lib/admin/cobros"
import type { Cliente } from "@/lib/admin/entidades"
import type { TipoPago } from "@/lib/admin/cobros-server"
import {
  MONEDAS,
  NOMBRE_MONEDA,
  formatearImporte,
  formatearTc,
  parsearImporte,
  type Moneda,
} from "@/lib/admin/moneda"
import { useCotizacion } from "@/lib/admin/use-cotizacion"
import { cn } from "@/lib/utils"

/**
 * Registrar un cobro.
 *
 * La pantalla está construida alrededor de una sola ecuación, que se muestra en
 * vivo abajo de todo:
 *
 *     lo que cancela  =  lo que entró a la caja  +  las retenciones
 *
 * Y el botón de guardar no se habilita hasta que cierra. Es deliberadamente
 * rígido: el error más común del rubro es imputar por el total de la factura
 * olvidando que parte se fue en retención — la factura queda saldada, entra
 * menos plata de la que dice el recibo, y la diferencia aparece semanas después
 * como un descuadre de caja que nadie sabe de dónde salió.
 */

const hoyISO = () => new Date().toISOString().slice(0, 10)

type Medio = { cuentaId: string; importe: string; referencia: string }

/** Un renglón de retención en el formulario. Todo texto: el parseo a número es
 *  al guardar, para que se pueda tipear "1.234,56" sin que el campo pelee. */
type RenglonRetencion = {
  tipo: Retencion
  jurisdiccion: Jurisdiccion | null
  importe: string
  numeroCertificado: string
}

export function PagoDialog({
  tipo,
  abierto,
  onCerrar,
  onGuardado,
}: {
  /** cobro = entra plata de un cliente; pago = sale hacia un proveedor. */
  tipo: TipoPago
  abierto: boolean
  onCerrar: () => void
  onGuardado: () => void
}) {
  const esCobro = tipo === "cobro"
  const recurso = esCobro ? "cobros" : "pagos"
  const rotuloEntidad = esCobro ? "Cliente" : "Proveedor"
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [fecha, setFecha] = useState(hoyISO)
  const [moneda, setMoneda] = useState<Moneda>("ARS")
  const [tc, setTc] = useState("")
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [cargandoPendientes, setCargandoPendientes] = useState(false)
  /** comprobanteId → importe imputado, como texto del formulario. */
  const [imputado, setImputado] = useState<Record<string, string>>({})
  const [medios, setMedios] = useState<Medio[]>([{ cuentaId: "", importe: "", referencia: "" }])
  /** Los renglones de retención. Arranca vacío: la mayoría de los recibos no
   *  tiene ninguna, y cuatro campos en cero era la forma más rápida de que nadie
   *  leyera ninguno. */
  const [retenciones, setRetenciones] = useState<RenglonRetencion[]>([])
  const [observaciones, setObservaciones] = useState("")
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cotizacion = useCotizacion()

  useEffect(() => {
    if (!abierto) return
    setCliente(null)
    setFecha(hoyISO())
    setMoneda("ARS")
    setTc("")
    setPendientes([])
    setImputado({})
    setMedios([{ cuentaId: "", importe: "", referencia: "" }])
    setRetenciones([])
    setObservaciones("")
    setError(null)
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    fetch("/api/admin/cuentas")
      .then((r) => r.json())
      .then((d) => setCuentas(d.cuentas ?? []))
      .catch(() => {})
  }, [abierto])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !guardando) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar, guardando])

  const cargarPendientes = useCallback(async (id: string) => {
    setCargandoPendientes(true)
    try {
      const res = await fetch(`/api/admin/${recurso}/pendientes?entidadId=${id}`)
      const data = await res.json()
      setPendientes(data.pendientes ?? [])
    } catch {
      setPendientes([])
    } finally {
      setCargandoPendientes(false)
    }
  }, [recurso])

  /* ── Cálculos ────────────────────────────────────────────────────────────── */

  const tcNum = parsearImporte(tc) ?? 0

  /** Lo imputado, convertido a la moneda del recibo: una factura en dólares se
   *  cancela en dólares aunque se cobre en pesos. */
  const totalImputado = useMemo(
    () =>
      pendientes.reduce((acc, p) => {
        const v = parsearImporte(imputado[p.id] ?? "") ?? 0
        if (v <= 0) return acc
        return acc + convertir(v, p.moneda, moneda, tcNum)
      }, 0),
    [pendientes, imputado, moneda, tcNum]
  )

  const totalMedios = useMemo(
    () => medios.reduce((a, m) => a + (parsearImporte(m.importe) ?? 0), 0),
    [medios]
  )

  const totalRetenciones = useMemo(
    () => sumaRetenciones(retenciones.map((r) => ({ importe: parsearImporte(r.importe) ?? 0 }))),
    [retenciones]
  )

  const balance = balancear(totalImputado, totalMedios, totalRetenciones)

  /**
   * Cuándo hace falta el tipo de cambio.
   *
   * No lo decide la moneda del recibo sino si hay conversión de por medio: o
   * porque se está cancelando un comprobante en otra moneda, o porque la plata
   * entra a una cuenta en otra moneda. Antes se pedía solo en los recibos en
   * dólares, y un cobro en pesos de una factura en dólares se guardaba con TC 1
   * y nunca cuadraba.
   */
  const hayComprobanteEnOtraMoneda = pendientes.some(
    (p) => p.moneda !== moneda && (parsearImporte(imputado[p.id] ?? "") ?? 0) > 0
  )
  const hayCuentaEnOtraMoneda = medios.some((m) => {
    const cuenta = cuentas.find((c) => c.id === m.cuentaId)
    return Boolean(cuenta && cuenta.moneda !== moneda)
  })
  const necesitaTc = hayComprobanteEnOtraMoneda || hayCuentaEnOtraMoneda

  const faltaTc = necesitaTc && tcNum <= 0

  // La cotización del día se propone cuando el recibo la va a necesitar, que no
  // es lo mismo que "cuando el recibo está en dólares": un cobro en pesos de una
  // factura en dólares también la necesita — es el caso del punto 5.
  useEffect(() => {
    if (necesitaTc && !tc && cotizacion.venta) setTc(String(cotizacion.venta))
  }, [necesitaTc, tc, cotizacion.venta])
  const hayImputaciones = Object.values(imputado).some((v) => (parsearImporte(v) ?? 0) > 0)
  const puedeGuardar =
    Boolean(cliente) && hayImputaciones && balance.cuadra && !faltaTc && !guardando

  /* ── Acciones ────────────────────────────────────────────────────────────── */

  /** Imputa el saldo completo de una factura. Es el gesto más frecuente con
   *  diferencia: casi todos los cobros cancelan facturas enteras. */
  const saldarTodo = (p: Pendiente) =>
    setImputado((prev) => ({ ...prev, [p.id]: String(p.saldo) }))

  /** Completa los medios de pago con lo que falta para que el recibo cierre. */
  const completarMedio = (i: number) => {
    const resto = balance.imputado - balance.retenciones - (totalMedios - (parsearImporte(medios[i].importe) ?? 0))
    if (resto <= 0) return
    setMedios((prev) => prev.map((m, j) => (j === i ? { ...m, importe: String(resto) } : m)))
  }

  const guardar = async () => {
    if (!puedeGuardar || !cliente) return
    setGuardando(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/${recurso}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entidadId: cliente.id,
          fecha,
          moneda,
          // Se manda siempre que haya: en un recibo en pesos sin conversión no
          // hace falta, pero tenerlo deja el movimiento valuado en las dos
          // monedas sin costo.
          tc: tcNum > 0 ? tcNum : null,
          retenciones: retenciones
            .filter((r) => (parsearImporte(r.importe) ?? 0) > 0)
            .map((r) => ({
              tipo: r.tipo,
              jurisdiccion: r.tipo === "iibb" ? r.jurisdiccion : null,
              importe: parsearImporte(r.importe) ?? 0,
              numeroCertificado: r.numeroCertificado || null,
            })),
          imputaciones: pendientes
            .map((p) => ({ comprobanteId: p.id, importe: parsearImporte(imputado[p.id] ?? "") ?? 0 }))
            .filter((i) => i.importe > 0),
          medios: medios
            .filter((m) => m.cuentaId && (parsearImporte(m.importe) ?? 0) > 0)
            .map((m) => ({
              cuentaId: m.cuentaId,
              importe: parsearImporte(m.importe) ?? 0,
              referencia: m.referencia,
            })),
          observaciones,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `No se pudo registrar el ${tipo}`)
      onGuardado()
    } catch (e) {
      setError(e instanceof Error ? e.message : `No se pudo registrar el ${tipo}`)
    } finally {
      setGuardando(false)
    }
  }

  if (!abierto) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Registrar ${tipo}`}
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={() => !guardando && onCerrar()}
      />

      <div className="relative flex max-h-[94vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-6 fade-in-0 duration-250 sm:max-h-[92vh] sm:max-w-3xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <HandCoins className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
                Registrar {tipo}
              </h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                {esCobro
                  ? "Elegí qué facturas cancela y por dónde entró la plata"
                  : "Elegí qué comprobantes cancela y de dónde salió la plata"}
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

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          {/* Cliente y fecha */}
          <section className="space-y-4">
            <SelectorEntidad
              tipo={tipo}
              cliente={cliente}
              disabled={guardando}
              onElegir={(c) => {
                setCliente(c)
                setImputado({})
                cargarPendientes(c.id)
              }}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <Campo id="fecha" rotulo={`Fecha del ${tipo}`}>
                <Input
                  id="fecha"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="num"
                  disabled={guardando}
                />
              </Campo>

              <Campo id="moneda" rotulo="Moneda del recibo">
                <div className="flex gap-2">
                  {MONEDAS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={guardando}
                      onClick={() => setMoneda(m)}
                      aria-pressed={moneda === m}
                      className={cn(
                        "flex-1 rounded-lg border px-2 py-2 text-[12px] font-medium transition-colors disabled:opacity-60",
                        moneda === m
                          ? "border-brand-300 bg-brand-50 text-brand-700"
                          : "border-line bg-surface text-ink-secondary hover:border-line-strong"
                      )}
                    >
                      {NOMBRE_MONEDA[m]}
                    </button>
                  ))}
                </div>
              </Campo>

              {necesitaTc && (
                <Campo
                  id="tc"
                  rotulo="Tipo de cambio"
                  ayuda={cotizacion.venta ? `Hoy: ${formatearTc(cotizacion.venta)}` : undefined}
                >
                  <Input
                    id="tc"
                    value={tc}
                    onChange={(e) => setTc(e.target.value)}
                    className={cn("num text-right", faltaTc && "border-danger-line")}
                    disabled={guardando}
                  />
                </Campo>
              )}
            </div>
          </section>

          {/* Facturas a cancelar */}
          <section>
            <p className="eyebrow mb-2.5">
              {esCobro ? "Facturas a cancelar" : "Comprobantes a cancelar"}
            </p>

            {!cliente ? (
              <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[12.5px] text-ink-muted">
                Elegí un {rotuloEntidad.toLowerCase()} para ver sus comprobantes pendientes
              </div>
            ) : cargandoPendientes ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-line px-4 py-8 text-[12.5px] text-ink-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Buscando pendientes…
              </div>
            ) : pendientes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[12.5px] text-ink-muted">
                {cliente.razonSocial} no tiene comprobantes pendientes.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-line">
                {pendientes.map((p, i) => (
                  <FilaPendiente
                    key={p.id}
                    p={p}
                    valor={imputado[p.id] ?? ""}
                    monedaRecibo={moneda}
                    tc={tcNum}
                    primera={i === 0}
                    disabled={guardando}
                    onValor={(v) => setImputado((prev) => ({ ...prev, [p.id]: v }))}
                    onSaldar={() => saldarTodo(p)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Retenciones */}
          <section>
            <div className="mb-1 flex items-center justify-between">
              <p className="eyebrow">
                {esCobro ? "Retenciones sufridas" : "Retenciones practicadas"}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setRetenciones((prev) => [
                    ...prev,
                    { tipo: "ganancias", jurisdiccion: null, importe: "", numeroCertificado: "" },
                  ])
                }
                disabled={guardando}
              >
                <Plus className="h-3 w-3" />
                Agregar retención
              </Button>
            </div>

            <p className="mb-2.5 text-[11.5px] text-ink-muted">
              {esCobro
                ? "Cancelan la factura pero no entran a la caja: son crédito fiscal."
                : "Cancelan el comprobante pero no salen de la caja: se depositan a AFIP aparte."}
            </p>

            {retenciones.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-[12px] text-ink-faint">
                Sin retenciones.
              </p>
            ) : (
              <div className="space-y-2">
                {retenciones.map((r, i) => {
                  const cambiar = (cambios: Partial<RenglonRetencion>) =>
                    setRetenciones((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, ...cambios } : x))
                    )

                  return (
                    <div
                      key={i}
                      className="grid items-end gap-2 rounded-lg border border-line bg-surface-subtle p-2.5 sm:grid-cols-[140px_minmax(0,1fr)_120px_36px]"
                    >
                      <Campo id={`ret-tipo-${i}`} rotulo="Impuesto">
                        <select
                          id={`ret-tipo-${i}`}
                          value={r.tipo}
                          onChange={(e) => {
                            const tipo = e.target.value as Retencion
                            // Al dejar de ser IIBB la jurisdicción no aplica, y
                            // dejarla puesta haría que el servidor la rechace.
                            cambiar({
                              tipo,
                              jurisdiccion: tipo === "iibb" ? (r.jurisdiccion ?? "caba") : null,
                            })
                          }}
                          disabled={guardando}
                          className="h-8 w-full rounded-lg border border-line-strong bg-surface px-2 text-[12px] text-ink"
                        >
                          {RETENCIONES.map((k) => (
                            <option key={k} value={k}>
                              {RETENCION_LABEL[k]}
                            </option>
                          ))}
                        </select>
                      </Campo>

                      {/* Solo Ingresos Brutos es provincial. Es la apertura que
                          pidieron: IIBB CABA e IIBB Bs As como dos renglones. */}
                      {r.tipo === "iibb" ? (
                        <Campo id={`ret-jur-${i}`} rotulo="Jurisdicción">
                          <select
                            id={`ret-jur-${i}`}
                            value={r.jurisdiccion ?? "caba"}
                            onChange={(e) =>
                              cambiar({ jurisdiccion: e.target.value as Jurisdiccion })
                            }
                            disabled={guardando}
                            className="h-8 w-full rounded-lg border border-line-strong bg-surface px-2 text-[12px] text-ink"
                          >
                            {JURISDICCIONES.map((j) => (
                              <option key={j} value={j}>
                                {JURISDICCION_LABEL[j]}
                              </option>
                            ))}
                          </select>
                        </Campo>
                      ) : (
                        <Campo id={`ret-cert-${i}`} rotulo="Certificado" opcional>
                          <Input
                            id={`ret-cert-${i}`}
                            value={r.numeroCertificado}
                            onChange={(e) => cambiar({ numeroCertificado: e.target.value })}
                            placeholder="N° de certificado"
                            className="h-8 text-[12px]"
                            disabled={guardando}
                          />
                        </Campo>
                      )}

                      <Campo id={`ret-imp-${i}`} rotulo="Importe">
                        <Input
                          id={`ret-imp-${i}`}
                          value={r.importe}
                          onChange={(e) => cambiar({ importe: e.target.value })}
                          placeholder="0,00"
                          inputMode="decimal"
                          className="num h-8 text-right text-[12px]"
                          disabled={guardando}
                        />
                      </Campo>

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setRetenciones((prev) => prev.filter((_, j) => j !== i))}
                        disabled={guardando}
                        aria-label="Quitar la retención"
                        className="mb-0.5 text-ink-faint hover:bg-danger-soft hover:text-danger-text"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Medios de pago */}
          <section>
            <div className="mb-2.5 flex items-center justify-between">
              <p className="eyebrow">{esCobro ? "Por dónde entró" : "De dónde salió"}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setMedios((prev) => [...prev, { cuentaId: "", importe: "", referencia: "" }])
                }
                disabled={guardando}
              >
                <Plus className="h-3.5 w-3.5" />
                Otro medio
              </Button>
            </div>

            <div className="space-y-2">
              {medios.map((m, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    value={m.cuentaId}
                    onChange={(e) =>
                      setMedios((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, cuentaId: e.target.value } : x))
                      )
                    }
                    disabled={guardando}
                    className="h-9 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-[12.5px] text-ink disabled:opacity-60"
                  >
                    <option value="">Elegí la cuenta…</option>
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} ({c.moneda})
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-1">
                    <Input
                      value={m.importe}
                      onChange={(e) =>
                        setMedios((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, importe: e.target.value } : x))
                        )
                      }
                      placeholder="0,00"
                      inputMode="decimal"
                      className="num w-32 text-right"
                      disabled={guardando}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => completarMedio(i)}
                      disabled={guardando}
                      title="Completar con lo que falta"
                    >
                      Resto
                    </Button>
                  </div>

                  <Input
                    value={m.referencia}
                    onChange={(e) =>
                      setMedios((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, referencia: e.target.value } : x))
                      )
                    }
                    placeholder="Nº transferencia o cheque"
                    className="w-full sm:w-56"
                    disabled={guardando}
                  />

                  {medios.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setMedios((prev) => prev.filter((_, j) => j !== i))}
                      disabled={guardando}
                      aria-label="Quitar medio"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <Campo id="observaciones" rotulo="Observaciones" opcional>
            <Textarea
              id="observaciones"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value.slice(0, 1000))}
              className="min-h-[56px]"
              disabled={guardando}
            />
          </Campo>
        </div>

        {/* La ecuación, siempre a la vista */}
        <div className="shrink-0 border-t border-line bg-surface-subtle px-5 py-4 sm:px-6">
          <div
            className={cn(
              "mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border px-3.5 py-2.5",
              balance.cuadra
                ? "border-success-line bg-success-soft/50"
                : "border-warning-line bg-warning-soft/50"
            )}
          >
            <Cifra rotulo="Cancela" valor={balance.imputado} moneda={moneda} />
            <span className="text-ink-faint">=</span>
            <Cifra rotulo={esCobro ? "Entró" : "Salió"} valor={balance.medios} moneda={moneda} />
            <span className="text-ink-faint">+</span>
            <Cifra rotulo="Retenciones" valor={balance.retenciones} moneda={moneda} />

            <span className="ml-auto text-[12px] font-semibold">
              {balance.cuadra ? (
                <span className="text-success-text">El recibo cuadra</span>
              ) : (
                <span className="num text-warning-text">
                  Diferencia {formatearImporte(balance.diferencia, moneda)}
                </span>
              )}
            </span>
          </div>

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
              Registrar {tipo}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Piezas ───────────────────────────────────────────────────────────────── */

function FilaPendiente({
  p,
  valor,
  monedaRecibo,
  tc,
  primera,
  disabled,
  onValor,
  onSaldar,
}: {
  p: Pendiente
  valor: string
  monedaRecibo: Moneda
  tc: number
  primera: boolean
  disabled?: boolean
  onValor: (v: string) => void
  onSaldar: () => void
}) {
  const importe = parsearImporte(valor) ?? 0
  const excede = importe > p.saldo + 0.01
  const enRecibo = importe > 0 ? convertir(importe, p.moneda, monedaRecibo, tc) : 0

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-2.5",
        !primera && "border-t border-line-soft",
        importe > 0 && "bg-brand-50/50"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={p.signo === -1 ? "warning" : "neutral"} size="sm">
            {p.clase}
          </Badge>
          <span className="num text-[12px] text-ink-secondary">
            {formatearNumero(p.puntoVenta, p.numero)}
          </span>
          <SemaforoVencimiento fecha={p.fechaVencimiento} compacto />
        </div>
        {p.detalle && (
          <p className="mt-0.5 truncate text-[11.5px] text-ink-muted">{p.detalle}</p>
        )}
      </div>

      <div className="text-right">
        <p className="eyebrow">Saldo</p>
        <p className="num text-[12.5px] font-semibold text-ink">
          {formatearImporte(p.saldo, p.moneda)}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <div>
          <Input
            value={valor}
            onChange={(e) => onValor(e.target.value)}
            placeholder="0,00"
            inputMode="decimal"
            disabled={disabled}
            className={cn("num h-8 w-32 text-right text-[12px]", excede && "border-danger-line")}
            aria-label={`Importe a imputar a ${p.clase} ${formatearNumero(p.puntoVenta, p.numero)}`}
          />
          {/* El contravalor solo cuando las monedas difieren: si no, es ruido. */}
          {p.moneda !== monedaRecibo && importe > 0 && (
            <p className="num mt-0.5 text-right text-[10.5px] text-ink-muted">
              = {formatearImporte(enRecibo, monedaRecibo)}
            </p>
          )}
          {excede && (
            <p className="mt-0.5 text-right text-[10.5px] text-danger-text">
              Supera el saldo
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSaldar}
          disabled={disabled}
          title="Imputar el saldo completo"
        >
          Todo
        </Button>
      </div>
    </div>
  )
}

function Cifra({
  rotulo,
  valor,
  moneda,
}: {
  rotulo: string
  valor: number
  moneda: Moneda
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-subtle">
        {rotulo}
      </span>
      <span className="num text-[13px] font-semibold text-ink">
        {formatearImporte(valor, moneda)}
      </span>
    </span>
  )
}

function SelectorEntidad({
  tipo,
  cliente,
  disabled,
  onElegir,
}: {
  tipo: TipoPago
  cliente: Cliente | null
  disabled?: boolean
  onElegir: (c: Cliente) => void
}) {
  const [q, setQ] = useState("")
  const [abierto, setAbierto] = useState(false)
  const [resultados, setResultados] = useState<Cliente[]>([])
  const recurso = tipo === "cobro" ? "clientes" : "proveedores"

  useEffect(() => {
    if (!abierto) return
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ porPagina: "8", estado: "activos" })
        if (q.trim()) params.set("q", q.trim())
        const res = await fetch(`/api/admin/${recurso}?${params}`)
        const data = await res.json()
        setResultados(data[recurso] ?? [])
      } catch {
        setResultados([])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, abierto, recurso])

  return (
    <div className="relative">
      <label htmlFor="cliente-cobro" className="text-[12.5px] font-semibold text-ink">
        {tipo === "cobro" ? "Cliente" : "Proveedor"}
      </label>
      <div className="relative mt-1.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
        <Input
          id="cliente-cobro"
          value={abierto ? q : (cliente?.razonSocial ?? "")}
          onChange={(e) => {
            setQ(e.target.value)
            setAbierto(true)
          }}
          onFocus={() => {
            setQ("")
            setAbierto(true)
          }}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          placeholder="Buscar por razón social o CUIT…"
          className={cn("pl-9", cliente && !abierto && "font-medium")}
          disabled={disabled}
          autoComplete="off"
        />
      </div>

      {abierto && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-e3">
          {resultados.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-ink-muted">Sin resultados</p>
          ) : (
            resultados.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={() => onElegir(c)}
                className="flex w-full flex-col items-start px-3 py-2 text-left transition-colors hover:bg-brand-50"
              >
                <span className="text-[13px] font-medium text-ink">{c.razonSocial}</span>
                {c.cuit && (
                  <span className="num text-[11px] text-ink-muted">{formatearCuit(c.cuit)}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

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
