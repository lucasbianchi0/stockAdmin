"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, FileText, Loader2, Plus, Trash2, X } from "lucide-react"

import { CampoMoneda } from "@/components/admin/campo-moneda"
import { MarcoFormulario } from "@/components/admin/marco-formulario"
import { SelectorCuenta } from "@/components/admin/selector-cuenta"
import { SelectorEntidad } from "@/components/admin/selector-entidad"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
import {
  MONEDAS,
  NOMBRE_MONEDA,
  formatearImporte,
  formatearTc,
  parsearImporte,
  redondear,
  type Moneda,
} from "@/lib/admin/moneda"
import { sumarDias } from "@/lib/admin/fecha"
import type { Impacto } from "@/lib/admin/impacto"
import { useInvalidarAdmin } from "@/lib/admin/query"
import { useCotizacion } from "@/lib/admin/use-cotizacion"
import { cn } from "@/lib/utils"

/**
 * Un tramo de neto gravado a una alícuota, como lo tipea el usuario.
 *
 * Todo texto, igual que el resto del formulario: el parseo a número pasa una sola
 * vez, en los cálculos, y así un campo a medio escribir no se convierte en cero
 * mientras se escribe.
 */
type RenglonNeto = {
  neto: string
  alicuota: string
  ivaManual: string
  /** El IVA se calcula solo hasta que alguien lo toca. A partir de ahí manda el
   *  número escrito: el IVA de la factura de papel es la verdad, aunque no dé
   *  exacto por redondeo del sistema que la emitió. */
  ivaPisado: boolean
  /** Vacío = la cuenta de la cabecera. */
  cuentaContableId: string
}

const RENGLON_VACIO = (alicuota = "0.21"): RenglonNeto => ({
  neto: "",
  alicuota,
  ivaManual: "",
  ivaPisado: false,
  cuentaContableId: "",
})

type Borrador = {
  entidadId: string
  clienteNombre: string
  clase: string
  fecha: string
  fechaVencimiento: string
  numeroCompleto: string
  detalle: string
  moneda: Moneda
  tc: string
  /** El neto gravado, abierto por alícuota. Arranca con un renglón —el caso de
   *  siempre— y se agregan los que la factura traiga. */
  netos: RenglonNeto[]
  noGravado: string
  cuentaNoGravadoId: string
  exento: string
  cuentaExentoId: string
  percepcionIva: string
  percepcionIibbBsas: string
  percepcionIibbCaba: string
  otrosImpuestos: string
  condicionPago: string
  observaciones: string
}

const hoyISO = () => new Date().toISOString().slice(0, 10)

/** Importe · alícuota · IVA · cuenta. La cuenta es la más ancha porque su
 *  rótulo es texto («809 · Ventas de Servicios») y los importes no. No gravado y
 *  exento usan la misma grilla para que sus cuentas queden en la misma columna. */
const GRILLA_IMPORTES =
  "grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1.5fr)]"

const VACIO = (): Borrador => ({
  entidadId: "",
  clienteNombre: "",
  clase: "FCA",
  fecha: hoyISO(),
  fechaVencimiento: "",
  numeroCompleto: "",
  detalle: "",
  moneda: "ARS",
  tc: "",
  netos: [RENGLON_VACIO()],
  noGravado: "",
  cuentaNoGravadoId: "",
  exento: "",
  cuentaExentoId: "",
  percepcionIva: "",
  percepcionIibbBsas: "",
  percepcionIibbCaba: "",
  otrosImpuestos: "",
  condicionPago: "",
  observaciones: "",
})

function aBorrador(c: Comprobante): Borrador {
  // El desglose guardado manda. Una factura vieja no lo tiene, y entonces se
  // arma el renglón único con el par de la cabecera, que es lo que era.
  const netos: RenglonNeto[] =
    c.ivas.length > 0
      ? c.ivas.map((r) => ({
          neto: String(r.neto || ""),
          alicuota: String(r.alicuota),
          ivaManual: String(r.iva || ""),
          ivaPisado: true,
          cuentaContableId: r.cuentaContableId ?? "",
        }))
      : [
          {
            neto: String(c.netoGravado || ""),
            alicuota: c.alicuotaIva !== null ? String(c.alicuotaIva) : "0",
            ivaManual: String(c.iva || ""),
            ivaPisado: true,
            cuentaContableId: "",
          },
        ]

  /**
   * La cuenta de la cabecera baja al primer renglón.
   *
   * Desde que el formulario no muestra la cuenta de la factura —la de arriba era
   * el mismo campo dos veces— la cabecera se deduce de los renglones. Una
   * factura cargada antes de ese cambio tiene la cuenta arriba y los renglones
   * vacíos: sin esto, abrirla y volver a guardarla la dejaría sin imputar y
   * caería en los pendientes de Contabilidad sin que nadie tocara nada.
   *
   * Solo cuando no hay ninguna otra cuenta elegida: si el renglón ya trae la
   * suya, manda la del renglón.
   */
  const sinCuentaPropia =
    netos.every((r) => !r.cuentaContableId) && !c.cuentaNoGravadoId && !c.cuentaExentoId
  if (sinCuentaPropia && c.cuentaContableId) {
    netos[0] = { ...netos[0], cuentaContableId: c.cuentaContableId }
  }

  return {
    // Un comprobante tiene cliente o proveedor, nunca los dos: el que no
    // corresponde viene en null. Leer sólo `clienteId` dejaba el buscador vacío
    // en toda factura de compra, y con él vacío «Guardar y confirmar» queda
    // deshabilitado — o sea que ninguna compra se podía editar.
    entidadId: c.clienteId ?? c.proveedorId ?? "",
    clienteNombre: c.clienteNombre ?? c.proveedorNombre ?? "",
    clase: c.clase,
    fecha: c.fecha,
    fechaVencimiento: c.fechaVencimiento ?? "",
    numeroCompleto: formatearNumero(c.puntoVenta, c.numero).replace("—", ""),
    detalle: c.detalle ?? "",
    moneda: c.moneda,
    tc: c.moneda === "USD" ? String(c.tc) : "",
    netos,
    noGravado: String(c.noGravado || ""),
    cuentaNoGravadoId: c.cuentaNoGravadoId ?? "",
    exento: String(c.exento || ""),
    cuentaExentoId: c.cuentaExentoId ?? "",
    percepcionIva: String(c.percepcionIva || ""),
    percepcionIibbBsas: String(c.percepcionIibbBsas || ""),
    percepcionIibbCaba: String(c.percepcionIibbCaba || ""),
    otrosImpuestos: String(c.otrosImpuestos || ""),
    condicionPago: c.condicionPago ?? "",
    observaciones: c.observaciones ?? "",
  }
}

export function ComprobanteDialog({
  abierto,
  tipo,
  comprobante,
  embebido = false,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean
  /** venta = la emitimos nosotros, compra = la recibimos. Cambia el maestro
   *  contra el que se busca, las clases ofrecidas y los rótulos. */
  tipo: TipoComprobante
  comprobante: Comprobante | null
  /** En la pantalla de carga de compras el formulario no es un modal sino la
   *  pantalla: sin fondo, sin cruz, y «Cancelar» pasa a ser «Limpiar» porque no
   *  hay nada atrás a donde volver. Ver `MarcoFormulario`. */
  embebido?: boolean
  onCerrar: () => void
  /** El tercer argumento es el resumen de lo que se movió en otros módulos.
   *  Llega sólo cuando el alta quedó confirmada: un borrador no mueve nada. */
  onGuardado: (c: Comprobante, esNuevo: boolean, impacto: Impacto | null) => void
}) {
  const [f, setF] = useState<Borrador>(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cotizacion = useCotizacion()
  const invalidar = useInvalidarAdmin()
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
    // Solo como modal. Embebido, Escape vaciaría un formulario a medio llenar
    // sin que nadie haya pedido cerrar nada.
    if (embebido) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !guardando) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [embebido, onCerrar, guardando])

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) =>
    setF((prev) => ({ ...prev, [k]: v }))

  /* ── Cálculos ────────────────────────────────────────────────────────────── */

  const tc = parsearImporte(f.tc) ?? 0

  /** Cada renglón resuelto: su neto, su alícuota y el IVA que le corresponde
   *  —calculado, o el escrito a mano si alguien lo pisó—. */
  const renglones = useMemo(
    () =>
      f.netos.map((r) => {
        const neto = parsearImporte(r.neto) ?? 0
        const alicuota = Number(r.alicuota) || 0
        const calculado = ivaDe(neto, alicuota)
        return {
          neto,
          alicuota,
          cuentaContableId: r.cuentaContableId,
          calculado,
          iva: r.ivaPisado ? (parsearImporte(r.ivaManual) ?? 0) : calculado,
        }
      }),
    [f.netos]
  )

  const neto = redondear(renglones.reduce((a, r) => a + r.neto, 0))
  const iva = redondear(renglones.reduce((a, r) => a + r.iva, 0))

  /** Dos renglones a la misma alícuota y la misma cuenta son el mismo tramo
   *  escrito dos veces. Al 21 % con cuentas distintas —productos y servicios en
   *  la misma factura— son dos renglones legítimos. */
  const alicuotaRepetida = useMemo(() => {
    // El renglón sin cuenta hereda la del primero, así que para comparar cuenta
    // como si la tuviera puesta: si no, dos tramos al 21 % —uno con cuenta y el
    // otro heredándola— parecerían distintos y son el mismo.
    const heredada = f.netos[0]?.cuentaContableId ?? ""
    const vistas = new Set<string>()
    for (const r of renglones) {
      if (r.neto <= 0 && r.iva <= 0) continue
      const clave = `${r.alicuota}|${r.cuentaContableId || heredada}`
      if (vistas.has(clave)) return true
      vistas.add(clave)
    }
    return false
  }, [renglones, f.netos])

  const importes = useMemo(
    () => ({
      netoGravado: neto,
      alicuotaIva: renglones.length === 1 ? renglones[0].alicuota : 0,
      iva,
      noGravado: parsearImporte(f.noGravado) ?? 0,
      exento: parsearImporte(f.exento) ?? 0,
      percepcionIva: parsearImporte(f.percepcionIva) ?? 0,
      percepcionIibbBsas: parsearImporte(f.percepcionIibbBsas) ?? 0,
      percepcionIibbCaba: parsearImporte(f.percepcionIibbCaba) ?? 0,
      otrosImpuestos: parsearImporte(f.otrosImpuestos) ?? 0,
    }),
    [
      neto,
      iva,
      renglones,
      f.noGravado,
      f.exento,
      f.percepcionIva,
      f.percepcionIibbBsas,
      f.percepcionIibbCaba,
      f.otrosImpuestos,
    ]
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

  // Un importe sin cuenta propia va a la del primer renglón; el placeholder lo
  // dice, y por eso se ofrece recién cuando ese primer renglón tiene una.
  const cuentaPrincipal = f.netos[0]?.cuentaContableId ?? ""
  const placeholderCuenta = cuentaPrincipal
    ? "La del primer renglón"
    : "Buscar por código o nombre…"
  const puedeGuardar =
    Boolean(f.entidadId) && total > 0 && !faltaTc && !alicuotaRepetida && !guardando

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
            // Sin cuenta de cabecera: la API la completa con la primera de
            // los renglones. Mandarla desde acá la haría ganar sobre lo que el
            // usuario eligió abajo, que es lo único que ahora se ve en pantalla.
            cuentaContableId: null,
            detalle: f.detalle,
            moneda: f.moneda,
            tc: tc > 0 ? tc : null,
            estado,
            ...importes,
            // El desglose por alícuota. `importes` sigue mandando el neto y el
            // IVA sumados: el servidor prefiere esta lista, y los agregados
            // quedan para que el payload se explique solo.
            netos: renglones
              .filter((r) => r.neto > 0 || r.iva > 0)
              .map((r) => ({
                neto: r.neto,
                alicuota: r.alicuota,
                iva: r.iva,
                cuentaContableId: r.cuentaContableId || null,
              })),
            cuentaNoGravadoId: f.cuentaNoGravadoId || null,
            cuentaExentoId: f.cuentaExentoId || null,
            condicionPago: f.condicionPago,
            observaciones: f.observaciones,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar")
      // Acá y no en cada pantalla que abre el formulario: una factura mueve la
      // cuenta corriente, los pendientes de cobro y el mayor.
      void invalidar()
      onGuardado(
        data.comprobante as Comprobante,
        !editando,
        (data.impacto as Impacto | null) ?? null
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <MarcoFormulario
      embebido={embebido}
      etiqueta={
        editando
          ? "Editar comprobante"
          : `Nuevo comprobante de ${esCompra ? "compra" : "venta"}`
      }
      alto="max-h-[94vh] sm:max-h-[90vh]"
      onFondo={() => !guardando && onCerrar()}
    >
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
        {!embebido && (
          <button
            onClick={onCerrar}
            disabled={guardando}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
        {/* ── Quién y qué ──────────────────────────────────────────────── */}
        <Seccion titulo="Comprobante">
          <SelectorEntidad
            id="cliente"
            tipo={esCompra ? "proveedor" : "cliente"}
            valor={f.entidadId}
            nombre={f.clienteNombre}
            disabled={guardando}
            // Cargar a mano la factura de un proveedor nuevo tiene que ser
            // posible sin abandonar la carga: la carga por PDF ya lo permitía
            // y esta pantalla no, que era una asimetría sin defensa.
            permitirAlta
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
                  // La cuenta contable que la ficha tiene guardada, puesta en
                  // el primer renglón. Es lo que hace que las 224 cuentas del
                  // plan no se sientan: elegido el proveedor, la imputación ya
                  // está puesta y solo se toca cuando la factura es la
                  // excepción. Va al renglón y no a la cabecera porque la
                  // cabecera ya no se muestra ni se manda: se deduce de acá.
                  // No pisa lo que ya estaba elegido — si alguien la corrigió a
                  // mano, gana.
                  netos: prev.netos.map((r, i) =>
                    i === 0 && !r.cuentaContableId
                      ? { ...r, cuentaContableId: c.cuentaContableId ?? "" }
                      : r
                  ),
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

            {/* Acá había una segunda "Cuenta contable", la de la factura entera.
                Era el mismo campo dos veces: abajo, al lado de cada importe, ya
                está la que de verdad manda, y tener las dos obligaba a decidir
                cuál usar antes de entender que una era el default de la otra.
                La cabecera sigue existiendo en la base —el motor de asientos la
                necesita— pero se deduce sola de los renglones. */}
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
          {/*
            El neto gravado, un renglón por alícuota.

            Una factura real trae parte al 21 % y parte al 27 %, y con un solo par
            había que elegir cuál mentir — con el IVA entero imputado a una cuenta
            que no era. Arranca con un renglón, que es el caso de siempre y se ve
            igual que antes; los demás se agregan sólo cuando la factura los pide.
          */}
          <div className="space-y-2">
            {f.netos.map((r, i) => {
              const calc = renglones[i]?.calculado ?? 0
              const cambiar = (cambio: Partial<RenglonNeto>) =>
                setF((prev) => ({
                  ...prev,
                  netos: prev.netos.map((x, j) => (j === i ? { ...x, ...cambio } : x)),
                }))

              return (
                <div key={i} className={GRILLA_IMPORTES}>
                  <Campo
                    id={`neto-${i}`}
                    rotulo={i === 0 ? "Neto gravado" : `Neto gravado del tramo ${i + 1}`}
                    rotuloOculto={i > 0}
                  >
                    <CampoMoneda
                      id={`neto-${i}`}
                      valor={r.neto}
                      onChange={(v) => cambiar({ neto: v })}
                      moneda={f.moneda}
                      tc={tc}
                      disabled={guardando}
                    />
                  </Campo>

                  <Campo
                    id={`alicuota-${i}`}
                    rotulo={i === 0 ? "Alícuota IVA" : `Alícuota IVA del tramo ${i + 1}`}
                    rotuloOculto={i > 0}
                  >
                    <Select
                      id={`alicuota-${i}`}
                      value={r.alicuota}
                      // Cambiar la alícuota devuelve el IVA al cálculo: si alguien
                      // la corrige, lo que quiere es el IVA nuevo, no el viejo.
                      onChange={(v) => cambiar({ alicuota: v, ivaPisado: false })}
                      disabled={guardando}
                      opciones={ALICUOTAS.map((a) => ({
                        valor: String(a),
                        etiqueta: ALICUOTA_LABEL[String(a)],
                      }))}
                    />
                  </Campo>

                  <Campo
                    id={`iva-${i}`}
                    rotulo={i === 0 ? "IVA" : `IVA del tramo ${i + 1}`}
                    rotuloOculto={i > 0}
                    ayuda={
                      i === 0 ? (r.ivaPisado ? "Editado a mano" : "Calculado") : undefined
                    }
                  >
                    <CampoMoneda
                      id={`iva-${i}`}
                      valor={r.ivaPisado ? r.ivaManual : calc ? String(calc) : ""}
                      onChange={(v) => cambiar({ ivaManual: v, ivaPisado: true })}
                      moneda={f.moneda}
                      tc={tc}
                      disabled={guardando}
                    />
                  </Campo>

                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <Campo
                        id={`cuenta-${i}`}
                        rotulo={i === 0 ? "Cuenta contable" : `Cuenta contable del tramo ${i + 1}`}
                        rotuloOculto={i > 0}
                      >
                        <SelectorCuenta
                          id={`cuenta-${i}`}
                          valor={r.cuentaContableId}
                          onElegir={(v) => cambiar({ cuentaContableId: v })}
                          disabled={guardando}
                          // El primero no puede heredarse a sí mismo.
                          placeholder={i === 0 ? undefined : placeholderCuenta}
                          tipoSugerido={esCompra ? "egreso" : "ingreso"}
                        />
                      </Campo>
                    </div>

                    {/* Sólo con más de un renglón: con uno solo, el botón de
                        borrar sobre el caso normal es ruido. */}
                    {f.netos.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setF((prev) => ({
                            ...prev,
                            netos: prev.netos.filter((_, j) => j !== i),
                          }))
                        }
                        disabled={guardando}
                        aria-label={`Quitar el tramo ${i + 1}`}
                        title="Quitar este tramo"
                        className="mb-[1px] shrink-0 text-ink-muted hover:text-danger-text"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setF((prev) => ({
                  ...prev,
                  // Se propone una alícuota que no esté usada: agregar un tramo
                  // repetido no sirve para nada y la base lo rechaza.
                  netos: [
                    ...prev.netos,
                    RENGLON_VACIO(
                      String(
                        ALICUOTAS.find(
                          (a) => a > 0 && !prev.netos.some((x) => Number(x.alicuota) === a)
                        ) ?? 0
                      )
                    ),
                  ],
                }))
              }
              disabled={guardando}
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar renglón
            </Button>

            {f.netos.length > 1 && (
              <p className="num text-[11.5px] text-ink-muted">
                Neto {formatearImporte(neto, f.moneda)} · IVA {formatearImporte(iva, f.moneda)}
              </p>
            )}

            {alicuotaRepetida && (
              <p className="text-[11.5px] text-danger-text">
                Hay dos tramos con la misma alícuota y la misma cuenta: juntalos en uno solo.
              </p>
            )}
          </div>

          {/* No gravado y exento, cada uno con su cuenta en la misma columna que
              la de los tramos gravados. */}
          <div className={GRILLA_IMPORTES}>
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
            <div className="sm:col-start-4">
              <Campo id="cuentaNoGravadoId" rotulo="Cuenta del no gravado" rotuloOculto>
                <SelectorCuenta
                  id="cuentaNoGravadoId"
                  valor={f.cuentaNoGravadoId}
                  onElegir={(v) => set("cuentaNoGravadoId", v)}
                  disabled={guardando}
                  placeholder={placeholderCuenta}
                  tipoSugerido={esCompra ? "egreso" : "ingreso"}
                />
              </Campo>
            </div>
          </div>

          <div className={GRILLA_IMPORTES}>
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
            <div className="sm:col-start-4">
              <Campo id="cuentaExentoId" rotulo="Cuenta del exento" rotuloOculto>
                <SelectorCuenta
                  id="cuentaExentoId"
                  valor={f.cuentaExentoId}
                  onElegir={(v) => set("cuentaExentoId", v)}
                  disabled={guardando}
                  placeholder={placeholderCuenta}
                  tipoSugerido={esCompra ? "egreso" : "ingreso"}
                />
              </Campo>
            </div>
          </div>

          {/* Ingresos Brutos va abierto por jurisdicción y no en un campo
              único con un selector al lado: una misma factura puede traer las
              dos, y cada una imputa contra su propia cuenta —50 BS AS y 51
              CABA—. Es el punto 3 del pliego de compras. */}
          <div className="grid gap-4 sm:grid-cols-4">
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
            <Campo id="percepcionIibbBsas" rotulo="Percep. IIBB Bs. As." opcional>
              <CampoMoneda
                id="percepcionIibbBsas"
                valor={f.percepcionIibbBsas}
                onChange={(v) => set("percepcionIibbBsas", v)}
                moneda={f.moneda}
                tc={tc}
                disabled={guardando}
              />
            </Campo>
            <Campo id="percepcionIibbCaba" rotulo="Percep. IIBB CABA" opcional>
              <CampoMoneda
                id="percepcionIibbCaba"
                valor={f.percepcionIibbCaba}
                onChange={(v) => set("percepcionIibbCaba", v)}
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

        <Campo
          id="observaciones"
          rotulo="Observaciones"
          opcional
          // Aparecen como columna propia en el estado de cuenta de la ficha,
          // que es donde se mira cuando hay que reclamar un saldo. Decirlo acá
          // es lo que hace que se escriba la orden de compra contra la que va
          // la factura, y no una nota suelta que después nadie encuentra.
          ayuda={
            esCompra
              ? "Se ven en el estado de cuenta del proveedor"
              : "Se ven en el estado de cuenta del cliente"
          }
        >
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
            {embebido ? "Limpiar" : "Cancelar"}
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
    </MarcoFormulario>
  )
}

/* ── Piezas ───────────────────────────────────────────────────────────────── */

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
  /**
   * Esconde el rótulo sin sacarlo.
   *
   * Es para las columnas que se repiten —los tramos de neto gravado—, donde
   * repetir «Neto gravado» en cada fila es ruido pero un campo sin etiqueta deja
   * a un lector de pantalla sin saber qué se está tipeando.
   */
  rotuloOculto,
  children,
}: {
  id: string
  rotulo: string
  opcional?: boolean
  ayuda?: string
  rotuloOculto?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <div className={cn("flex items-baseline gap-2", rotuloOculto && "sr-only")}>
        <label htmlFor={id} className="text-[12.5px] font-semibold text-ink">
          {rotulo}
        </label>
        {opcional && <span className="text-[10.5px] text-ink-faint">opcional</span>}
      </div>
      {ayuda && <p className="mt-0.5 text-[11.5px] text-ink-muted">{ayuda}</p>}
      <div className={cn(!rotuloOculto && "mt-1.5")}>{children}</div>
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
