"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Download, PieChart } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  type PresupuestoFila,
} from "@/lib/comercial/presupuestos"
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
 */
export function ReportesComercialClient() {
  const router = useRouter()
  const [estado, setEstado] = useState<EstadoPresupuesto | "">("")

  const url = "/api/comercial/presupuestos"
  const consulta = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<{ presupuestos?: PresupuestoFila[] }>(url, { signal }),
  })

  const todos = useMemo(() => consulta.data?.presupuestos ?? [], [consulta.data])
  const filas = useMemo(
    () => (estado ? todos.filter((p) => p.estado === estado) : todos),
    [todos, estado]
  )

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
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-line bg-surface-subtle px-5 py-4">
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

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
            {([["", "Todos"], ...ESTADOS.map((e) => [e, ESTADO_LABEL[e]] as const)] as const).map(
              ([v, etiqueta]) => (
                <button
                  key={v}
                  onClick={() => setEstado(v as EstadoPresupuesto | "")}
                  aria-pressed={estado === v}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                    estado === v
                      ? "bg-brand-50 text-brand-700"
                      : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                  )}
                >
                  {etiqueta}
                </button>
              )
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={filas.length === 0}
            onClick={() =>
              descargarCsv(
                "presupuestos.csv",
                ["N.º", "Cliente", "Referencia", "Fecha", "Vendedor", "Estado", "Moneda", "Venta", "Costo", "Renta", "% renta"],
                filas.map((p) => [
                  p.numero,
                  p.clienteNombre ?? "",
                  p.referencia,
                  p.fecha,
                  p.vendedorNombre ?? "",
                  ESTADO_LABEL[p.estado],
                  p.moneda,
                  p.totales.venta,
                  p.totales.costo,
                  p.totales.rentabilidad,
                  p.totales.venta === 0 ? "" : Math.round(p.totales.rentaPct * 100),
                ])
              )
            }
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {filas.length === 0 ? (
        <EmptyState
          icon={PieChart}
          title={estado ? "Ningún presupuesto en ese estado" : "Todavía no hay presupuestos"}
          description="El reporte se arma solo con lo que se vaya cargando."
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
              <TableHead className="text-right">Venta</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Renta</TableHead>
              <TableHead className="text-right">%</TableHead>
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
                <TableCell className="max-w-[200px] truncate text-[12.5px] text-ink">
                  {p.clienteNombre ?? "—"}
                </TableCell>
                <TableCell className="max-w-[240px] truncate text-[12px] text-ink-secondary">
                  {p.referencia}
                </TableCell>
                <TableCell className="num whitespace-nowrap text-ink-secondary">
                  {formatearFecha(p.fecha)}
                </TableCell>
                <TableCell className="max-w-[130px] truncate text-[12px] text-ink-secondary">
                  {p.vendedorNombre ?? <span className="text-ink-faint">—</span>}
                </TableCell>
                <TableCell>
                  <Badge tone={ESTADO_TONO[p.estado]} size="sm">
                    {ESTADO_LABEL[p.estado]}
                  </Badge>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
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
