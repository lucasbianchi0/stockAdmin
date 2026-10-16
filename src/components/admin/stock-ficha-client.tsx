"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Loader2, Scale, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Campo, useDolarDe } from "@/components/admin/stock-client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmarDialog } from "@/components/ui/confirmar-dialog"
import { DatoRevision, DialogoPasos } from "@/components/ui/dialogo-pasos"
import { Input } from "@/components/ui/input"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { formatearFecha, hoyArgentina } from "@/lib/admin/fecha"
import { formatearImporte, parsearImporte } from "@/lib/admin/moneda"
import { claves, mensajeError, pedirJson, useInvalidarAdmin } from "@/lib/admin/query"
import {
  TIPO_MOVIMIENTO_LABEL,
  formatearCantidad,
  parsearSeries,
  pesosDe,
  type ComprobanteParaStock,
  type FichaStock,
  type MovimientoStock,
} from "@/lib/admin/stock"
import { cn } from "@/lib/utils"

/**
 * La ficha de un ítem: el extracto de sus movimientos con el saldo corrido, en
 * las mismas columnas que la planilla que mandó el contador —fecha, proveedor o
 * cliente, factura, cantidad, dólares— más el tipo de cambio y los pesos.
 *
 * Las tres cosas que se hacen acá arriba de todo: entra por una compra, sale por
 * una venta, o se ajusta (rotura, muestra, conteo). Cada una es un paso a paso
 * que termina mostrando el saldo antes y después.
 */

type Accion = "compra" | "venta" | "ajuste"

export function StockFichaClient({ id }: { id: string }) {
  const url = `/api/admin/stock/${id}`
  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<FichaStock>(url, { signal }),
  })
  const [accion, setAccion] = useState<Accion | null>(null)
  const [borrando, setBorrando] = useState<MovimientoStock | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const invalidar = useInvalidarAdmin()

  if (query.isPending) return <LoadingState label="Cargando la ficha…" />
  if (query.isError || !query.data) {
    return <ErrorState message={mensajeError(query.error, "No se pudo cargar el ítem")} onRetry={() => query.refetch()} />
  }
  const { item, movimientos, series } = query.data
  const disponibles = series.filter((s) => !s.salida)

  const borrar = async () => {
    if (!borrando) return
    setTrabajando(true)
    try {
      await pedirJson(`/api/admin/stock/movimientos/${borrando.id}`, { method: "DELETE" })
      await invalidar()
      toast.success("Movimiento borrado")
      setBorrando(null)
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo borrar"))
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setAccion("compra")}>
          <ArrowDownToLine className="h-4 w-4" />
          Entrada por compra
        </Button>
        <Button variant="outline" onClick={() => setAccion("venta")}>
          <ArrowUpFromLine className="h-4 w-4" />
          Salida por venta
        </Button>
        <Button variant="outline" onClick={() => setAccion("ajuste")}>
          <Scale className="h-4 w-4" />
          Ajuste
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Tarjeta rotulo="Saldo" valor={formatearCantidad(item.saldo)} peligro={item.saldo < 0} destacado />
        <Tarjeta rotulo="Entradas" valor={formatearCantidad(item.entradas)} />
        <Tarjeta rotulo="Salidas" valor={formatearCantidad(item.salidas)} />
        <Tarjeta
          rotulo="Costo promedio"
          valor={item.costoPromedioUsd === null ? "—" : formatearImporte(item.costoPromedioUsd, "USD")}
        />
      </div>

      {item.saldo < 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12.5px] text-danger-text">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Salió más de lo que entró. Seguramente falta registrar una compra o el stock inicial.
        </p>
      )}

      <div className="panel overflow-clip">
        {movimientos.length === 0 ? (
          <EmptyState
            icon={ArrowDownToLine}
            title="Sin movimientos todavía"
            description="Registrá la primera entrada con la factura de compra, o un ajuste si ya hay unidades sin factura."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Movimiento</TableHead>
                <TableHead>Proveedor / Cliente</TableHead>
                <TableHead>Factura</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">USD</TableHead>
                <TableHead className="text-right">TC</TableHead>
                <TableHead className="text-right">Pesos</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimientos.map((m) => {
                const pesos = pesosDe(m)
                return (
                  <TableRow key={m.id}>
                    <TableCell className="num whitespace-nowrap text-ink-secondary">{formatearFecha(m.fecha)}</TableCell>
                    <TableCell>
                      <Badge tone={m.cantidad > 0 ? "success" : "neutral"} size="sm">
                        {TIPO_MOVIMIENTO_LABEL[m.tipo]}
                      </Badge>
                      {m.detalle && m.tipo !== "inicial" && (
                        <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-ink-muted" title={m.detalle}>
                          {m.detalle}
                        </p>
                      )}
                      {m.series.length > 0 && (
                        <p className="mt-0.5 max-w-[220px] truncate font-mono text-[10.5px] text-ink-faint" title={m.series.join(", ")}>
                          {m.series.join(" · ")}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-[12.5px] text-ink">{m.entidad ?? "—"}</TableCell>
                    <TableCell className="num whitespace-nowrap font-mono text-[12px] text-ink-secondary">
                      {m.comprobante ?? "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "num text-right text-[13px] font-semibold",
                        m.cantidad < 0 ? "text-ink" : "text-success-text"
                      )}
                    >
                      {m.cantidad > 0 ? "+" : ""}
                      {formatearCantidad(m.cantidad)}
                    </TableCell>
                    <TableCell className="num text-right text-ink-secondary">
                      {m.precioUsd === null ? "—" : formatearImporte(m.precioUsd, "USD")}
                    </TableCell>
                    <TableCell className="num text-right text-ink-muted">
                      {m.tc === null ? "—" : formatearImporte(m.tc, "ARS", { simbolo: false })}
                    </TableCell>
                    <TableCell className="num text-right text-ink-secondary">
                      {pesos === null ? "—" : formatearImporte(pesos)}
                    </TableCell>
                    <TableCell
                      className={cn("num text-right font-semibold", m.saldo < 0 ? "text-danger-text" : "text-ink")}
                    >
                      {formatearCantidad(m.saldo)}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => setBorrando(m)}
                        aria-label="Borrar movimiento"
                        title="Borrar este movimiento"
                        className="rounded-md p-1 text-ink-faint transition-colors hover:bg-danger-soft hover:text-danger-text"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {item.llevaSerie && series.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <p className="text-[13px] font-semibold text-ink">Números de serie</p>
            <p className="text-[12px] text-ink-muted">
              {disponibles.length} en stock · {series.length - disponibles.length} vendidos
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 px-5 py-4">
            {series.map((s) => (
              <span
                key={s.id}
                title={s.salida ? `Salió el ${formatearFecha(s.salida)}` : `Entró el ${formatearFecha(s.entrada)}`}
                className={cn(
                  "rounded-md px-2 py-0.5 font-mono text-[11.5px]",
                  s.salida ? "bg-surface-muted text-ink-faint line-through" : "bg-success-soft text-success-text"
                )}
              >
                {s.serie}
              </span>
            ))}
          </div>
        </div>
      )}

      {accion && <RegistrarMovimiento ficha={query.data} accion={accion} onCerrar={() => setAccion(null)} />}

      <ConfirmarDialog
        abierto={Boolean(borrando)}
        titulo="¿Borrar este movimiento?"
        descripcion={
          borrando && (
            <>
              {TIPO_MOVIMIENTO_LABEL[borrando.tipo]} de {formatearCantidad(Math.abs(borrando.cantidad))} del{" "}
              {formatearFecha(borrando.fecha)}. El saldo se recalcula solo. La factura, si tenía, no se toca.
            </>
          )
        }
        confirmar="Borrar"
        trabajando={trabajando}
        onCerrar={() => setBorrando(null)}
        onConfirmar={borrar}
      />
    </div>
  )
}

/* ── Registrar un movimiento ──────────────────────────────────────────────── */

function RegistrarMovimiento({
  ficha,
  accion,
  onCerrar,
}: {
  ficha: FichaStock
  accion: Accion
  onCerrar: () => void
}) {
  const { item, series } = ficha
  const invalidar = useInvalidarAdmin()
  const conFactura = accion !== "ajuste"
  const [paso, setPaso] = useState(0)
  const [comprobante, setComprobante] = useState<ComprobanteParaStock | null>(null)
  const [sentido, setSentido] = useState<"entrada" | "salida">("entrada")
  const [detalle, setDetalle] = useState("")
  const [fecha, setFecha] = useState(hoyArgentina())
  const [cantidad, setCantidad] = useState("")
  const [precio, setPrecio] = useState("")
  const [tc, setTc] = useState("")
  const [tcTocado, setTcTocado] = useState(false)
  const [textoSeries, setTextoSeries] = useState("")
  const [elegidas, setElegidas] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const entra = accion === "compra" || (accion === "ajuste" && sentido === "entrada")
  const fechaEfectiva = comprobante?.fecha ?? fecha
  const dolar = useDolarDe(fechaEfectiva)

  // El tipo de cambio propuesto: el de la factura si es en dólares, si no el
  // dólar del día de la factura (o de la fecha del ajuste).
  useEffect(() => {
    if (tcTocado) return
    const propuesto = comprobante?.moneda === "USD" && comprobante.tc ? comprobante.tc : dolar.data?.tc
    if (propuesto) setTc(formatearImporte(propuesto, "ARS", { simbolo: false }))
  }, [comprobante, dolar.data, tcTocado])

  const nCantidad = parsearImporte(cantidad)
  const nPrecio = parsearImporte(precio)
  const nTc = parsearImporte(tc)
  const nuevas = parsearSeries(textoSeries)
  const disponibles = series.filter((s) => !s.salida)
  const saldoDespues = item.saldo + (entra ? 1 : -1) * (nCantidad ?? 0)

  const falta = (() => {
    if (paso === 0) {
      if (conFactura) return comprobante ? null : "Elegí la factura"
      if (!detalle.trim()) return "Contá el motivo del ajuste"
      return null
    }
    if (paso === 1) {
      if (!nCantidad || nCantidad <= 0) return "Poné la cantidad"
      if (item.llevaSerie && !Number.isInteger(nCantidad)) return "Con número de serie va en unidades enteras"
      if (accion === "compra" && nPrecio === null) return "Poné el costo unitario en dólares"
      if (entra && nPrecio !== null && !nTc) return "Poné el tipo de cambio"
      if (item.llevaSerie && entra) {
        if (nuevas.repetidas.length) return `La serie ${nuevas.repetidas[0]} está repetida`
        if (nuevas.series.length !== nCantidad) return `Faltan números de serie (${nuevas.series.length} de ${nCantidad})`
      }
      if (item.llevaSerie && !entra && elegidas.length !== nCantidad) {
        return `Elegí ${nCantidad} número${nCantidad === 1 ? "" : "s"} de serie (${elegidas.length} elegidos)`
      }
    }
    return null
  })()

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const r = await pedirJson<{ aviso: string | null }>(`/api/admin/stock/${item.id}/movimientos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: accion,
          sentido,
          fecha: fechaEfectiva,
          cantidad: nCantidad,
          precioUsd: nPrecio,
          tc: nPrecio === null ? null : nTc,
          comprobanteId: comprobante?.id ?? null,
          detalle: detalle || null,
          seriesNuevas: entra ? nuevas.series : undefined,
          seriesSalida: entra ? undefined : elegidas,
        }),
      })
      await invalidar()
      if (r.aviso) toast.warning(r.aviso)
      else toast.success("Movimiento registrado")
      onCerrar()
    } catch (e) {
      setError(mensajeError(e, "No se pudo registrar"))
      setGuardando(false)
    }
  }

  const titulo =
    accion === "compra" ? `Entrada por compra · ${item.nombre}` : accion === "venta" ? `Salida por venta · ${item.nombre}` : `Ajuste · ${item.nombre}`

  return (
    <DialogoPasos
      abierto
      ancho="lg"
      titulo={titulo}
      pasos={[conFactura ? "Factura" : "Motivo", "Cantidad", "Revisar"]}
      paso={paso}
      onCerrar={onCerrar}
      bloqueado={guardando}
      pie={
        <>
          <span className="mr-auto text-[12px] text-ink-muted">{paso < 2 ? falta : null}</span>
          {paso === 0 ? (
            <Button variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setPaso(paso - 1)} disabled={guardando}>
              Atrás
            </Button>
          )}
          {paso < 2 ? (
            <Button onClick={() => setPaso(paso + 1)} disabled={Boolean(falta)}>
              Siguiente
            </Button>
          ) : (
            <Button onClick={guardar} disabled={guardando}>
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Registrar
            </Button>
          )}
        </>
      }
    >
      {paso === 0 &&
        (conFactura ? (
          <ElegirFactura tipo={accion === "venta" ? "venta" : "compra"} elegida={comprobante} onElegir={setComprobante} />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["entrada", "Suma unidades", "Apareció mercadería sin factura, o el conteo dio más."],
                  ["salida", "Resta unidades", "Rotura, muestra, uso interno, o el conteo dio menos."],
                ] as const
              ).map(([valor, rotulo, ayuda]) => (
                <label
                  key={valor}
                  className={cn(
                    "flex cursor-pointer gap-2.5 rounded-xl border px-3.5 py-3 transition-colors",
                    sentido === valor ? "border-brand-400 bg-brand-50/60" : "border-line hover:bg-surface-muted"
                  )}
                >
                  <input
                    type="radio"
                    name="sentido"
                    checked={sentido === valor}
                    onChange={() => setSentido(valor)}
                    className="mt-1 accent-brand-600"
                  />
                  <span>
                    <span className="block text-[13px] font-medium text-ink">{rotulo}</span>
                    <span className="block text-[11.5px] text-ink-muted">{ayuda}</span>
                  </span>
                </label>
              ))}
            </div>
            <Campo id="motivo" rotulo="Motivo" ayuda="Queda en el extracto: dentro de seis meses alguien va a preguntar por qué.">
              <Input id="motivo" value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Conteo de fin de mes" autoFocus />
            </Campo>
            <Campo id="fecha-ajuste" rotulo="Fecha">
              <Input id="fecha-ajuste" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="max-w-[200px]" />
            </Campo>
          </div>
        ))}

      {paso === 1 && (
        <div className="space-y-4">
          {comprobante && (
            <p className="rounded-lg bg-surface-subtle px-3 py-2 text-[12.5px] text-ink-secondary">
              {comprobante.etiqueta} · {comprobante.entidad} · {formatearFecha(comprobante.fecha)}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo id="cantidad-mov" rotulo={entra ? "Unidades que entran" : "Unidades que salen"}>
              <Input id="cantidad-mov" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus />
            </Campo>
            <Campo
              id="precio-mov"
              rotulo={entra ? "Costo unitario (USD)" : "Precio unitario (USD)"}
              opcional={accion !== "compra"}
            >
              <Input id="precio-mov" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
            </Campo>
            <Campo
              id="tc-mov"
              rotulo="Tipo de cambio"
              opcional={accion !== "compra"}
              ayuda={comprobante?.moneda === "USD" ? "El de la factura." : "El dólar de esa fecha."}
            >
              <Input
                id="tc-mov"
                inputMode="decimal"
                value={tc}
                onChange={(e) => {
                  setTc(e.target.value)
                  setTcTocado(true)
                }}
              />
            </Campo>
          </div>

          {item.llevaSerie && entra && (
            <Campo id="series-mov" rotulo="Números de serie que entran" ayuda="Uno por renglón. Podés pegarlos de un Excel.">
              <Textarea id="series-mov" rows={4} value={textoSeries} onChange={(e) => setTextoSeries(e.target.value)} className="font-mono text-[12.5px]" />
              <p className="mt-1 text-[11.5px] text-ink-muted">
                {nuevas.series.length} de {nCantidad ? formatearCantidad(nCantidad) : "—"} cargados
              </p>
            </Campo>
          )}

          {item.llevaSerie && !entra && (
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-ink">¿Cuáles salen?</p>
              {disponibles.length === 0 ? (
                <p className="text-[12.5px] text-danger-text">No hay unidades con número de serie en stock.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {disponibles.map((s) => {
                    const sel = elegidas.includes(s.id)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={sel}
                        onClick={() => setElegidas(sel ? elegidas.filter((x) => x !== s.id) : [...elegidas, s.id])}
                        className={cn(
                          "rounded-md border px-2 py-1 font-mono text-[11.5px] transition-colors",
                          sel ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line text-ink-secondary hover:bg-surface-muted"
                        )}
                      >
                        {s.serie}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {paso === 2 && nCantidad && (
        <div className="space-y-4">
          <div className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
            <DatoRevision rotulo="Movimiento">
              {TIPO_MOVIMIENTO_LABEL[accion]} · {entra ? "entra" : "sale"}
              {nCantidad === 1 ? "" : "n"} {formatearCantidad(nCantidad)} unidad{nCantidad === 1 ? "" : "es"}
            </DatoRevision>
            {item.llevaSerie && (
              <DatoRevision rotulo="Números de serie">
                <span className="font-mono text-[12px]">
                  {(entra
                    ? nuevas.series
                    : disponibles.filter((s) => elegidas.includes(s.id)).map((s) => s.serie)
                  ).join(" · ")}
                </span>
              </DatoRevision>
            )}
            <DatoRevision rotulo="Fecha">{formatearFecha(fechaEfectiva)}</DatoRevision>
            {comprobante && (
              <DatoRevision rotulo="Factura">
                {comprobante.etiqueta} · {comprobante.entidad}
              </DatoRevision>
            )}
            {!conFactura && <DatoRevision rotulo="Motivo">{detalle}</DatoRevision>}
            {nPrecio !== null && nTc && (
              <DatoRevision rotulo="Valor">
                {formatearImporte(nCantidad * nPrecio, "USD")} · {formatearImporte(nCantidad * nPrecio * nTc)}
              </DatoRevision>
            )}
            <DatoRevision rotulo="Saldo">
              <span className="num">
                {formatearCantidad(item.saldo)} → <b className={cn(saldoDespues < 0 && "text-danger-text")}>{formatearCantidad(saldoDespues)}</b>
              </span>
            </DatoRevision>
          </div>
          {(() => {
            const inicial = ficha.movimientos.find((m) => m.tipo === "inicial")
            return inicial && fechaEfectiva < inicial.fecha ? (
              <p className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[12.5px] text-warning-text">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Este movimiento es del {formatearFecha(fechaEfectiva)}, antes del stock inicial (
                {formatearFecha(inicial.fecha)}). En el extracto va a quedar antes, y el saldo a esa fecha puede dar
                negativo. Si el stock inicial es de antes, corregí su fecha.
              </p>
            ) : null
          })()}
          {saldoDespues < 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[12.5px] text-warning-text">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              El saldo queda negativo. Se registra igual —así lo definió el contador—, pero seguramente falta cargar una compra.
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12.5px] text-danger-text">{error}</p>
          )}
        </div>
      )}
    </DialogoPasos>
  )
}

function ElegirFactura({
  tipo,
  elegida,
  onElegir,
}: {
  tipo: "compra" | "venta"
  elegida: ComprobanteParaStock | null
  onElegir: (c: ComprobanteParaStock) => void
}) {
  const [q, setQ] = useState("")
  const [diferido, setDiferido] = useState("")
  useEffect(() => {
    const t = setTimeout(() => setDiferido(q), 250)
    return () => clearTimeout(t)
  }, [q])
  const url = `/api/admin/stock/comprobantes?${new URLSearchParams({ tipo, q: diferido })}`
  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<{ comprobantes: ComprobanteParaStock[] }>(url, { signal }),
  })
  const lista = useMemo(() => query.data?.comprobantes ?? [], [query.data])

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink">
        ¿De qué factura de {tipo} {tipo === "compra" ? "vino" : "salió"}? Tiene que estar cargada y confirmada.
      </p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tipo === "compra" ? "Proveedor o número de factura…" : "Cliente o número de factura…"}
          className="pl-8"
          autoFocus
        />
      </div>
      <div className="max-h-[300px] overflow-y-auto rounded-xl border border-line">
        {query.isPending ? (
          <LoadingState label="Buscando facturas…" />
        ) : lista.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12.5px] text-ink-muted">Ninguna factura con esa búsqueda.</p>
        ) : (
          <ul className="divide-y divide-line">
            {lista.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onElegir(c)}
                  aria-pressed={elegida?.id === c.id}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    elegida?.id === c.id ? "bg-brand-50" : "hover:bg-surface-muted"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{c.entidad}</span>
                    <span className="block font-mono text-[11.5px] text-ink-muted">
                      {c.etiqueta} · {formatearFecha(c.fecha)}
                    </span>
                  </span>
                  <span className="num shrink-0 text-[12.5px] text-ink-secondary">{formatearImporte(c.total, c.moneda)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Tarjeta({
  rotulo,
  valor,
  destacado,
  peligro,
}: {
  rotulo: string
  valor: string
  destacado?: boolean
  peligro?: boolean
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-e1">
      <p className="eyebrow">{rotulo}</p>
      <p
        className={cn(
          "num mt-1 text-[20px] font-semibold",
          peligro ? "text-danger-text" : destacado ? "text-brand-600" : "text-ink"
        )}
      >
        {valor}
      </p>
    </div>
  )
}
