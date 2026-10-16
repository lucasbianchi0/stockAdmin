"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  CalendarDays,
  Check,
  Circle,
  CircleDashed,
  Layers,
  Scale,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ORIGEN_ASIENTO_LABEL, type OrigenAsiento } from "@/lib/admin/asientos"
import { fechaLarga, type EstadoAsientoEspecial, type FichaEjercicio } from "@/lib/admin/ejercicios"
import { formatearImporte } from "@/lib/admin/moneda"
import { claves, mensajeError, pedirJson } from "@/lib/admin/query"
import { cn } from "@/lib/utils"

/**
 * Todo un ejercicio en una pantalla: cuánto se asentó, el resultado, mes por
 * mes, y en qué está el cierre. Cada número lleva a la vista que lo explica, ya
 * filtrada por el ejercicio —o por el mes—, así nadie tiene que acordarse de
 * que el 2025/26 va del 1/9 al 31/8.
 */

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`
const ultimoDia = (mes: string) => {
  const [a, m] = mes.split("-").map(Number)
  return `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`
}

export function FichaEjercicioClient({ id }: { id: string }) {
  const url = `/api/admin/ejercicios/${id}`
  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<FichaEjercicio>(url, { signal }),
  })

  if (query.isPending) return <LoadingState label="Armando el resumen del ejercicio…" />
  if (query.isError || !query.data) {
    return <ErrorState message={mensajeError(query.error, "No se pudo cargar el ejercicio")} onRetry={() => query.refetch()} />
  }
  const f = query.data
  const e = f.ejercicio
  const q = `ejercicio=${e.id}`
  const cuadra = Math.abs(f.debe - f.haber) < 0.01
  const ganancia = f.resultado >= 0

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta rotulo="Asientos" valor={String(e.asientos)} nota={`${f.facturasVenta} facturas de venta · ${f.facturasCompra} de compra`} />
        <Tarjeta
          rotulo={ganancia ? "Ganancia del ejercicio" : "Pérdida del ejercicio"}
          valor={formatearImporte(Math.abs(f.resultado))}
          tono={ganancia ? "exito" : "peligro"}
          nota="Lo que el cierre lleva a 410"
        />
        <Tarjeta rotulo="Ganancias" valor={formatearImporte(f.ingresos)} nota="Cuentas de ingreso" />
        <Tarjeta rotulo="Pérdidas" valor={formatearImporte(f.egresos)} nota="Cuentas de egreso" />
      </div>

      <div
        className={cn(
          "flex items-center gap-2.5 rounded-xl border px-4 py-3 text-[12.5px]",
          cuadra ? "border-success-line bg-success-soft text-success-text" : "border-danger-line bg-danger-soft text-danger-text"
        )}
      >
        {cuadra ? <Check className="h-4 w-4" /> : <Scale className="h-4 w-4" />}
        <span className="font-semibold">
          {cuadra ? "La partida doble del ejercicio cuadra" : `Descuadre de ${formatearImporte(Math.abs(f.debe - f.haber))}`}
        </span>
        <span className="text-ink-muted">
          Débitos {formatearImporte(f.debe)} · Créditos {formatearImporte(f.haber)}
        </span>
      </div>

      <section>
        <p className="eyebrow mb-2">Ver el ejercicio en Contabilidad</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Acceso href={`/admin/contabilidad?${q}`} icono={BookOpen} titulo="Libro diario" texto="Cada asiento, numerado desde 1" />
          <Acceso href={`/admin/contabilidad?${q}&modo=mes`} icono={CalendarDays} titulo="Libro diario por mes" texto="Un asiento resumen por mes, para el libro" />
          <Acceso href={`/admin/contabilidad/sumas-y-saldos?${q}`} icono={Scale} titulo="Sumas y saldos" texto="El estado de todas las cuentas al cierre" />
          <Acceso href={`/admin/contabilidad/mayor?${q}`} icono={Layers} titulo="Mayores" texto="Una cuenta a lo largo del ejercicio" />
          <Acceso
            href={`/admin/contabilidad/subdiarios/ventas?desde=${e.inicio}&hasta=${e.fin}`}
            icono={BookMarked}
            titulo="Subdiario IVA Ventas"
            texto="Todo el ejercicio, o elegí un mes"
          />
          <Acceso
            href={`/admin/contabilidad/subdiarios/compras?desde=${e.inicio}&hasta=${e.fin}`}
            icono={BookMarked}
            titulo="Subdiario IVA Compras"
            texto="Todo el ejercicio, o elegí un mes"
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="panel overflow-clip">
          <div className="panel-header">
            <p className="text-[13px] font-semibold text-ink">Mes por mes</p>
            <p className="text-[12px] text-ink-muted">Cada mes lleva a su libro diario</p>
          </div>
          {f.meses.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Todavía no hay asientos en este ejercicio" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Asientos</TableHead>
                  <TableHead className="text-right">Movimiento</TableHead>
                  <TableHead className="w-[250px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {f.meses.map((m) => (
                  <TableRow key={m.mes}>
                    <TableCell className="text-[13px] font-medium text-ink">{nombreMes(m.mes)}</TableCell>
                    <TableCell className="num text-right">{m.asientos}</TableCell>
                    <TableCell className="num text-right text-ink-secondary">{formatearImporte(m.importe)}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/admin/contabilidad?desde=${m.mes}-01&hasta=${ultimoDia(m.mes)}`}
                        className="text-[12px] font-medium text-brand-700 hover:underline"
                      >
                        Diario
                      </Link>
                      <span className="mx-1.5 text-ink-faint">·</span>
                      <Link
                        href={`/admin/contabilidad/subdiarios/ventas?mes=${m.mes}`}
                        className="text-[12px] font-medium text-brand-700 hover:underline"
                      >
                        IVA ventas
                      </Link>
                      <span className="mx-1.5 text-ink-faint">·</span>
                      <Link
                        href={`/admin/contabilidad/subdiarios/compras?mes=${m.mes}`}
                        className="text-[12px] font-medium text-brand-700 hover:underline"
                      >
                        IVA compras
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <div className="space-y-6">
          <section className="panel">
            <div className="panel-header">
              <p className="text-[13px] font-semibold text-ink">Apertura y cierre</p>
            </div>
            <ul className="divide-y divide-line">
              <Paso
                titulo="Asiento de apertura"
                estado={f.apertura}
                fecha={e.inicio}
                href="/admin/contabilidad/asientos/apertura-cierre"
                falta="Lo pasa el estudio"
              />
              <Paso
                titulo="Ajuste por inflación"
                estado={f.ajuste}
                fecha={e.fin}
                href="/admin/contabilidad/asientos/ajuste-inflacion"
                falta="Lo pasa el estudio"
              />
              <Paso
                titulo="Asiento de cierre"
                estado={f.cierre}
                fecha={e.fin}
                href="/admin/contabilidad/asientos/apertura-cierre"
                falta={e.enCurso ? "Cuando termine el ejercicio" : "Lo propone el sistema"}
              />
            </ul>
          </section>

          <section className="panel">
            <div className="panel-header">
              <p className="text-[13px] font-semibold text-ink">De dónde salen los asientos</p>
            </div>
            <ul className="divide-y divide-line">
              {Object.entries(f.asientosPorOrigen)
                .sort((a, b) => b[1] - a[1])
                .map(([origen, n]) => (
                  <li key={origen} className="flex items-center justify-between px-5 py-2.5 text-[12.5px]">
                    <span className="text-ink">{ORIGEN_ASIENTO_LABEL[origen as OrigenAsiento] ?? origen}</span>
                    <span className="num font-semibold text-ink">{n}</span>
                  </li>
                ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

function Tarjeta({
  rotulo,
  valor,
  nota,
  tono,
}: {
  rotulo: string
  valor: string
  nota?: string
  tono?: "exito" | "peligro"
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-e1">
      <p className="eyebrow">{rotulo}</p>
      <p
        className={cn(
          "num mt-1 text-[19px] font-semibold",
          tono === "exito" ? "text-success-text" : tono === "peligro" ? "text-danger-text" : "text-ink"
        )}
      >
        {valor}
      </p>
      {nota && <p className="mt-0.5 text-[11px] text-ink-muted">{nota}</p>}
    </div>
  )
}

function Acceso({
  href,
  icono: Icono,
  titulo,
  texto,
}: {
  href: string
  icono: typeof BookOpen
  titulo: string
  texto: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-e1 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
    >
      <Icono className="h-4 w-4 shrink-0 text-ink-muted group-hover:text-brand-600" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-ink">{titulo}</span>
        <span className="block text-[11.5px] text-ink-muted">{texto}</span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
    </Link>
  )
}

function Paso({
  titulo,
  estado,
  fecha,
  href,
  falta,
}: {
  titulo: string
  estado: EstadoAsientoEspecial
  fecha: string
  href: string
  falta: string
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-subtle">
        {estado === "registrado" ? (
          <Check className="h-4 w-4 shrink-0 text-success-text" />
        ) : estado === "borrador" ? (
          <CircleDashed className="h-4 w-4 shrink-0 text-warning-text" />
        ) : (
          <Circle className="h-4 w-4 shrink-0 text-ink-faint" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-ink">{titulo}</span>
          <span className="block text-[11.5px] text-ink-muted">
            {estado === "falta" ? falta : `Al ${fechaLarga(fecha)}`}
          </span>
        </span>
        <Badge tone={estado === "registrado" ? "success" : estado === "borrador" ? "warning" : "neutral"} size="sm">
          {estado === "registrado" ? "Registrado" : estado === "borrador" ? "Borrador" : "Pendiente"}
        </Badge>
      </Link>
    </li>
  )
}
