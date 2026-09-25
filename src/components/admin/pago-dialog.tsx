"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, HandCoins, Loader2, Plus, Trash2, X } from "lucide-react"

import { MarcoFormulario } from "@/components/admin/marco-formulario"
import { SelectorEntidad } from "@/components/admin/selector-entidad"
import { SemaforoVencimiento } from "@/components/admin/semaforo-vencimiento"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatearNumero } from "@/lib/admin/comprobantes"
import {
  JURISDICCIONES,
  JURISDICCION_LABEL,
  RETENCIONES,
  RETENCION_LABEL,
  balancear,
  convertir,
  sumaRetenciones,
  type Cobro,
  type CuentaFinanciera,
  type Pendiente,
  type Jurisdiccion,
  type Retencion,
} from "@/lib/admin/cobros"
import type { TipoPago } from "@/lib/admin/cobros-server"
import {
  MONEDAS,
  NOMBRE_MONEDA,
  formatearImporte,
  formatearTc,
  parsearImporte,
  type Moneda,
} from "@/lib/admin/moneda"
import { claves, pedirJson, useInvalidarAdmin } from "@/lib/admin/query"
import { hoyArgentina } from "@/lib/admin/fecha"
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

/** En horario argentino: `toISOString()` es UTC y desde las 21 h ya dice mañana. */
const hoyISO = hoyArgentina

/** Referencias fijas para "todavía no hay nada": un `[]` nuevo en cada render
 *  dispararía de nuevo los efectos y memos que dependen de la lista. */
const SIN_PENDIENTES: Pendiente[] = []
const SIN_CUENTAS: CuentaFinanciera[] = []

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
  cobro,
  embebido = false,
  onCerrar,
  onGuardado,
}: {
  /** cobro = entra plata de un cliente; pago = sale hacia un proveedor. */
  tipo: TipoPago
  abierto: boolean
  /** El recibo que se está editando, o `null` para uno nuevo. Al editar se
   *  precarga todo —entidad, facturas tildadas, retenciones, medios— y se manda
   *  un PATCH en vez de un POST, conservando el id del recibo. */
  cobro?: Cobro | null
  /** En la pantalla de pagos el formulario no es un modal sino la pantalla:
   *  sin fondo, sin cruz, y «Cancelar» pasa a ser «Limpiar» porque no hay nada
   *  atrás a donde volver. Ver `MarcoFormulario`. */
  embebido?: boolean
  onCerrar: () => void
  onGuardado: () => void
}) {
  const editando = Boolean(cobro)
  const esCobro = tipo === "cobro"
  const recurso = esCobro ? "cobros" : "pagos"
  const rotuloEntidad = esCobro ? "Cliente" : "Proveedor"
  /** Solo lo que el formulario usa de la ficha. Pedir el `Cliente` completo
   *  obligaría a traerla entera del servidor para poder editar un recibo, y de
   *  la ficha acá solo se muestra el nombre. */
  const [cliente, setCliente] = useState<{ id: string; razonSocial: string } | null>(null)
  const [fecha, setFecha] = useState(hoyISO)
  const [moneda, setMoneda] = useState<Moneda>("ARS")
  const [tc, setTc] = useState("")
  /** De quién se buscan los pendientes. `incluirPago` trae también las facturas
   *  que este recibo ya canceló, que por definición dejaron de estar pendientes. */
  const [pedidoPendientes, setPedidoPendientes] = useState<{
    entidadId: string
    incluirPago?: string
  } | null>(null)
  /** comprobanteId → importe imputado, como texto del formulario. */
  const [imputado, setImputado] = useState<Record<string, string>>({})
  /**
   * comprobanteId → el TC con el que se cancela ESA factura.
   *
   * Vacío quiere decir "el de la cabecera", que es el caso normal. Se llena
   * cuando un mismo recibo cancela varias facturas en dólares a distintos
   * dólares —cada una al de su fecha de emisión—, que con un TC único no cierra
   * nunca: la diferencia no viene de la precisión del promedio sino de que dos
   * números distintos se están forzando a ser uno.
   */
  const [tcFactura, setTcFactura] = useState<Record<string, string>>({})
  const [medios, setMedios] = useState<Medio[]>([{ cuentaId: "", importe: "", referencia: "" }])
  /** Los renglones de retención. Arranca vacío: la mayoría de los recibos no
   *  tiene ninguna, y cuatro campos en cero era la forma más rápida de que nadie
   *  leyera ninguno. */
  const [retenciones, setRetenciones] = useState<RenglonRetencion[]>([])
  const [observaciones, setObservaciones] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cotizacion = useCotizacion()
  const invalidar = useInvalidarAdmin()

  const cargarPendientes = useCallback(
    (id: string, incluirPago?: string) => setPedidoPendientes({ entidadId: id, incluirPago }),
    []
  )

  let urlPendientes: string | null = null
  if (pedidoPendientes) {
    const params = new URLSearchParams({ entidadId: pedidoPendientes.entidadId })
    if (pedidoPendientes.incluirPago) params.set("incluirPago", pedidoPendientes.incluirPago)
    urlPendientes = `/api/admin/${recurso}/pendientes?${params}`
  }

  /**
   * Los pendientes de la entidad elegida. Sin refresco al volver a la ventana:
   * con el recibo a medio cargar, que una factura desaparezca de la lista porque
   * alguien la cobró en otra pestaña se llevaría puesto lo imputado sin aviso.
   * Después de guardar sí se refrescan, por la invalidación.
   */
  const pendientesQuery = useQuery({
    queryKey: claves.url(urlPendientes ?? ""),
    queryFn: ({ signal }) =>
      pedirJson<{ pendientes?: Pendiente[]; saldoAFavor?: Record<Moneda, number> }>(
        urlPendientes!,
        { signal }
      ),
    enabled: abierto && urlPendientes !== null,
    refetchOnWindowFocus: false,
  })
  // Un error se muestra como lista vacía, igual que antes.
  const pendientes =
    (urlPendientes && pendientesQuery.data?.pendientes) || SIN_PENDIENTES
  const cargandoPendientes = urlPendientes !== null && pendientesQuery.isLoading

  /** Lo que la ficha tiene a cuenta de recibos anteriores, en la moneda de este
   *  recibo. Es lo único que habilita cancelar más de lo que entra o sale. */
  const saldoAFavor = pendientesQuery.data?.saldoAFavor?.[moneda] ?? 0

  const cuentasQuery = useQuery({
    queryKey: claves.url("/api/admin/cuentas"),
    queryFn: ({ signal }) =>
      pedirJson<{ cuentas?: CuentaFinanciera[] }>("/api/admin/cuentas", { signal }),
    enabled: abierto,
  })
  const cuentas = cuentasQuery.data?.cuentas ?? SIN_CUENTAS

  useEffect(() => {
    if (!abierto) return
    setError(null)

    if (!cobro) {
      setCliente(null)
      setFecha(hoyISO())
      setMoneda("ARS")
      setTc("")
      setPedidoPendientes(null)
      setImputado({})
      setTcFactura({})
      setMedios([{ cuentaId: "", importe: "", referencia: "" }])
      setRetenciones([])
      setObservaciones("")
      return
    }

    // Editar: se repone exactamente lo que el recibo tenía. Las facturas se
    // cargan aparte —el efecto de `cliente`— y `imputado` las espera con los
    // importes ya puestos.
    setCliente({ id: cobro.clienteId, razonSocial: cobro.clienteNombre ?? "" })
    setFecha(cobro.fecha)
    setMoneda(cobro.moneda)
    setTc(cobro.tc ? String(cobro.tc) : "")
    setImputado(
      Object.fromEntries(
        cobro.imputaciones.map((i) => [i.comprobanteId, String(i.importe)] as const)
      )
    )
    // Solo los renglones que se saldaron a un TC propio. El que canceló al TC de
    // la cabecera vuelve con el campo vacío, que es lo que era.
    setTcFactura(
      Object.fromEntries(
        cobro.imputaciones
          .filter((i) => i.tcAplicado !== null && i.tcAplicado !== cobro.tc)
          .map((i) => [i.comprobanteId, String(i.tcAplicado)] as const)
      )
    )
    setMedios(
      cobro.medios.length > 0
        ? cobro.medios.map((m) => ({
            cuentaId: m.cuentaId,
            importe: String(m.importe),
            referencia: m.referencia ?? "",
          }))
        : [{ cuentaId: "", importe: "", referencia: "" }]
    )
    setRetenciones(
      cobro.retenciones.map((r) => ({
        tipo: r.tipo,
        jurisdiccion: r.jurisdiccion,
        importe: String(r.importe),
        numeroCertificado: r.numeroCertificado ?? "",
      }))
    )
    setObservaciones(cobro.observaciones ?? "")
    cargarPendientes(cobro.clienteId, cobro.id)
  }, [abierto, cobro, cargarPendientes])

  /**
   * Cada factura llega con su TC propio ya puesto: el de su fecha de emisión.
   *
   * Es el que se usa nueve de cada diez veces —el cliente paga cada factura al
   * dólar del día en que se emitió— y es además el único con el que la cuenta
   * corriente se cancela por el mismo importe con que se cargó. Tenerlo que
   * tipear a mano en cada renglón sería pedirle al usuario que copie un dato que
   * el sistema ya tiene.
   *
   * Solo se completan los renglones vacíos: lo que el usuario escribió, y lo que
   * un recibo guardado trajo consigo, mandan sobre el valor sugerido.
   */
  useEffect(() => {
    if (pendientes.length === 0) return
    setTcFactura((prev) => {
      const siguiente = { ...prev }
      let hubo = false
      for (const p of pendientes) {
        if (p.moneda === moneda) continue
        if (siguiente[p.id] !== undefined) continue
        if (!p.tc || p.tc <= 0) continue
        siguiente[p.id] = String(p.tc)
        hubo = true
      }
      return hubo ? siguiente : prev
    })
  }, [pendientes, moneda])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !guardando) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar, guardando])


  /* ── Cálculos ────────────────────────────────────────────────────────────── */

  const tcNum = parsearImporte(tc) ?? 0

  /** El TC de una factura: el suyo si le pusieron uno, si no el de la cabecera. */
  const tcDe = useCallback(
    (comprobanteId: string) => parsearImporte(tcFactura[comprobanteId] ?? "") ?? tcNum,
    [tcFactura, tcNum]
  )

  /**
   * Lo imputado, convertido a la moneda del recibo: una factura en dólares se
   * cancela en dólares aunque se cobre en pesos, y cada una al TC que le toca.
   *
   * Las notas de crédito restan, que es lo que dice su signo. Sin eso, aplicar
   * una NC contra la factura que anula —el caso más común de todos: el cliente
   * no paga nada, los dos comprobantes se cancelan entre sí— daba el doble en
   * vez de cero, y el recibo pedía que entrara plata que nadie iba a pagar.
   */
  const totalImputado = useMemo(
    () =>
      pendientes.reduce((acc, p) => {
        const v = parsearImporte(imputado[p.id] ?? "") ?? 0
        if (v <= 0) return acc
        return acc + p.signo * convertir(v, p.moneda, moneda, tcDe(p.id))
      }, 0),
    [pendientes, imputado, moneda, tcDe]
  )

  const totalMedios = useMemo(
    () => medios.reduce((a, m) => a + (parsearImporte(m.importe) ?? 0), 0),
    [medios]
  )

  const totalRetenciones = useMemo(
    () => sumaRetenciones(retenciones.map((r) => ({ importe: parsearImporte(r.importe) ?? 0 }))),
    [retenciones]
  )

  const balance = balancear(totalImputado, totalMedios, totalRetenciones, saldoAFavor)

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

  /**
   * Mostrar el TC de cabecera y exigirlo son dos cosas distintas.
   *
   * Se muestra siempre que haya conversión de por medio, porque es el número que
   * explica el recibo. Pero solo se exige cuando algo lo necesita de verdad: un
   * renglón cruzado sin TC propio, o una cuenta en otra moneda. Un recibo donde
   * cada factura ya trae el suyo se guarda sin que la cabecera tenga nada.
   */
  const hayRenglonSinTcPropio = pendientes.some(
    (p) =>
      p.moneda !== moneda &&
      (parsearImporte(imputado[p.id] ?? "") ?? 0) > 0 &&
      (parsearImporte(tcFactura[p.id] ?? "") ?? 0) <= 0
  )
  const faltaTc = (hayRenglonSinTcPropio || hayCuentaEnOtraMoneda) && tcNum <= 0

  // La cotización del día se propone cuando el recibo la va a necesitar, que no
  // es lo mismo que "cuando el recibo está en dólares": un cobro en pesos de una
  // factura en dólares también la necesita — es el caso del punto 5.
  useEffect(() => {
    if (necesitaTc && !tc && cotizacion.venta) setTc(String(cotizacion.venta))
  }, [necesitaTc, tc, cotizacion.venta])
  const hayImputaciones = Object.values(imputado).some((v) => (parsearImporte(v) ?? 0) > 0)

  /** Una aplicación pura: la nota de crédito tapa la factura y no entra ni sale
   *  un peso. Cuadra en cero, y un recibo que dice "cancela $ 0,00" parece un
   *  recibo vacío si nadie aclara que eso es exactamente lo que se quería. */
  const soloAplicacion =
    hayImputaciones &&
    Math.abs(balance.imputado) <= 0.01 &&
    totalMedios === 0 &&
    totalRetenciones === 0

  /** Un anticipo: plata sin factura que la respalde, que queda a favor de la
   *  ficha. `aCuenta` negativo es lo contrario, un anticipo que se consume. */
  const dejaACuenta = balance.aCuenta > 0.01
  const usaSaldo = balance.aCuenta < -0.01

  /*
   * Un recibo tiene que hacer algo, pero no necesariamente imputar.
   *
   * Antes se exigía al menos una factura tildada, y eso dejaba afuera el pago a
   * cuenta: se le paga al proveedor, se retira la mercadería y la factura llega
   * después. Ahora alcanza con que mueva plata; lo que no imputa queda a cuenta
   * de la ficha y se aplica cuando la factura llegue.
   */
  const haceAlgo = hayImputaciones || totalMedios > 0 || totalRetenciones > 0
  const puedeGuardar =
    Boolean(cliente) && haceAlgo && balance.cuadra && !faltaTc && !guardando

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
      const res = await fetch(
        editando ? `/api/admin/${recurso}/${cobro!.id}` : `/api/admin/${recurso}`,
        {
        method: editando ? "PATCH" : "POST",
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
            .map((p) => ({
              comprobanteId: p.id,
              importe: parsearImporte(imputado[p.id] ?? "") ?? 0,
              // Solo cuando difiere del de la cabecera: mandarlo siempre
              // llenaría `tc_aplicado` de valores redundantes.
              tcAplicado: parsearImporte(tcFactura[p.id] ?? "") ?? null,
            }))
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
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `No se pudo registrar el ${tipo}`)
      // El recibo mueve cuentas corrientes, cajas y el mayor: todo a refrescar.
      void invalidar()
      onGuardado()
    } catch (e) {
      setError(e instanceof Error ? e.message : `No se pudo registrar el ${tipo}`)
    } finally {
      setGuardando(false)
    }
  }

  if (!abierto) return null

  return (
    <MarcoFormulario
      embebido={embebido}
      etiqueta={`Registrar ${tipo}`}
      alto="max-h-[94vh] sm:max-h-[92vh]"
      onFondo={() => !guardando && onCerrar()}
    >
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
        {/* Cliente y fecha */}
        <section className="space-y-4">
          <SelectorEntidad
            id="cliente-cobro"
            tipo={tipo === "cobro" ? "cliente" : "proveedor"}
            valor={cliente?.id ?? ""}
            nombre={cliente?.razonSocial ?? ""}
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
                ayuda={
                  hayComprobanteEnOtraMoneda
                    ? "Para los renglones sin TC propio"
                    : cotizacion.venta
                      ? `Hoy: ${formatearTc(cotizacion.venta)}`
                      : undefined
                }
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
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
            <p className="eyebrow">
              {esCobro ? "Facturas a cancelar" : "Comprobantes a cancelar"}
            </p>
            {/* El saldo a favor, dicho donde se decide qué cancelar. Sin esto
                nadie se entera de que lo tiene: está en la cuenta corriente, a
                dos pantallas de acá, y el que carga el recibo no la mira. */}
            {saldoAFavor > 0.01 && (
              <p className="text-[11.5px] text-ink-muted">
                {esCobro ? "Este cliente tiene " : "Tenemos "}
                <span className="num font-semibold text-brand-600">
                  {formatearImporte(saldoAFavor, moneda)}
                </span>
                {esCobro ? " a cuenta" : " a favor con este proveedor"}: imputá de más y
                se aplica solo.
              </p>
            )}
          </div>

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
              {/* No es un callejón sin salida: el recibo se puede guardar igual
                  y queda a cuenta. Es el caso de pagar antes de que llegue la
                  factura, que es justamente cuando no hay nada que tildar. */}
              <span className="mt-1 block">
                Lo que cargues queda a cuenta y se aplica cuando llegue{" "}
                {esCobro ? "la factura" : "el comprobante"}.
              </span>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line">
              {pendientes.map((p, i) => (
                <FilaPendiente
                  key={p.id}
                  p={p}
                  valor={imputado[p.id] ?? ""}
                  monedaRecibo={moneda}
                  tc={tcDe(p.id)}
                  tcPropio={tcFactura[p.id] ?? ""}
                  tcCabecera={tcNum}
                  primera={i === 0}
                  disabled={guardando}
                  onValor={(v) => setImputado((prev) => ({ ...prev, [p.id]: v }))}
                  onTc={(v) => setTcFactura((prev) => ({ ...prev, [p.id]: v }))}
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

        <Campo
          id="observaciones"
          rotulo="Observaciones"
          opcional
          // Lo que se escriba acá baja al detalle de cada movimiento, así que
          // aparece en el extracto de la cuenta al lado del importe. Decirlo
          // cambia lo que se escribe: sabiendo que se va a leer conciliando
          // contra el resumen del banco, sale el número de transferencia y no
          // una nota para uno mismo.
          ayuda="Aparece en el detalle del extracto de la cuenta"
        >
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
          {/* El término que hace que la ecuación cierre sin mentir: lo que se
              pagó y todavía no tiene factura. Solo aparece cuando hay algo, para
              que el recibo de siempre se siga leyendo igual que siempre. */}
          {dejaACuenta && (
            <>
              <span className="text-ink-faint">+</span>
              <Cifra rotulo="A cuenta" valor={balance.aCuenta} moneda={moneda} />
            </>
          )}
          <span className="text-ink-faint">=</span>
          <Cifra rotulo={esCobro ? "Entró" : "Salió"} valor={balance.medios} moneda={moneda} />
          <span className="text-ink-faint">+</span>
          <Cifra rotulo="Retenciones" valor={balance.retenciones} moneda={moneda} />
          {usaSaldo && (
            <>
              <span className="text-ink-faint">+</span>
              <Cifra rotulo="Saldo a favor" valor={-balance.aCuenta} moneda={moneda} />
            </>
          )}

          <span className="ml-auto text-[12px] font-semibold">
            {balance.cuadra ? (
              <span className="text-success-text">
                {soloAplicacion
                  ? "La nota de crédito cancela el comprobante"
                  : dejaACuenta
                    ? `Queda ${formatearImporte(balance.aCuenta, moneda)} a favor ${
                        esCobro ? "del cliente" : "nuestro"
                      }`
                    : usaSaldo
                      ? `Usa ${formatearImporte(-balance.aCuenta, moneda)} del saldo a favor`
                      : "El recibo cuadra"}
              </span>
            ) : (
              // Ya no dice "diferencia": dice lo que falta para poder guardar,
              // que es un número accionable y no un descuadre a interpretar.
              <span className="num text-warning-text">
                {esCobro ? "Falta cobrar" : "Falta pagar"}{" "}
                {formatearImporte(balance.diferencia, moneda)}
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
            {embebido ? "Limpiar" : "Cancelar"}
          </Button>
          <Button onClick={guardar} disabled={!puedeGuardar}>
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Registrar {tipo}
          </Button>
        </div>
      </div>
    </MarcoFormulario>
  )
}

/* ── Piezas ───────────────────────────────────────────────────────────────── */

function FilaPendiente({
  p,
  valor,
  monedaRecibo,
  tc,
  tcPropio,
  tcCabecera,
  primera,
  disabled,
  onValor,
  onTc,
  onSaldar,
}: {
  p: Pendiente
  valor: string
  monedaRecibo: Moneda
  /** El que rige para esta factura: el propio si lo tiene, si no el general. */
  tc: number
  /** Lo tipeado en el campo de TC de este renglón. Vacío = el de la cabecera. */
  tcPropio: string
  tcCabecera: number
  primera: boolean
  disabled?: boolean
  onValor: (v: string) => void
  onTc: (v: string) => void
  onSaldar: () => void
}) {
  const importe = parsearImporte(valor) ?? 0
  const excede = importe > p.saldo + 0.01
  const enRecibo = importe > 0 ? convertir(importe, p.moneda, monedaRecibo, tc) : 0
  // El campo de TC solo aparece donde hay conversión. En una factura en la misma
  // moneda del recibo no hay nada que convertir y sería una casilla muerta.
  const cruzada = p.moneda !== monedaRecibo
  /** Una nota de crédito no se cobra: se aplica, y lo que se le imputa resta del
   *  recibo en vez de sumar. Todo el renglón lo dice de una forma u otra. */
  const esNota = p.signo === -1

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
        {/* En una nota de crédito el saldo no es deuda: es crédito sin usar. Es
            el mismo número y significa lo contrario, así que se nombra distinto. */}
        <p className="eyebrow">{esNota ? "Crédito" : "Saldo"}</p>
        <p className="num text-[12.5px] font-semibold text-ink">
          {esNota ? "−" : ""}
          {formatearImporte(p.saldo, p.moneda)}
        </p>
      </div>

      {/* El TC de esta factura. Cada una se cancela al dólar que le corresponde
          —normalmente el de su fecha de emisión—, y ese es el único modo de que
          un recibo por varias facturas cierre exacto en vez de arrastrar
          centavos irreducibles. Vacío hereda el de la cabecera. */}
      {cruzada && (
        <div>
          <p className="eyebrow mb-0.5">TC</p>
          <Input
            value={tcPropio}
            onChange={(e) => onTc(e.target.value)}
            placeholder={tcCabecera > 0 ? formatearTc(tcCabecera) : "0,00"}
            inputMode="decimal"
            disabled={disabled}
            className="num h-8 w-24 text-right text-[12px]"
            aria-label={`Tipo de cambio de ${p.clase} ${formatearNumero(p.puntoVenta, p.numero)}`}
            title="El tipo de cambio con el que se cancela esta factura. Vacío usa el del recibo."
          />
        </div>
      )}

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
          {/* Lo que el renglón le hace al recibo: en una nota de crédito el
              importe resta —y decirlo acá es lo que explica que el total de
              abajo baje en vez de subir—, en una factura en otra moneda es el
              contravalor. En una factura en la moneda del recibo no se muestra
              nada: sería repetir el importe que se acaba de tipear. */}
          {importe > 0 && (esNota || cruzada) && (
            <p
              className={cn(
                "num mt-0.5 text-right text-[10.5px]",
                esNota ? "text-warning-text" : "text-ink-muted"
              )}
            >
              {esNota ? "− " : "= "}
              {formatearImporte(enRecibo, monedaRecibo)}
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
