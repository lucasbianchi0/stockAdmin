"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeftRight, Loader2, Pencil, Receipt, X } from "lucide-react"

import { MarcoFormulario } from "@/components/admin/marco-formulario"
import { SelectorCuenta } from "@/components/admin/selector-cuenta"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { CuentaFinanciera } from "@/lib/admin/cobros"
import { CATEGORIAS_GASTO, CATEGORIA_LABEL, type Movimiento } from "@/lib/admin/movimientos"
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
 *
 * El mismo formulario **corrige** un movimiento ya cargado (`edicion`). Es el
 * mismo por la misma razón que las tres altas son una sola pantalla: son los
 * mismos campos, y un formulario de edición aparte sería una segunda copia de
 * cada validación esperando a quedarse vieja. Editando cambian tres cosas —el
 * método pasa a PATCH, la transferencia se edita de a una pata, y lo que no se
 * puede tocar aparece deshabilitado con el motivo—; el resto es idéntico.
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
  edicion,
  embebido = false,
  onCerrar,
  onGuardado,
}: {
  modo: null | "gasto" | "transferencia" | "ajuste"
  cuentas: CuentaFinanciera[]
  borrador?: BorradorMovimiento | null
  /** El movimiento que se está corrigiendo. Manda sobre `modo`: con esto puesto
   *  el diálogo se abre en edición aunque `modo` sea null. */
  edicion?: Movimiento | null
  /** Cuando se abre desde el extracto de una cuenta, esa cuenta ya está
   *  elegida. Es la diferencia entre cargar un gasto en dos clics y tener que
   *  volver a decir dónde estás parado. */
  cuentaFijaId?: string
  /** En la pantalla de otros movimientos el formulario no es un modal sino la
   *  pantalla: sin fondo, sin cruz, y «Cancelar» pasa a ser «Limpiar». Ver
   *  `MarcoFormulario`. */
  embebido?: boolean
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
  /** Si alguien tocó el selector de cuenta. Ver el efecto de la moneda. */
  const [cambioLaCuenta, setCambioLaCuenta] = useState(false)

  const cotizacion = useCotizacion()

  /** Editando se edita UNA pata: la transferencia como operación de dos lados
   *  solo existe al darla de alta. */
  const esTransferencia = !edicion && modo === "transferencia"
  /** La plata de un recibo: acá se corrige el renglón, no el importe. */
  const bloqueado = Boolean(edicion?.pagoId)
  const esPataDeTransferencia = edicion?.origen === "transferencia"
  /** Qué campos mostrar. Un ajuste y una pata de transferencia no tienen
   *  categoría; el gasto sí, y es lo que le pone el concepto en el extracto. */
  const conCategoria = edicion ? edicion.origen === "gasto" : modo === "gasto"

  // Al abrir se arranca de cero, o de lo que haya leído la carga inteligente.
  //
  // La cuenta solo viene precargada si el diálogo se abrió desde el extracto de
  // una: ahí no se está inventando el dato, se está usando el que la pantalla ya
  // sabe. Desde la carga inteligente sigue vacía — de qué caja salió la plata no
  // está en el papel, y elegirla por defecto sería inventar el dato más fácil de
  // no mirar.
  useEffect(() => {
    if (!modo && !edicion) return
    setCambioLaCuenta(false)
    setError(null)

    if (edicion) {
      setFecha(edicion.fecha)
      setCuentaId(edicion.cuentaId)
      setCuentaDestinoId("")
      setTipo(edicion.tipo)
      /* El importe vuelve como se cargó y no como quedó guardado: un gasto
         tipeado en dólares sobre la cuenta en pesos se guarda convertido, pero
         lo que hay que poder corregir es el número que alguien escribió. */
      setImporte(String(edicion.importeOrigen ?? edicion.importe))
      setImporteDestino("")
      setMoneda(edicion.monedaOrigen ?? edicion.moneda)
      setMonedaDestino("ARS")
      setTc(edicion.tc === null ? "" : String(edicion.tc))
      setCategoria(edicion.categoria ?? "otros")
      setCuentaContableId(edicion.cuentaContableId ?? "")
      setReferencia(edicion.referencia ?? "")
      setDetalle(edicion.detalle ?? "")
      return
    }

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
  }, [modo, edicion, hoy, borrador, cuentaFijaId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !guardando) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar, guardando])

  /* Al elegir una cuenta se adopta su moneda: una caja en pesos no recibe dólares.
   *
   * Editando no corre hasta que alguien cambia la cuenta a mano. Sin ese
   * guardia, abrir un gasto cargado en dólares sobre la cuenta en pesos pisaría
   * los dólares con la moneda de la cuenta apenas se abre el diálogo, y guardar
   * sin tocar nada convertiría el importe una segunda vez. */
  useEffect(() => {
    if (edicion && !cambioLaCuenta) return
    const c = cuentas.find((x) => x.id === cuentaId)
    if (c) setMoneda(c.moneda)
  }, [cuentaId, cuentas, edicion, cambioLaCuenta])

  useEffect(() => {
    const c = cuentas.find((x) => x.id === cuentaDestinoId)
    if (c) setMonedaDestino(c.moneda)
  }, [cuentaDestinoId, cuentas])

  useEffect(() => {
    const necesitaTc = moneda === "USD" || monedaDestino === "USD"
    if (necesitaTc && !tc && cotizacion.venta) setTc(String(cotizacion.venta))
  }, [moneda, monedaDestino, tc, cotizacion.venta])

  if (!modo && !edicion) return null

  const imp = parsearImporte(importe) ?? 0
  const impDestino = parsearImporte(importeDestino) ?? imp
  const tcNum = parsearImporte(tc) ?? 0
  const cambiaMoneda = esTransferencia && moneda !== monedaDestino

  /** La moneda de la cuenta donde cae el movimiento, que es la que manda. */
  const monedaDeLaCuenta = cuentas.find((c) => c.id === cuentaId)?.moneda ?? moneda
  const necesitaTc = moneda === "USD" || monedaDeLaCuenta === "USD"

  const puedeGuardar = bloqueado
    ? !guardando
    : esTransferencia
      ? Boolean(cuentaId && cuentaDestinoId && cuentaId !== cuentaDestinoId && imp > 0 && !guardando)
      : Boolean(cuentaId && imp > 0 && (!necesitaTc || tcNum > 0) && !guardando)

  const guardar = async () => {
    if (!puedeGuardar) return
    setGuardando(true)
    setError(null)

    try {
      /* Corregir es un PATCH sobre la fila que ya existe, y eso importa más de
         lo que parece: el movimiento conserva su id, y con él la conciliación,
         su número de asiento en el libro diario y cualquier enlace que apunte a
         él. Borrar y volver a cargar —lo único que había hasta ahora— rompía las
         tres cosas para arreglar una fecha.

         Con `pago_id` viaja solo el renglón: el importe de un recibo se corrige
         en el recibo, que sabe rehacer las imputaciones. */
      if (edicion) {
        const cambios = bloqueado
          ? { referencia, detalle }
          : {
              fecha,
              cuentaId,
              tipo,
              importe: imp,
              moneda,
              tc: tcNum || null,
              categoria: conCategoria ? categoria : null,
              cuentaContableId: cuentaContableId || null,
              referencia,
              detalle,
            }

        const res = await fetch(`/api/admin/movimientos/${edicion.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(cambios),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "No se pudo guardar")
        onGuardado()
        return
      }

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

  const titulo = edicion
    ? "Corregir el movimiento"
    : modo === "gasto"
      ? "Otro movimiento"
      : modo === "transferencia"
        ? "Transferencia entre cuentas"
        : "Ajuste manual"

  const bajada = edicion
    ? bloqueado
      ? "Vino de un recibo: acá se corrige el renglón del banco"
      : "El saldo y el asiento se rehacen solos con lo que guardes"
    : modo === "gasto"
      ? "Plata que se mueve sin factura: impuestos, bancarios, sueldos, fondos"
      : esTransferencia
        ? "Mover plata entre cuentas propias, o comprar dólares"
        : "La corrección que no encaja en ninguna otra categoría"

  return (
    <MarcoFormulario
      embebido={embebido}
      etiqueta={titulo}
      alto="max-h-[92vh] sm:max-h-[88vh] sm:max-w-xl"
      onFondo={() => !guardando && onCerrar()}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            {edicion ? (
              <Pencil className="h-[18px] w-[18px]" strokeWidth={1.9} />
            ) : esTransferencia ? (
              <ArrowLeftRight className="h-[18px] w-[18px]" strokeWidth={1.9} />
            ) : (
              <Receipt className="h-[18px] w-[18px]" strokeWidth={1.9} />
            )}
          </div>
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">{titulo}</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">{bajada}</p>
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

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
        {/* Lo que no se puede tocar se muestra deshabilitado con el motivo, en
            vez de simplemente no estar: un campo ausente se lee como una
            limitación del formulario, y uno gris con la razón al lado dice a
            dónde hay que ir a cambiarlo. */}
        {bloqueado && edicion && (
          <div className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2.5">
            <p className="text-[12px] text-warning-text">
              Esta plata la puso un recibo. Acá se corrigen la referencia y el detalle; el
              importe, la fecha y la imputación se cambian editando el recibo, que es el que
              sabe rehacer las facturas que cancela.
            </p>
            <Link
              href={edicion.origen === "cobro" ? "/admin/cobros/listado" : "/admin/pagos/listado"}
              className="mt-1.5 inline-block text-[12px] font-semibold text-brand-700 underline underline-offset-2"
            >
              Ir a {edicion.origen === "cobro" ? "los cobros" : "los pagos"} registrados
            </Link>
          </div>
        )}

        {esPataDeTransferencia && !bloqueado && (
          <p className="rounded-lg border border-line bg-surface-subtle px-3 py-2.5 text-[12px] text-ink-secondary">
            Es una pata de una transferencia. La fecha, la referencia y el detalle se corrigen
            también en la otra cuenta, y el importe solo si las dos patas decían lo mismo — si
            fue una compra de dólares, los dos importes son distintos a propósito.
          </p>
        )}

        <Campo id="fecha" rotulo="Fecha">
          <Input
            id="fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="num"
            disabled={guardando || bloqueado}
          />
        </Campo>

        <Campo id="cuenta" rotulo={esTransferencia ? "Cuenta de origen" : "Cuenta"}>
          <Select
            id="cuenta"
            value={cuentaId}
            onChange={(v) => {
              setCuentaId(v)
              setCambioLaCuenta(true)
            }}
            disabled={guardando || bloqueado || esPataDeTransferencia}
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
                  disabled={guardando || bloqueado || esPataDeTransferencia}
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
              disabled={guardando || bloqueado}
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
            necesitaTc && (
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
                  disabled={guardando || bloqueado}
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

        {/* La cuenta contable aparece también al corregir un ajuste o una
            pata de transferencia, aunque el alta de esos no la pida: es
            exactamente lo que les falta para tener asiento, y esta pantalla es
            donde alguien vuelve después de ver el movimiento en la lista de
            pendientes del contador. */}
        {(conCategoria || (edicion && !bloqueado)) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {conCategoria && (
              <Campo id="categoria" rotulo="Categoría">
                <Select
                  id="categoria"
                  value={categoria}
                  onChange={setCategoria}
                  disabled={guardando || bloqueado}
                  opciones={CATEGORIAS_GASTO.map((c) => ({
                    valor: c,
                    etiqueta: CATEGORIA_LABEL[c],
                  }))}
                />
              </Campo>
            )}

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
                disabled={guardando || bloqueado}
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
            {embebido ? "Limpiar" : "Cancelar"}
          </Button>
          <Button onClick={guardar} disabled={!puedeGuardar}>
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {edicion ? "Guardar cambios" : "Registrar"}
          </Button>
        </div>
      </div>
    </MarcoFormulario>
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
