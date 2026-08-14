"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Check, FileText, Loader2, Search, X } from "lucide-react"

import { CampoMoneda } from "@/components/admin/campo-moneda"
import { SelectorCuenta } from "@/components/admin/selector-cuenta"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatearCuit } from "@/lib/admin/cuit"
import {
  ALICUOTAS,
  ALICUOTA_LABEL,
  clasesDe,
  formatearNumero,
  ivaDe,
  parsearNumero,
  totalDe,
  type Comprobante,
  type TipoComprobante,
} from "@/lib/admin/comprobantes"
import type { Cliente } from "@/lib/admin/entidades"
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

type Borrador = {
  entidadId: string
  clienteNombre: string
  clase: string
  fecha: string
  fechaVencimiento: string
  numeroCompleto: string
  cuentaContableId: string
  detalle: string
  moneda: Moneda
  tc: string
  netoGravado: string
  alicuotaIva: string
  ivaManual: string
  /** El IVA se calcula solo hasta que alguien lo toca. A partir de ahí manda el
   *  número escrito: el IVA de la factura de papel es la verdad, aunque no dé
   *  exacto por redondeo del sistema que la emitió. */
  ivaPisado: boolean
  noGravado: string
  exento: string
  percepcionIva: string
  percepcionIibb: string
  otrosImpuestos: string
  condicionPago: string
  observaciones: string
}

const hoyISO = () => new Date().toISOString().slice(0, 10)

const VACIO = (): Borrador => ({
  entidadId: "",
  clienteNombre: "",
  clase: "FCA",
  fecha: hoyISO(),
  fechaVencimiento: "",
  numeroCompleto: "",
  cuentaContableId: "",
  detalle: "",
  moneda: "ARS",
  tc: "",
  netoGravado: "",
  alicuotaIva: "0.21",
  ivaManual: "",
  ivaPisado: false,
  noGravado: "",
  exento: "",
  percepcionIva: "",
  percepcionIibb: "",
  otrosImpuestos: "",
  condicionPago: "",
  observaciones: "",
})

function aBorrador(c: Comprobante): Borrador {
  return {
    entidadId: c.clienteId ?? "",
    clienteNombre: c.clienteNombre ?? "",
    clase: c.clase,
    fecha: c.fecha,
    fechaVencimiento: c.fechaVencimiento ?? "",
    numeroCompleto: formatearNumero(c.puntoVenta, c.numero).replace("—", ""),
    cuentaContableId: c.cuentaContableId ?? "",
    detalle: c.detalle ?? "",
    moneda: c.moneda,
    tc: c.moneda === "USD" ? String(c.tc) : "",
    netoGravado: String(c.netoGravado || ""),
    alicuotaIva: c.alicuotaIva !== null ? String(c.alicuotaIva) : "0",
    ivaManual: String(c.iva || ""),
    ivaPisado: true,
    noGravado: String(c.noGravado || ""),
    exento: String(c.exento || ""),
    percepcionIva: String(c.percepcionIva || ""),
    percepcionIibb: String(c.percepcionIibb || ""),
    otrosImpuestos: String(c.otrosImpuestos || ""),
    condicionPago: c.condicionPago ?? "",
    observaciones: c.observaciones ?? "",
  }
}

export function ComprobanteDialog({
  abierto,
  tipo,
  comprobante,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean
  /** venta = la emitimos nosotros, compra = la recibimos. Cambia el maestro
   *  contra el que se busca, las clases ofrecidas y los rótulos. */
  tipo: TipoComprobante
  comprobante: Comprobante | null
  onCerrar: () => void
  onGuardado: (c: Comprobante, esNuevo: boolean) => void
}) {
  const [f, setF] = useState<Borrador>(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cotizacion = useCotizacion()
  const editando = comprobante !== null
  const esCompra = tipo === "compra"
  const recurso = esCompra ? "compras" : "ventas"
  const rotuloEntidad = esCompra ? "proveedor" : "cliente"
  const clases = clasesDe(tipo)

  useEffect(() => {
    if (!abierto) return
    setF(comprobante ? aBorrador(comprobante) : VACIO())
    setError(null)
  }, [abierto, comprobante])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !guardando) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar, guardando])

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) =>
    setF((prev) => ({ ...prev, [k]: v }))

  /* ── Cálculos ────────────────────────────────────────────────────────────── */

  const tc = parsearImporte(f.tc) ?? 0
  const neto = parsearImporte(f.netoGravado) ?? 0
  const alicuota = Number(f.alicuotaIva) || 0

  // El IVA sugerido; si lo pisaron a mano, gana el número escrito.
  const ivaCalculado = ivaDe(neto, alicuota)
  const iva = f.ivaPisado ? (parsearImporte(f.ivaManual) ?? 0) : ivaCalculado

  const importes = useMemo(
    () => ({
      netoGravado: neto,
      alicuotaIva: alicuota,
      iva,
      noGravado: parsearImporte(f.noGravado) ?? 0,
      exento: parsearImporte(f.exento) ?? 0,
      percepcionIva: parsearImporte(f.percepcionIva) ?? 0,
      percepcionIibb: parsearImporte(f.percepcionIibb) ?? 0,
      otrosImpuestos: parsearImporte(f.otrosImpuestos) ?? 0,
    }),
    [neto, alicuota, iva, f.noGravado, f.exento, f.percepcionIva, f.percepcionIibb, f.otrosImpuestos]
  )

  const total = totalDe(importes)

  // Al pasar a dólares se propone la cotización del día. No pisa un TC que ya
  // estaba escrito: en una factura vieja el dólar de hoy sería el número
  // equivocado.
  useEffect(() => {
    if (f.moneda === "USD" && !f.tc && cotizacion.venta) {
      set("tc", String(cotizacion.venta))
    }
  }, [f.moneda, f.tc, cotizacion.venta])

  if (!abierto) return null

  const faltaTc = f.moneda === "USD" && tc <= 0
  const puedeGuardar = Boolean(f.entidadId) && total > 0 && !faltaTc && !guardando

  const guardar = async (estado: "borrador" | "confirmado") => {
    if (!puedeGuardar) return
    setGuardando(true)
    setError(null)

    const { puntoVenta, numero } = parsearNumero(f.numeroCompleto)

    try {
      const res = await fetch(
        editando ? `/api/admin/${recurso}/${comprobante.id}` : `/api/admin/${recurso}`,
        {
          method: editando ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            entidadId: f.entidadId,
            clase: f.clase,
            fecha: f.fecha,
            fechaVencimiento: f.fechaVencimiento || null,
            puntoVenta,
            numero,
            cuentaContableId: f.cuentaContableId || null,
            detalle: f.detalle,
            moneda: f.moneda,
            tc: tc > 0 ? tc : null,
            estado,
            ...importes,
            condicionPago: f.condicionPago,
            observaciones: f.observaciones,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar")
      onGuardado(data.comprobante as Comprobante, !editando)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editando ? "Editar comprobante" : `Nuevo comprobante de ${esCompra ? "compra" : "venta"}`}
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={() => !guardando && onCerrar()}
      />

      <div className="relative flex max-h-[94vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-6 fade-in-0 duration-250 sm:max-h-[90vh] sm:max-w-3xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <FileText className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
                {editando ? "Editar comprobante" : esCompra ? "Nueva factura de compra" : "Nueva factura de venta"}
              </h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                {esCompra ? "El comprobante que recibiste del proveedor" : "Se registra lo que ya se emitió en AFIP"}
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
          {/* ── Quién y qué ──────────────────────────────────────────────── */}
          <Seccion titulo="Comprobante">
            <SelectorEntidad
              tipo={tipo}
              valor={f.entidadId}
              nombre={f.clienteNombre}
              disabled={guardando}
              onElegir={(c) => {
                setF((prev) => {
                  // La condición de pago de la ficha propone el vencimiento. Es
                  // el dato que ya está cargado y que si no hay que recalcular
                  // a mano en cada factura.
                  const venc =
                    c.condicionPagoDias !== null && prev.fecha
                      ? sumarDias(prev.fecha, c.condicionPagoDias)
                      : prev.fechaVencimiento
                  return {
                    ...prev,
                    entidadId: c.id,
                    clienteNombre: c.razonSocial,
                    fechaVencimiento: venc,
                    condicionPago:
                      c.condicionPagoDias !== null
                        ? `${c.condicionPagoDias} días`
                        : prev.condicionPago,
                    // La cuenta contable que la ficha tiene guardada. Es lo que
                    // hace que las 224 cuentas del plan no se sientan: elegido
                    // el proveedor, la imputación ya está puesta y solo se toca
                    // cuando la factura es la excepción. No pisa lo que ya
                    // estaba elegido — si alguien la corrigió a mano, gana.
                    cuentaContableId:
                      prev.cuentaContableId || (c.cuentaContableId ?? ""),
                  }
                })
              }}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <Campo id="clase" rotulo="Tipo">
                <Select
                  id="clase"
                  value={f.clase}
                  onChange={(v) => set("clase", v)}
                  disabled={guardando}
                  opciones={clases.map((c) => ({
                    valor: c.codigo,
                    etiqueta: `${c.codigo} · ${c.nombre}`,
                  }))}
                />
              </Campo>

              <Campo
                id="numeroCompleto"
                rotulo="Punto de venta y número"
                opcional
                ayuda="Pegá el número tal cual sale de AFIP"
              >
                <Input
                  id="numeroCompleto"
                  value={f.numeroCompleto}
                  onChange={(e) => set("numeroCompleto", e.target.value)}
                  placeholder="00002-00002708"
                  className="num"
                  disabled={guardando}
                />
              </Campo>

              <Campo id="fecha" rotulo="Fecha">
                <Input
                  id="fecha"
                  type="date"
                  value={f.fecha}
                  onChange={(e) => set("fecha", e.target.value)}
                  className="num"
                  disabled={guardando}
                />
              </Campo>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Campo id="fechaVencimiento" rotulo="Vencimiento" opcional>
                <Input
                  id="fechaVencimiento"
                  type="date"
                  value={f.fechaVencimiento}
                  onChange={(e) => set("fechaVencimiento", e.target.value)}
                  className="num"
                  disabled={guardando}
                />
              </Campo>

              <Campo id="condicionPago" rotulo="Condición de pago" opcional>
                <Input
                  id="condicionPago"
                  value={f.condicionPago}
                  onChange={(e) => set("condicionPago", e.target.value)}
                  placeholder="30 días"
                  disabled={guardando}
                />
              </Campo>

              <Campo
                id="cuentaContableId"
                rotulo="Cuenta contable"
                opcional
                ayuda={
                  esCompra
                    ? "Contra qué cuenta va el gasto o la compra"
                    : "Contra qué cuenta va la venta"
                }
              >
                <SelectorCuenta
                  id="cuentaContableId"
                  valor={f.cuentaContableId}
                  onElegir={(v) => set("cuentaContableId", v)}
                  disabled={guardando}
                  // Una compra imputa contra una pérdida y una venta contra una
                  // ganancia. No lo fuerza —hay compras que van a un activo—,
                  // solo pone primero lo que se elige nueve de cada diez veces.
                  tipoSugerido={esCompra ? "egreso" : "ingreso"}
                />
              </Campo>
            </div>

            <Campo id="detalle" rotulo="Detalle" opcional>
              <Input
                id="detalle"
                value={f.detalle}
                onChange={(e) => set("detalle", e.target.value)}
                placeholder="Licencias — Plan Ovalo OC 2589658"
                disabled={guardando}
              />
            </Campo>
          </Seccion>

          {/* ── Moneda ───────────────────────────────────────────────────── */}
          <Seccion titulo="Moneda">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="moneda" rotulo="Moneda de la factura">
                <div className="flex gap-2">
                  {MONEDAS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={guardando}
                      onClick={() => set("moneda", m)}
                      aria-pressed={f.moneda === m}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-colors disabled:opacity-60",
                        f.moneda === m
                          ? "border-brand-300 bg-brand-50 text-brand-700"
                          : "border-line bg-surface text-ink-secondary hover:border-line-strong hover:bg-surface-subtle"
                      )}
                    >
                      {NOMBRE_MONEDA[m]}
                    </button>
                  ))}
                </div>
              </Campo>

              {f.moneda === "USD" && (
                <Campo
                  id="tc"
                  rotulo="Tipo de cambio"
                  ayuda={
                    cotizacion.venta
                      ? `Oficial venta de hoy: ${formatearTc(cotizacion.venta)}`
                      : "Pesos por dólar"
                  }
                >
                  <div className="flex gap-2">
                    <Input
                      id="tc"
                      value={f.tc}
                      onChange={(e) => set("tc", e.target.value)}
                      placeholder="1.435,00"
                      inputMode="decimal"
                      className={cn("num text-right", faltaTc && "border-danger-line")}
                      disabled={guardando}
                    />
                    {cotizacion.venta !== null && (
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => set("tc", String(cotizacion.venta))}
                        disabled={guardando}
                        title="Usar la cotización de hoy"
                      >
                        Hoy
                      </Button>
                    )}
                  </div>
                  {faltaTc && (
                    <p className="mt-1.5 text-[11.5px] text-danger-text">
                      Una factura en dólares necesita tipo de cambio
                    </p>
                  )}
                </Campo>
              )}
            </div>
          </Seccion>

          {/* ── Importes ─────────────────────────────────────────────────── */}
          <Seccion titulo="Importes">
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo id="netoGravado" rotulo="Neto gravado">
                <CampoMoneda
                  id="netoGravado"
                  valor={f.netoGravado}
                  onChange={(v) => set("netoGravado", v)}
                  moneda={f.moneda}
                  tc={tc}
                  disabled={guardando}
                />
              </Campo>

              <Campo id="alicuotaIva" rotulo="Alícuota IVA">
                <Select
                  id="alicuotaIva"
                  value={f.alicuotaIva}
                  onChange={(v) => {
                    // Cambiar la alícuota devuelve el IVA al cálculo: si alguien
                    // la corrige, lo que quiere es el IVA nuevo, no el viejo.
                    setF((prev) => ({ ...prev, alicuotaIva: v, ivaPisado: false }))
                  }}
                  disabled={guardando}
                  opciones={ALICUOTAS.map((a) => ({
                    valor: String(a),
                    etiqueta: ALICUOTA_LABEL[String(a)],
                  }))}
                />
              </Campo>

              <Campo
                id="iva"
                rotulo="IVA"
                ayuda={f.ivaPisado ? "Editado a mano" : "Calculado"}
              >
                <CampoMoneda
                  id="iva"
                  valor={f.ivaPisado ? f.ivaManual : ivaCalculado ? String(ivaCalculado) : ""}
                  onChange={(v) => setF((prev) => ({ ...prev, ivaManual: v, ivaPisado: true }))}
                  moneda={f.moneda}
                  tc={tc}
                  disabled={guardando}
                />
              </Campo>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Campo id="noGravado" rotulo="No gravado" opcional>
                <CampoMoneda
                  id="noGravado"
                  valor={f.noGravado}
                  onChange={(v) => set("noGravado", v)}
                  moneda={f.moneda}
                  tc={tc}
                  disabled={guardando}
                />
              </Campo>
              <Campo id="exento" rotulo="Exento" opcional>
                <CampoMoneda
                  id="exento"
                  valor={f.exento}
                  onChange={(v) => set("exento", v)}
                  moneda={f.moneda}
                  tc={tc}
                  disabled={guardando}
                />
              </Campo>
              <Campo id="otrosImpuestos" rotulo="Otros impuestos" opcional>
                <CampoMoneda
                  id="otrosImpuestos"
                  valor={f.otrosImpuestos}
                  onChange={(v) => set("otrosImpuestos", v)}
                  moneda={f.moneda}
                  tc={tc}
                  disabled={guardando}
                />
              </Campo>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="percepcionIva" rotulo="Percepción IVA" opcional>
                <CampoMoneda
                  id="percepcionIva"
                  valor={f.percepcionIva}
                  onChange={(v) => set("percepcionIva", v)}
                  moneda={f.moneda}
                  tc={tc}
                  disabled={guardando}
                />
              </Campo>
              <Campo id="percepcionIibb" rotulo="Percepción IIBB" opcional>
                <CampoMoneda
                  id="percepcionIibb"
                  valor={f.percepcionIibb}
                  onChange={(v) => set("percepcionIibb", v)}
                  moneda={f.moneda}
                  tc={tc}
                  disabled={guardando}
                />
              </Campo>
            </div>

            {/* El total no se escribe: es la suma. Un total escrito a mano que no
                coincide con sus partes descuadra el libro de IVA, y eso aparece
                recién en la declaración jurada. */}
            <div className="flex items-center justify-between rounded-xl border border-line bg-surface-subtle px-4 py-3">
              <div>
                <p className="eyebrow">Total del comprobante</p>
                <p className="mt-0.5 text-[11.5px] text-ink-muted">
                  Suma de neto, IVA, percepciones y demás
                </p>
              </div>
              <div className="text-right">
                <p className="num text-[19px] font-bold tracking-[-0.02em] text-ink">
                  {formatearImporte(total, f.moneda)}
                </p>
                {f.moneda === "USD" && tc > 0 && (
                  <p className="num text-[11.5px] text-ink-muted">
                    ≈ {formatearImporte(total * tc, "ARS")}
                  </p>
                )}
              </div>
            </div>
          </Seccion>

          <Campo id="observaciones" rotulo="Observaciones" opcional>
            <Textarea
              id="observaciones"
              value={f.observaciones}
              onChange={(e) => set("observaciones", e.target.value.slice(0, 1000))}
              className="min-h-[64px]"
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
          <div className="flex items-center justify-end gap-2">
            {!f.entidadId && (
              <p className="mr-auto text-[11.5px] text-ink-muted">
                Falta elegir el {rotuloEntidad}
              </p>
            )}
            <Button variant="outline" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>

            {/* Dos salidas, y la de la derecha es la que se usa nueve de cada
                diez veces. Guardar como borrador está para cuando falta un dato
                —el número, la cuenta contable— y no se quiere perder lo tipeado:
                queda cargado, visible en el listado, y sin sumar a ningún saldo
                hasta que alguien lo confirme. */}
            {(!editando || comprobante?.estado === "borrador") && (
              <Button
                variant="outline"
                onClick={() => guardar("borrador")}
                disabled={!puedeGuardar}
              >
                {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Guardar como borrador
              </Button>
            )}

            <Button onClick={() => guardar("confirmado")} disabled={!puedeGuardar}>
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editando ? "Guardar y confirmar" : "Registrar y confirmar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Selector de cliente ──────────────────────────────────────────────────── */

/**
 * Buscador con resultados del servidor. Un `<select>` con todos los clientes
 * dejaría de servir apenas pasen los cien, y `datalist` no permite quedarse con
 * el id — que es lo que hay que guardar, no el nombre.
 */
function SelectorEntidad({
  tipo,
  valor,
  nombre,
  disabled,
  onElegir,
}: {
  tipo: TipoComprobante
  valor: string
  nombre: string
  disabled?: boolean
  onElegir: (c: Cliente) => void
}) {
  const [q, setQ] = useState("")
  const [abierto, setAbierto] = useState(false)
  const [resultados, setResultados] = useState<Cliente[]>([])
  const [buscando, setBuscando] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const recurso = tipo === "compra" ? "proveedores" : "clientes"
  const rotulo = tipo === "compra" ? "proveedor" : "cliente"

  useEffect(() => {
    if (!abierto) return
    const t = setTimeout(async () => {
      setBuscando(true)
      try {
        const params = new URLSearchParams({ porPagina: "8", estado: "activos" })
        if (q.trim()) params.set("q", q.trim())
        const res = await fetch(`/api/admin/${recurso}?${params}`)
        const data = await res.json()
        setResultados(data[recurso] ?? [])
      } catch {
        setResultados([])
      } finally {
        setBuscando(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, abierto, recurso])

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener("mousedown", fuera)
    return () => document.removeEventListener("mousedown", fuera)
  }, [])

  return (
    <div ref={caja} className="relative">
      <div className="flex items-baseline gap-2">
        <label htmlFor="cliente" className="text-[12.5px] font-semibold text-ink">
          {rotulo === "proveedor" ? "Proveedor" : "Cliente"}
        </label>
      </div>

      <div className="relative mt-1.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
        <Input
          id="cliente"
          value={abierto ? q : nombre}
          onChange={(e) => {
            setQ(e.target.value)
            setAbierto(true)
          }}
          onFocus={() => {
            setQ("")
            setAbierto(true)
          }}
          placeholder="Buscar por razón social o CUIT…"
          className={cn("pl-9", valor && !abierto && "font-medium")}
          disabled={disabled}
          autoComplete="off"
        />
        {valor && !abierto && (
          <Check className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-success" />
        )}
      </div>

      {abierto && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-e3">
          {buscando && resultados.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-ink-muted">Buscando…</p>
          ) : resultados.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-ink-muted">
              No hay resultados. Cargalo primero en el maestro.
            </p>
          ) : (
            resultados.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onElegir(c)
                  setAbierto(false)
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-brand-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {c.razonSocial}
                  </span>
                  {c.cuit && (
                    <span className="num block text-[11px] text-ink-muted">
                      {formatearCuit(c.cuit)}
                    </span>
                  )}
                </span>
                {c.condicionPagoDias !== null && (
                  <span className="num shrink-0 text-[11px] text-ink-faint">
                    {c.condicionPagoDias} d
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/* ── Piezas ───────────────────────────────────────────────────────────────── */

function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number)
  const f = new Date(a, m - 1, d)
  f.setDate(f.getDate() + dias)
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(
    f.getDate()
  ).padStart(2, "0")}`
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <p className="eyebrow">{titulo}</p>
      {children}
    </section>
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
