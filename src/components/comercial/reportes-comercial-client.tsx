"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, CalendarRange, Download, FileText, PieChart, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FiltroPill } from "@/components/ui/filtro-pill"
import { FranjaFija } from "@/components/ui/franja-fija"
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
import { descargarCsv } from "@/lib/admin/csv"
import { formatearFecha } from "@/lib/admin/fecha"
import { formatearImporte } from "@/lib/admin/moneda"
import { claves, mensajeError, pedirJson } from "@/lib/admin/query"
import {
  ESTADOS,
  ESTADO_LABEL,
  ESTADO_TONO,
  type EstadoPresupuesto,
  PUNTOS_SOBRE_RENTA,
  puntosDe,
  type PresupuestoFila,
} from "@/lib/comercial/presupuestos"
import type { FacturaDeReporte } from "@/lib/comercial/presupuesto-facturas-server"
import { cn } from "@/lib/utils"

/**
 * El reporte de presupuestos.
 *
 * El pedido enumera nueve columnas: AM, cliente, fecha, importe facturado,
 * renta, costo, gastos, puntos instalados y factura. Cuatro de ellas —AM,
 * gastos, puntos instalados y el número de factura— todavía no tienen de dónde
 * salir, así que no están: una columna vacía en todas las filas se lee como un
 * error del sistema y no como un dato que falta.
 *
 * Lo que sí sale de los presupuestos cargados está completo, y es la mayoría de
 * lo que el reporte tiene que contestar: quién, cuándo, cuánto se vendió, cuánto
 * costó y cuánto quedó.
 *
 * Los **Puntos** (8% de la renta de lo facturado) son la base de la comisión,
 * y la columna **Facturas** muestra de qué facturas salen: cada una abre la
 * factura en Administración.
 * El resumen de arriba queda fijo al bajar: la tabla es larga y lo que se quiere
 * tener a la vista mientras se la recorre son los totales.
 */
export function ReportesComercialClient({ veFacturas }: { veFacturas: boolean }) {
  const router = useRouter()
  const [estado, setEstado] = useState<EstadoPresupuesto | "">("")
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [vendedor, setVendedor] = useState("")

  const url = "/api/comercial/presupuestos"
  const consulta = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<{ presupuestos?: PresupuestoFila[] }>(url, { signal }),
  })

  const todos = useMemo(() => consulta.data?.presupuestos ?? [], [consulta.data])

  // Qué facturas tiene cada presupuesto facturado: el detalle de los Puntos.
  const urlFacturas = "/api/comercial/presupuestos/facturas"
  const facturas =
    useQuery({
      queryKey: claves.url(urlFacturas),
      queryFn: ({ signal }) => pedirJson<{ facturas: Record<string, FacturaDeReporte[]> }>(urlFacturas, { signal }),
    }).data?.facturas ?? {}
  const filas = useMemo(
    () =>
      todos.filter((p) => {
        const f = p.fecha.slice(0, 10)
        return (
          (!estado || p.estado === estado) &&
          (!vendedor || (vendedor === "sin" ? !p.vendedorId : p.vendedorId === vendedor)) &&
          (!desde || f >= desde) &&
          (!hasta || f <= hasta)
        )
      }),
    [todos, estado, vendedor, desde, hasta]
  )
  const hayFiltro = Boolean(estado || vendedor || desde || hasta)

  // Los vendedores que tienen presupuestos, como el filtro de AM del CRM.
  const vendedores = useMemo(() => {
    const m = new Map<string, string>()
    let sinVendedor = false
    for (const p of todos) {
      if (p.vendedorId) m.set(p.vendedorId, p.vendedorNombre ?? "Sin nombre")
      else sinVendedor = true
    }
    const lista = [...m].map(([valor, etiqueta]) => ({ valor, etiqueta })).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"))
    return sinVendedor ? [...lista, { valor: "sin", etiqueta: "Sin vendedor" }] : lista
  }, [todos])

  /*
   * Los totales van por moneda y no sumados.
   *
   * Un presupuesto en dólares y otro en pesos no se suman sin elegir un tipo de
   * cambio, y elegirlo acá daría un número que cambia solo. Es la misma regla
   * que el resto del sistema.
   */
  const totales = useMemo(() => {
    const vacio = () => ({ venta: 0, costo: 0, renta: 0, n: 0 })
    const acc = { ARS: vacio(), USD: vacio() }
    for (const p of filas) {
      const m = acc[p.moneda]
      m.venta += p.totales.venta
      m.costo += p.totales.costo
      m.renta += p.totales.rentabilidad
      m.n++
    }
    return acc
  }, [filas])

  if (consulta.isPending) return <LoadingState label="Armando el reporte…" />
  if (consulta.isError) {
    return (
      <ErrorState
        message={mensajeError(consulta.error, "No se pudo armar el reporte")}
        onRetry={() => consulta.refetch()}
      />
    )
  }

  return (
    <div className="panel overflow-clip">
      <FranjaFija className="border-b border-line bg-surface-subtle">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 pb-3 pt-4">
          {filas.length === 0 && <Total rotulo="Presupuestos" valor="0" />}
          {(["ARS", "USD"] as const).map((m) =>
            totales[m].n === 0 ? null : (
              <div key={m} className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <Total rotulo={`Vendido en ${m === "ARS" ? "pesos" : "dólares"}`} valor={formatearImporte(totales[m].venta, m)} />
                <Total rotulo="Costo" valor={formatearImporte(totales[m].costo, m)} />
                <Total
                  rotulo="Renta"
                  valor={formatearImporte(totales[m].renta, m)}
                  tono={totales[m].renta < 0 ? "danger" : undefined}
                />
                <Total
                  rotulo="% de renta"
                  valor={
                    totales[m].venta === 0
                      ? "—"
                      : `${Math.round((totales[m].renta / totales[m].venta) * 100)} %`
                  }
                />
              </div>
            )
          )}

          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={filas.length === 0}
            onClick={() =>
              descargarCsv(
                "presupuestos.csv",
                ["N.º", "Cliente", "Referencia", "Fecha", "Vendedor", "Estado", "Facturas", "Moneda", "Venta", "Costo", "Renta", "% renta", "Puntos"],
                filas.map((p) => [
                  p.numero,
                  p.clienteNombre ?? "",
                  p.referencia,
                  p.fecha,
                  p.vendedorNombre ?? "",
                  ESTADO_LABEL[p.estado],
                  (facturas[p.id] ?? []).map((f) => f.etiqueta).join(" · "),
                  p.moneda,
                  p.totales.venta,
                  p.totales.costo,
                  p.totales.rentabilidad,
                  p.totales.venta === 0 ? "" : Math.round(p.totales.rentaPct * 100),
                  puntosDe(p) ?? "",
                ])
              )
            }
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </Button>
        </div>

        {/* Los filtros en una fila, con el mismo estilo que el CRM. Los
            totales de arriba suman sólo lo filtrado. */}
        <div className="flex flex-wrap items-center gap-1.5 px-5 pb-3.5">
          <RangoFechas
            desde={desde}
            hasta={hasta}
            onCambio={(d, h) => {
              setDesde(d)
              setHasta(h)
            }}
          />
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <FiltroPill
            rotulo="Vendedor"
            valor={vendedor}
            onCambio={setVendedor}
            opciones={vendedores}
          />
          <FiltroPill
            rotulo="Estado"
            valor={estado}
            onCambio={(v) => setEstado(v as EstadoPresupuesto | "")}
            opciones={ESTADOS.map((e) => ({ valor: e, etiqueta: ESTADO_LABEL[e] }))}
          />
          {hayFiltro && (
            <button
              onClick={() => {
                setDesde("")
                setHasta("")
                setVendedor("")
                setEstado("")
              }}
              className="ml-1 text-[12px] font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Limpiar filtros
            </button>
          )}
          <span className="num ml-auto text-[12px] text-ink-muted">
            {filas.length} de {todos.length} presupuesto{todos.length === 1 ? "" : "s"}
          </span>
        </div>
      </FranjaFija>

      {filas.length === 0 ? (
        <EmptyState
          icon={PieChart}
          title={hayFiltro ? "Ningún presupuesto con esos filtros" : "Todavía no hay presupuestos"}
          description={
            hayFiltro
              ? "Probá con otro período, vendedor o estado."
              : "El reporte se arma solo con lo que se vaya cargando."
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N.º</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Facturas</TableHead>
              <TableHead className="text-right">Venta</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Renta</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead
                className="text-right"
                title={`${PUNTOS_SOBRE_RENTA * 100}% de la renta, sólo en lo facturado`}
              >
                Puntos
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((p) => (
              <TableRow
                key={p.id}
                onClick={() => router.push(`/comercial/presupuestos/${p.id}`)}
                className="cursor-pointer"
              >
                <TableCell className="num font-semibold text-ink">{p.numero}</TableCell>
                {/* Angostas para que entren todas sin scroll lateral en una
                    notebook; el texto entero queda en el tooltip. */}
                <TableCell
                  className="max-w-[160px] truncate text-[12.5px] text-ink"
                  title={p.clienteNombre ?? undefined}
                >
                  {p.clienteNombre ?? "—"}
                </TableCell>
                <TableCell
                  className="max-w-[170px] truncate text-[12px] text-ink-secondary"
                  title={p.referencia}
                >
                  {p.referencia}
                </TableCell>
                <TableCell className="num whitespace-nowrap text-ink-secondary">
                  {formatearFecha(p.fecha)}
                </TableCell>
                <TableCell className="max-w-[120px] truncate text-[12px] text-ink-secondary">
                  {p.vendedorNombre ?? <span className="text-ink-faint">—</span>}
                </TableCell>
                <TableCell>
                  <Badge tone={ESTADO_TONO[p.estado]} size="sm">
                    {ESTADO_LABEL[p.estado]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <FacturasVinculadas
                    facturas={facturas[p.id] ?? []}
                    facturado={puntosDe(p) !== null}
                    enlazar={veFacturas}
                  />
                </TableCell>
                <TableCell className="num whitespace-nowrap text-right font-semibold text-ink">
                  {formatearImporte(p.totales.venta, p.moneda)}
                </TableCell>
                <TableCell className="num whitespace-nowrap text-right text-ink-secondary">
                  {formatearImporte(p.totales.costo, p.moneda)}
                </TableCell>
                <TableCell
                  className={cn(
                    "num whitespace-nowrap text-right font-medium",
                    p.totales.rentabilidad < 0 ? "text-danger-text" : "text-ink-secondary"
                  )}
                >
                  {formatearImporte(p.totales.rentabilidad, p.moneda)}
                </TableCell>
                <TableCell
                  className={cn(
                    "num text-right",
                    p.totales.rentabilidad < 0 ? "text-danger-text" : "text-ink-muted"
                  )}
                >
                  {p.totales.venta === 0 ? "—" : `${Math.round(p.totales.rentaPct * 100)}%`}
                </TableCell>
                <TableCell className="num whitespace-nowrap text-right font-medium text-ink">
                  {(() => {
                    const puntos = puntosDe(p)
                    return puntos === null ? (
                      <span className="text-ink-faint">—</span>
                    ) : (
                      formatearImporte(puntos, p.moneda)
                    )
                  })()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

/**
 * Las facturas de un presupuesto, una píldora cada una. La píldora entera es
 * el enlace: abre esa factura en Administración. Sin permiso para verlas, se
 * muestran igual pero sin enlace, para no mandar a nadie a una pantalla que no
 * puede abrir.
 */
function FacturasVinculadas({
  facturas,
  facturado,
  enlazar,
}: {
  facturas: FacturaDeReporte[]
  facturado: boolean
  enlazar: boolean
}) {
  if (facturas.length === 0) {
    return facturado ? (
      <span className="whitespace-nowrap text-[11.5px] text-warning-text" title="Abrí el presupuesto y elegí la factura">
        Sin vincular
      </span>
    ) : (
      <span className="text-ink-faint">—</span>
    )
  }
  const pildora =
    "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 font-mono text-[11px] transition-colors"
  return (
    <div className="flex flex-col items-start gap-1">
      {facturas.map((f) =>
        enlazar ? (
          <Link
            key={f.id}
            href={`/admin/ventas/listado?ver=${f.id}`}
            onClick={(e) => e.stopPropagation()}
            title="Abrir la factura"
            className={cn(
              pildora,
              "group border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-300 hover:bg-brand-100"
            )}
          >
            <FileText className="h-3 w-3 shrink-0" />
            {f.etiqueta}
            <ArrowRight className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ) : (
          <span key={f.id} className={cn(pildora, "border-line bg-surface-subtle text-ink-secondary")}>
            <FileText className="h-3 w-3 shrink-0" />
            {f.etiqueta}
          </span>
        )
      )}
    </div>
  )
}

/* ── Rango de fechas ─────────────────────────────────────────────────────── */

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/** Los atajos de siempre. Se calculan al usarlos, en hora local: la fecha de
 *  hoy en UTC ya es mañana a partir de las 21. */
const ATAJOS: { valor: string; etiqueta: string; rango: () => [string, string] }[] = [
  {
    valor: "mes",
    etiqueta: "Este mes",
    rango: () => {
      const h = new Date()
      return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(new Date(h.getFullYear(), h.getMonth() + 1, 0))]
    },
  },
  {
    valor: "mes-pasado",
    etiqueta: "Mes pasado",
    rango: () => {
      const h = new Date()
      return [iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), iso(new Date(h.getFullYear(), h.getMonth(), 0))]
    },
  },
  {
    valor: "3-meses",
    etiqueta: "Últimos 3 meses",
    rango: () => {
      const h = new Date()
      return [iso(new Date(h.getFullYear(), h.getMonth() - 2, 1)), iso(h)]
    },
  },
  {
    valor: "anio",
    etiqueta: "Este año",
    rango: () => {
      const a = new Date().getFullYear()
      return [`${a}-01-01`, `${a}-12-31`]
    },
  },
]

/**
 * Desde–hasta en una sola píldora, con los atajos al lado. Elegir un atajo
 * completa las dos fechas, que se pueden seguir ajustando a mano; la píldora
 * se marca cuando hay un rango puesto, como los filtros del CRM.
 */
function RangoFechas({
  desde,
  hasta,
  onCambio,
}: {
  desde: string
  hasta: string
  onCambio: (desde: string, hasta: string) => void
}) {
  const activo = Boolean(desde || hasta)
  const atajo = ATAJOS.find((a) => {
    const [d, h] = a.rango()
    return d === desde && h === hasta
  })

  return (
    <>
      <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-0.5">
        {ATAJOS.map((a) => (
          <button
            key={a.valor}
            onClick={() => (atajo?.valor === a.valor ? onCambio("", "") : onCambio(...a.rango()))}
            aria-pressed={atajo?.valor === a.valor}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors",
              atajo?.valor === a.valor
                ? "bg-brand-50 text-brand-700"
                : "text-ink-muted hover:bg-surface-muted hover:text-ink"
            )}
          >
            {a.etiqueta}
          </button>
        ))}
      </div>
      <div
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-full border pl-3 pr-1 text-[12.5px] transition-colors",
          activo ? "border-brand-200 bg-brand-50" : "border-line bg-surface hover:border-line-strong"
        )}
      >
        <CalendarRange className={cn("h-3.5 w-3.5 shrink-0", activo ? "text-brand-600" : "text-ink-faint")} />
        <Input
          type="date"
          aria-label="Desde"
          value={desde}
          max={hasta || undefined}
          onChange={(e) => onCambio(e.target.value, hasta)}
          className="h-6 w-[118px] border-0 bg-transparent px-1 text-[12px] shadow-none focus-visible:ring-0"
        />
        <ArrowRight className="h-3 w-3 shrink-0 text-ink-faint" />
        <Input
          type="date"
          aria-label="Hasta"
          value={hasta}
          min={desde || undefined}
          onChange={(e) => onCambio(desde, e.target.value)}
          className="h-6 w-[118px] border-0 bg-transparent px-1 text-[12px] shadow-none focus-visible:ring-0"
        />
        {activo ? (
          <button
            type="button"
            onClick={() => onCambio("", "")}
            aria-label="Quitar el rango de fechas"
            className="rounded-full p-1 text-brand-700/60 transition-colors hover:bg-brand-100 hover:text-brand-700"
          >
            <X className="h-3 w-3" />
          </button>
        ) : (
          <span className="w-2" />
        )}
      </div>
    </>
  )
}

function Total({
  rotulo,
  valor,
  tono,
}: {
  rotulo: string
  valor: string
  tono?: "danger"
}) {
  return (
    <div>
      <p className="eyebrow">{rotulo}</p>
      <p
        className={cn(
          "num mt-0.5 text-[16px] font-bold tracking-[-0.02em]",
          tono === "danger" ? "text-danger-text" : "text-ink"
        )}
      >
        {valor}
      </p>
    </div>
  )
}
