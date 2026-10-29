"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Download, PieChart } from "lucide-react"

import { SemaforoVencimiento } from "@/components/admin/semaforo-vencimiento"
import { Preguntar } from "@/components/chatbot/preguntar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FranjaFija } from "@/components/ui/franja-fija"
import { Input } from "@/components/ui/input"
import { Paginacion, usePaginado } from "@/components/ui/paginacion"
import { EmptyState, LoadingState } from "@/components/ui/states"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { descargarCsv } from "@/lib/admin/csv"
import { hoyArgentina, sumarDias } from "@/lib/admin/fecha"
import { formatearImporte, redondear } from "@/lib/admin/moneda"
import { claves, pedirJson, useInvalidarAdmin } from "@/lib/admin/query"
import { renglon, resumen } from "@/lib/chatbot/pantalla"
import { cn } from "@/lib/utils"

/**
 * Los reportes operativos del pliego.
 *
 * Eran dos pestañas en `/admin/reportes`. El árbol del contador los separa: el
 * de pago es el 2.5 de Proveedores y el de cobro el 3.5 de Clientes, así que
 * cada uno vive en su módulo —`/admin/proveedores/pendientes` y
 * `/admin/clientes/pendientes`— y comparten este mismo componente.
 *
 * El estado de cuenta era la cuarta y se fue: ahora es «cuenta corriente» y
 * vive adentro de cada módulo —`/admin/proveedores/cuenta-corriente` y
 * `/admin/clientes/cuenta-corriente`—, porque siempre se la mira de una ficha
 * concreta y no como un reporte transversal. Lo que queda acá son los tres que
 * sí se leen de arriba hacia abajo, sin elegir a nadie primero.
 *
 * Dos reglas que comparten todos:
 *
 *  · **Sin paginación.** El producto de un reporte son los totales, y un total
 *    de la página visible no contesta ninguna pregunta útil.
 *  · **Totales por moneda, nunca consolidados.** Sumar pesos y dólares en un
 *    número obliga a elegir un tipo de cambio, y cualquiera que se elija engaña
 *    para algún uso.
 */

type Pendiente = {
  id: string
  entidad: string
  clase: string
  numero: string
  fecha: string
  fechaVencimiento: string | null
  moneda: "ARS" | "USD"
  tc: number | null
  /** -1 en las notas de crédito. Todos los importes ya vienen con él aplicado:
   *  una NC pendiente es crédito a favor del cliente, no deuda suya. */
  signo: 1 | -1
  /** Neto e impuestos en la moneda del comprobante. Suman el total exacto. */
  neto: number
  impuestos: number
  /** Solo en las facturas en dólares; en las de pesos `null`. */
  totalUsd: number | null
  /** El dólar del día de emisión. `null` en las facturas en pesos. */
  tcEmision: number | null
  /** El total valuado en pesos: el suyo si está en pesos, o al TC de emisión. */
  totalArs: number
  total: number
  imputado: number
  saldo: number
  /** El saldo en pesos, al TC del comprobante. Es lo que suman los totales. */
  saldoArs: number
  detalle: string | null
  vencida: boolean
  /** Cuándo se calcula que se va a cobrar (o pagar). Se edita desde acá mismo. */
  fechaEstimadaPago: string | null
  /** Un pago o cobro a cuenta con saldo sin aplicar: crédito, va en negativo. */
  aCuenta?: boolean
}

type Totales = {
  cantidad: number
  /** Todo en pesos, cada factura a su propio tipo de cambio. */
  ars: number
  /** Esa suma llevada a dólares de hoy. `null` sin cotización cargada. */
  usdHoy: number | null
  dolar: number | null
  dolarActualizado: string | null
  vencidas: number
  vencidoArs: number
  truncado: boolean
}

/* ── Pendientes de cobro / de pago ────────────────────────────────────────── */

export function Pendientes({ tipo }: { tipo: "venta" | "compra" }) {
  const esVenta = tipo === "venta"

  const url = `/api/admin/reportes/pendientes?tipo=${tipo}`
  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) =>
      pedirJson<{ filas?: Pendiente[]; totales?: Totales }>(url, { signal }),
  })
  const filas = query.data?.filas ?? SIN_FILAS
  const totales = query.data?.totales ?? null
  const paginado = usePaginado(filas, 50, url)
  const cargando = query.isPending

  const exportar = () =>
    descargarCsv(
      `pendientes-${esVenta ? "cobro" : "pago"}.csv`,
      [
        esVenta ? "Cliente" : "Proveedor",
        "Tipo",
        "Número",
        "Fecha",
        "Vencimiento",
        "Moneda",
        "Neto",
        "Impuestos",
        "Total USD",
        "TC",
        "Total $",
        esVenta ? "Cobrado $" : "Pagado $",
        "Saldo $",
        esVenta ? "Cobro estimado" : "Pago estimado",
        "Detalle",
      ],
      filas.map((f) => [
        f.entidad,
        f.clase,
        f.numero,
        f.fecha,
        f.fechaVencimiento ?? "",
        f.moneda,
        f.neto,
        f.impuestos,
        f.totalUsd ?? "",
        f.tcEmision ?? "",
        f.totalArs,
        redondear(f.totalArs - f.saldoArs),
        f.saldoArs,
        f.fechaEstimadaPago ?? "",
        f.detalle ?? "",
      ])
    )

  if (cargando) return <LoadingState label="Armando el reporte…" />

  return (
    <div className="panel overflow-clip">
      {/* Los totales arriba y fijos al bajar: son el producto del reporte, no un
          pie de página, y la lista de facturas es larga. */}
      {totales && (
        <FranjaFija className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-line bg-surface-subtle px-5 py-4">
          <Total rotulo="Comprobantes" valor={String(totales.cantidad)} />
          {/* Un solo total, en pesos: cada factura valuada al dólar de su fecha
              de emisión. Antes eran dos números por moneda que no se podían
              sumar, y la pregunta "cuánto me deben" no tenía una respuesta. */}
          <Total
            rotulo={esVenta ? "Total a cobrar" : "Total a pagar"}
            valor={formatearImporte(totales.ars, "ARS")}
          />
          {/* Y recién acá entra el dólar de hoy: la suma entera llevada a
              dólares, que es otra pregunta —cuánto es esto si lo cobrara hoy— y
              por eso dice de cuándo es la cotización. */}
          {totales.usdHoy !== null && (
            <div>
              <p className="eyebrow">Equivale a</p>
              <p className="num mt-0.5 text-[16px] font-bold tracking-[-0.02em] text-ink">
                {formatearImporte(totales.usdHoy, "USD")}
              </p>
              <p className="num mt-0.5 text-[10.5px] text-ink-muted">
                dólar {formatearImporte(totales.dolar ?? 0, "ARS", { decimales: 2 })}
                {totales.dolarActualizado && ` · ${cuandoSeActualizo(totales.dolarActualizado)}`}
              </p>
            </div>
          )}
          {totales.vencidas > 0 && (
            <div className="flex items-center gap-2">
              <Badge tone="danger" size="md">
                {totales.vencidas} vencida{totales.vencidas !== 1 ? "s" : ""}
              </Badge>
              <span className="num text-[12px] text-danger-text">
                {formatearImporte(totales.vencidoArs, "ARS")}
              </span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Preguntar
              agente="finanzas"
              pantalla={() => ({
                titulo: `Administración · Pendientes de ${esVenta ? "cobro" : "pago"}`,
                texto: textoPendientes(filas, totales, esVenta),
              })}
              pregunta={
                esVenta
                  ? "¿Cómo viene la cobranza? ¿Qué saldos vencidos me preocupan y por dónde empiezo a cobrar?"
                  : "¿Cómo vienen los pagos? ¿Qué es lo más urgente, qué puede esperar y cuánta plata necesito en los próximos 30 días?"
              }
              ayuda="Le pasa los totales, la antigüedad de lo vencido y los saldos más grandes, sin nombres."
              seguimientos={esVenta ? SEGUIMIENTOS_COBRO : SEGUIMIENTOS_PAGO}
            />
            <Button variant="outline" size="sm" onClick={exportar}>
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </Button>
          </div>
        </FranjaFija>
      )}

      {totales?.truncado && (
        <p className="border-b border-warning-line bg-warning-soft px-5 py-2 text-[11.5px] text-warning-text">
          El reporte se cortó en 2000 comprobantes: los totales de arriba no incluyen
          todo. Filtrá por período para verlo completo.
        </p>
      )}

      {filas.length === 0 ? (
        <EmptyState
          icon={PieChart}
          title={esVenta ? "No hay nada por cobrar" : "No hay nada por pagar"}
          description="Todos los comprobantes están saldados."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{esVenta ? "Cliente" : "Proveedor"}</TableHead>
              <TableHead>Comprobante</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Vencimiento</TableHead>
              {/* Abierta como la planilla que reemplaza, menos el neto: en
                  pantalla no aporta —se deduce del total menos los impuestos— y
                  era una columna más para barrer. Sigue saliendo en el CSV, que
                  es donde la planilla lo tenía. */}
              <TableHead className="text-right">Impuestos</TableHead>
              <TableHead className="text-right">Total USD</TableHead>
              <TableHead className="text-right">TC</TableHead>
              <TableHead className="text-right">Total $</TableHead>
              {/* Lo que de verdad falta: el total menos lo ya imputado. Debajo,
                  cuánto se pagó, solo cuando hubo un pago parcial. */}
              <TableHead className="text-right">Saldo $</TableHead>
              {/* Última porque es la única que se escribe: la vista se lee de
                  izquierda a derecha y termina en la decisión que hay que tomar. */}
              <TableHead>{esVenta ? "Cobro estimado" : "Pago estimado"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginado.visibles.map((f) => (
              <TableRow key={f.id} className={cn(f.vencida && "bg-danger-soft/40")}>
                <TableCell className="font-medium text-ink">{f.entidad}</TableCell>
                <TableCell>
                  <Badge tone={f.aCuenta ? "success" : f.signo === -1 ? "warning" : "neutral"} size="sm">
                    {f.clase}
                  </Badge>
                  {f.aCuenta ? (
                    <span className="ml-2 text-[11.5px] text-ink-muted" title={f.detalle ?? undefined}>
                      saldo a favor sin aplicar
                    </span>
                  ) : (
                    <span className="num ml-2 text-[12px] text-ink-secondary">{f.numero}</span>
                  )}
                </TableCell>
                <TableCell className="num text-ink-secondary">{fechaCorta(f.fecha)}</TableCell>
                <TableCell>
                  <SemaforoVencimiento fecha={f.fechaVencimiento} />
                </TableCell>
                <TableCell className="num whitespace-nowrap text-right text-ink-secondary">
                  {formatearImporte(f.impuestos, f.moneda)}
                </TableCell>
                <TableCell className="num whitespace-nowrap text-right text-ink-secondary">
                  {f.totalUsd !== null ? (
                    formatearImporte(f.totalUsd, "USD")
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </TableCell>
                <TableCell className="num whitespace-nowrap text-right text-ink-muted">
                  {f.tcEmision !== null ? (
                    formatearImporte(f.tcEmision, "ARS", { simbolo: false })
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </TableCell>
                <TableCell className="num whitespace-nowrap text-right text-ink-secondary">
                  {formatearImporte(f.totalArs, "ARS")}
                </TableCell>
                <TableCell className="num whitespace-nowrap text-right">
                  <span className="font-semibold text-ink">{formatearImporte(f.saldoArs, "ARS")}</span>
                  {Math.abs(f.totalArs - f.saldoArs) >= 0.01 && (
                    <span className="block text-[11px] text-ink-muted">
                      {esVenta ? "cobrado" : "pagado"} {formatearImporte(f.totalArs - f.saldoArs, "ARS")}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {f.aCuenta ? (
                    <span className="text-[12px] text-ink-faint">—</span>
                  ) : (
                    <CeldaPagoEstimado
                      id={f.id}
                      recurso={esVenta ? "ventas" : "compras"}
                      valor={f.fechaEstimadaPago}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {paginado.hayMasDeUna && (
        <Paginacion
          pagina={paginado.pagina}
          totalPaginas={paginado.totalPaginas}
          total={paginado.total}
          porPagina={paginado.porPagina}
          onIr={paginado.irA}
        />
      )}
    </div>
  )
}

/** Fija, para que un `[]` nuevo en cada render no reinicie la página. */
const SIN_FILAS: never[] = []

/**
 * La fecha estimada de pago, editable en la fila.
 *
 * Guarda al soltar el selector, sin botón: el gesto ya es explícito —se eligió
 * un día en un calendario— y un "guardar" por fila convertiría planificar la
 * cobranza de veinte facturas en cuarenta clics.
 *
 * El valor que se ve es el tipeado hasta que el servidor contesta; si falla,
 * vuelve al que tenía y se marca en rojo. Nunca se queda mostrando una fecha
 * que no se guardó, que es la única forma en que una celda así miente.
 */
function CeldaPagoEstimado({
  id,
  recurso,
  valor,
}: {
  id: string
  recurso: "ventas" | "compras"
  valor: string | null
}) {
  const invalidar = useInvalidarAdmin()
  const [local, setLocal] = useState(valor ?? "")
  const [guardando, setGuardando] = useState(false)
  const [fallo, setFallo] = useState(false)

  // Si el reporte se vuelve a pedir —otra pestaña, otra pantalla— manda el
  // servidor.
  useEffect(() => setLocal(valor ?? ""), [valor])

  const guardar = async (v: string) => {
    setLocal(v)
    setGuardando(true)
    setFallo(false)
    try {
      await pedirJson(`/api/admin/${recurso}/${id}/pago-estimado`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fechaEstimadaPago: v || null }),
      })
      void invalidar()
    } catch {
      setFallo(true)
      setLocal(valor ?? "")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Input
      type="date"
      value={local}
      onChange={(e) => guardar(e.target.value)}
      disabled={guardando}
      aria-label="Fecha estimada de pago"
      title={fallo ? "No se pudo guardar. Probá de nuevo." : undefined}
      className={cn("num h-8 w-[132px] text-[12px]", fallo && "border-danger-line")}
    />
  )
}

/* ── Piezas ───────────────────────────────────────────────────────────────── */

function Total({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="eyebrow">{rotulo}</p>
      <p className="num mt-0.5 text-[16px] font-bold tracking-[-0.02em] text-ink">{valor}</p>
    </div>
  )
}

/**
 * "hoy 15:24", "ayer 09:12" o "22/9 18:03".
 *
 * El total en dólares se mueve solo con la cotización, así que tiene que decir
 * de cuándo es. En horas y no en fecha a secas porque el dólar cambia dentro
 * del mismo día, y lo que importa saber es si el número es de hace un rato o de
 * la semana pasada.
 */
function cuandoSeActualizo(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  // 24 horas: "15:24" y no "03:24 p. m.", que es como se lee la hora acá y
  // además no se parte en dos líneas al lado de la cotización.
  const hora = d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dias = Math.round((dia(new Date()) - dia(d)) / 86_400_000)
  if (dias === 0) return `hoy ${hora}`
  if (dias === 1) return `ayer ${hora}`
  return `${d.getDate()}/${d.getMonth() + 1} ${hora}`
}

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${Number(d)}/${Number(m)}/${a.slice(2)}`
}

/* ── Para el chat ─────────────────────────────────────────────────────────── */

const SEGUIMIENTOS_COBRO = [
  { emoji: "📞", corto: "Plan de cobranza", texto: "Armame un plan de cobranza para esta semana: qué saldos reclamo primero y en qué orden, según monto y antigüedad." },
  { emoji: "📅", corto: "¿Cuánto entra este mes?", texto: "Con las fechas estimadas de cobro, ¿cuánto debería entrar en los próximos 30 días? ¿Qué tan confiable es esa cifra?" },
  { emoji: "⚠️", corto: "¿Hay algo incobrable?", texto: "¿Hay saldos que por antigüedad ya conviene tratar como dudosos? ¿Qué harías con ellos?" },
]

const SEGUIMIENTOS_PAGO = [
  { emoji: "🗓️", corto: "Calendario de pagos", texto: "Armame un calendario de pagos para las próximas semanas, priorizando lo vencido y lo que más pesa." },
  { emoji: "💵", corto: "¿Cuánta caja necesito?", texto: "¿Cuánta plata necesito tener disponible en los próximos 30 días para cubrir lo que vence?" },
  { emoji: "🔎", corto: "¿Algo raro?", texto: "¿Ves algo raro en estos pendientes? Notas de crédito sin aplicar, saldos a cuenta, facturas muy viejas." },
]

/**
 * Los pendientes en texto, para el chat: totales, antigüedad de lo vencido y
 * los saldos más grandes. Sin el nombre del cliente o proveedor: a quien no es
 * administrador el asistente no se los puede dar, y para leer la foto de la
 * cobranza alcanza con montos y días. Si hace falta saber quién, el agente
 * tiene sus herramientas.
 */
function textoPendientes(filas: Pendiente[], totales: Totales | null, esVenta: boolean): string {
  const ars = (n: number) => formatearImporte(n, "ARS")
  const hoy = hoyArgentina()
  const dias = (iso: string) => Math.round((Date.parse(hoy) - Date.parse(iso)) / 86_400_000)

  // Lo que todavía se debe, sin los créditos (notas de crédito y saldos a cuenta).
  const deudas = filas.filter((f) => f.saldoArs > 0)
  const creditos = filas.filter((f) => f.saldoArs < 0)

  // Antigüedad por días de vencida, como la lee cualquier informe de cobranza.
  const tramos = [
    { rotulo: "Sin vencer o sin fecha", de: -Infinity, a: 0 },
    { rotulo: "Vencido 1 a 30 días", de: 1, a: 30 },
    { rotulo: "Vencido 31 a 60 días", de: 31, a: 60 },
    { rotulo: "Vencido 61 a 90 días", de: 61, a: 90 },
    { rotulo: "Vencido más de 90 días", de: 91, a: Infinity },
  ].map((t) => {
    const del = deudas.filter((f) => {
      const d = f.fechaVencimiento ? dias(f.fechaVencimiento) : 0
      return d >= t.de && d <= t.a
    })
    return `${t.rotulo}: ${ars(del.reduce((a, f) => a + f.saldoArs, 0))} (${del.length})`
  })

  // Cuándo se estima que entra (o sale) la plata.
  const en30 = sumarDias(hoy, 30)
  const conFecha = deudas.filter((f) => f.fechaEstimadaPago)
  const proximos = conFecha.filter((f) => f.fechaEstimadaPago! <= en30)
  const sinFecha = deudas.filter((f) => !f.fechaEstimadaPago && !f.aCuenta)

  const mayores = [...deudas].sort((a, b) => b.saldoArs - a.saldoArs).slice(0, 8)
  const totalDeuda = deudas.reduce((a, f) => a + f.saldoArs, 0)
  const top5 = mayores.slice(0, 5).reduce((a, f) => a + f.saldoArs, 0)
  const entidades = new Set(deudas.map((f) => f.entidad)).size

  return resumen(
    renglon("Comprobantes pendientes", totales?.cantidad ?? filas.length),
    totales && renglon(esVenta ? "Total a cobrar" : "Total a pagar", ars(totales.ars)),
    totales?.usdHoy != null && renglon("Equivale a", `${formatearImporte(totales.usdHoy, "USD")} al dólar de hoy`),
    totales && renglon("Vencido", `${ars(totales.vencidoArs)} en ${totales.vencidas} comprobantes`),
    renglon(esVenta ? "Clientes con saldo" : "Proveedores con saldo", entidades),
    creditos.length > 0 &&
      renglon("Créditos sin aplicar (NC y a cuenta)", `${ars(creditos.reduce((a, f) => a + f.saldoArs, 0))} (${creditos.length})`),
    totales?.truncado && "Ojo: el reporte se cortó en 2000 comprobantes, los totales no incluyen todo.",
    "",
    "## Antigüedad",
    tramos,
    "",
    `## ${esVenta ? "Cobro" : "Pago"} estimado`,
    renglon("Estimado en los próximos 30 días", `${ars(proximos.reduce((a, f) => a + f.saldoArs, 0))} (${proximos.length})`),
    renglon("Sin fecha estimada", `${ars(sinFecha.reduce((a, f) => a + f.saldoArs, 0))} (${sinFecha.length})`),
    "",
    "## Los saldos más grandes",
    totalDeuda > 0 && `Los 5 mayores suman ${ars(top5)} (${Math.round((top5 / totalDeuda) * 100)}% del total)`,
    mayores.map(
      (f, i) =>
        `${i + 1}. ${f.clase} · ${ars(f.saldoArs)} · ${
          f.fechaVencimiento
            ? dias(f.fechaVencimiento) > 0
              ? `vencida hace ${dias(f.fechaVencimiento)} días`
              : `vence el ${fechaCorta(f.fechaVencimiento)}`
            : "sin vencimiento"
        }${f.moneda === "USD" ? " · en dólares" : ""}${f.fechaEstimadaPago ? ` · estimado ${fechaCorta(f.fechaEstimadaPago)}` : ""}`
    )
  )
}
