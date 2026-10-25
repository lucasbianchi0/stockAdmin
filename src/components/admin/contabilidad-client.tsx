"use client"

import { Fragment, useEffect, useState } from "react"
import Link from "next/link"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { AlertTriangle, BookOpen, Check, Download, Layers, Loader2, Printer, Scale } from "lucide-react"
import { toast } from "sonner"

import { SelectorCuenta } from "@/components/admin/selector-cuenta"
import { CorregirImputacionDialog } from "@/components/admin/corregir-imputacion-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState, LoadingState } from "@/components/ui/states"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ORIGEN_ASIENTO_LABEL,
  agruparSumasYSaldos,
  saldoNatural,
  type ColumnasSumasSaldos,
  type Asiento,
  type DocumentoSinAsiento,
  type Mayor,
  type OrigenAsiento,
  type SumasYSaldos,
} from "@/lib/admin/asientos"
import { descargarCsv } from "@/lib/admin/csv"
import { formatearImporte } from "@/lib/admin/moneda"
import { TIPO_CUENTA_LABEL } from "@/lib/admin/plan-cuentas"
import { claves, mensajeError, pedirJson } from "@/lib/admin/query"
import { cn } from "@/lib/utils"
import type { Ejercicio } from "@/lib/admin/ejercicios"
import { useRangoDeEjercicio } from "@/lib/admin/use-ejercicios"

/**
 * La contabilidad, una pantalla por vista.
 *
 * Eran cuatro solapas en una sola pantalla. Ahora cada una es un ítem del menú
 * —5.1 Mayores, 5.2 Libro diario, 5.5 Sumas y saldos—, que es como las nombra el
 * árbol del contador. Las piezas son las mismas; lo que cambia es la puerta.
 *
 * El orden sigue sin ser casual: **Diario** es cada asiento como se escribió,
 * **Mayor** es una cuenta a lo largo del tiempo, **Sumas y saldos** es el estado
 * de todas, y **Sin asentar** es lo que todavía no entró.
 *
 * Todo se lee en pesos. La moneda original de cada línea está a la vista como
 * dato, pero las columnas suman una sola moneda: mezclarlas es el error que el
 * punto 6 del documento del contador pedía arreglar.
 */

export type VistaContable = "diario" | "mayor" | "saldos" | "pendientes"

/** Sin filtro: el mismo URL que el aviso de cada módulo, así comparten caché. */
const URL_PENDIENTES = "/api/admin/contabilidad/pendientes"

type RespuestaPendientes = { documentos?: DocumentoSinAsiento[]; cantidad?: number }

/** Una sola query para el aviso y para la lista: se invalidan juntas. */
function usePendientes() {
  return useQuery({
    queryKey: claves.url(URL_PENDIENTES),
    queryFn: ({ signal }) => pedirJson<RespuestaPendientes>(URL_PENDIENTES, { signal }),
  })
}

export function ContabilidadClient({ vista }: { vista: VistaContable }) {
  // El aviso de pendientes va arriba de todas las vistas y no solo de la suya:
  // una alerta que solo se ve entrando a la pantalla donde está el problema no
  // sirve de nada. Sin pendientes no se dibuja: un cartel permanente entrena a
  // no mirarlo.
  const pendientes = usePendientes().data?.cantidad ?? 0

  return (
    <>
      {vista !== "pendientes" && pendientes > 0 && (
        <Link
          href="/admin/contabilidad/sin-asentar"
          className="mb-4 flex items-center gap-2.5 rounded-lg border border-warning-line bg-warning-soft px-3 py-2.5 text-[12.5px] text-warning-text transition-colors hover:bg-warning-soft/70"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            {pendientes === 1
              ? "Hay 1 documento sin asentar: está en los saldos pero no en el mayor."
              : `Hay ${pendientes} documentos sin asentar: están en los saldos pero no en el mayor.`}
          </span>
          <span className="shrink-0 font-semibold">Revisar →</span>
        </Link>
      )}

      {vista === "diario" && <Diario />}
      {vista === "mayor" && <MayorDeCuenta />}
      {vista === "saldos" && <Saldos />}
      {vista === "pendientes" && <Pendientes />}
    </>
  )
}

/* ── Rango de fechas, compartido ──────────────────────────────────────────── */

/**
 * El período de una vista: un ejercicio, o fechas a mano.
 *
 * Elegir un ejercicio llena las dos fechas; tocar una fecha a mano lo pasa a
 * «Rango propio». Así se puede arrancar en el ejercicio y acotar a un mes sin
 * perder de vista de cuál se trata.
 */
function RangoFechas({
  desde,
  hasta,
  onDesde,
  onHasta,
  ejercicios,
}: {
  desde: string
  hasta: string
  onDesde: (v: string) => void
  onHasta: (v: string) => void
  ejercicios: Ejercicio[]
}) {
  const actual = ejercicios.find((e) => e.inicio === desde && e.fin === hasta)
  const valor = actual ? String(actual.id) : !desde && !hasta ? "todos" : "rango"

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Ejercicio"
        value={valor}
        onChange={(e) => {
          const v = e.target.value
          if (v === "todos") {
            onDesde("")
            onHasta("")
            return
          }
          const ej = ejercicios.find((x) => String(x.id) === v)
          if (ej) {
            onDesde(ej.inicio)
            onHasta(ej.fin)
          }
        }}
        className="h-9 rounded-md border border-line bg-surface px-2 text-[12.5px] font-medium text-ink"
      >
        {[...ejercicios].reverse().map((e) => (
          <option key={e.id} value={e.id}>
            Ejercicio {e.nombre}
            {e.enCurso ? " (en curso)" : ""}
          </option>
        ))}
        <option value="todos">Todos los ejercicios</option>
        {valor === "rango" && <option value="rango">Rango propio</option>}
      </select>
      <label className="text-[12px] text-ink-muted" htmlFor="desde">
        Desde
      </label>
      <Input
        id="desde"
        type="date"
        value={desde}
        onChange={(e) => onDesde(e.target.value)}
        className="w-[150px]"
      />
      <label className="text-[12px] text-ink-muted" htmlFor="hasta">
        Hasta
      </label>
      <Input
        id="hasta"
        type="date"
        value={hasta}
        onChange={(e) => onHasta(e.target.value)}
        className="w-[150px]"
      />
    </div>
  )
}

/* ── 1 · Libro diario ─────────────────────────────────────────────────────── */

type ModoDiario = "asientos" | "mes"

function Diario() {
  const { desde, hasta, setDesde, setHasta, listo, ejercicios } = useRangoDeEjercicio()
  const [origen, setOrigen] = useState("")
  /**
   * "Resumido por mes" es el punto 5 del pedido: un asiento por mes con todas las
   * cuentas agrupadas, para copiar al libro rubricado.
   *
   * Es una LECTURA, no un asiento nuevo. Los asientos de cada factura siguen
   * siendo los que están en la base —el contador lo pidió así— y registrar
   * además un resumen duplicaría cada importe del mes.
   */
  // `?modo=mes` abre directo el resumen (el enlace de la ficha del ejercicio).
  const [modo, setModo] = useState<ModoDiario>("asientos")
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("modo") === "mes") setModo("mes")
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5">
          {(
            [
              ["asientos", "Por asiento"],
              ["mes", "Resumido por mes"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              onClick={() => setModo(valor)}
              aria-pressed={modo === valor}
              className={cn(
                "rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                modo === valor
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-muted hover:bg-surface-muted hover:text-ink"
              )}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        <RangoFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} ejercicios={ejercicios} />
        {modo === "asientos" && (
          <select
            aria-label="Origen"
            value={origen}
            onChange={(e) => setOrigen(e.target.value)}
            className="h-9 rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink"
          >
            <option value="">Todos los orígenes</option>
            {(Object.keys(ORIGEN_ASIENTO_LABEL) as OrigenAsiento[]).map((o) => (
              <option key={o} value={o}>
                {ORIGEN_ASIENTO_LABEL[o]}
              </option>
            ))}
          </select>
        )}
      </div>

      {!listo ? (
        <LoadingState label="Cargando el libro diario…" />
      ) : modo === "asientos" ? (
        <DiarioPorAsiento desde={desde} hasta={hasta} origen={origen} />
      ) : (
        <DiarioMensual desde={desde} hasta={hasta} />
      )}
    </div>
  )
}

function DiarioPorAsiento({ desde, hasta, origen }: { desde: string; hasta: string; origen: string }) {
  const p = new URLSearchParams()
  if (desde) p.set("desde", desde)
  if (hasta) p.set("hasta", hasta)
  if (origen) p.set("origen", origen)
  const url = `/api/admin/contabilidad/diario?${p}`

  // Al cambiar el filtro se sigue viendo el período anterior hasta que llega el nuevo.
  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) =>
      pedirJson<{ asientos?: Asiento[]; truncado?: boolean }>(url, { signal }),
    placeholderData: keepPreviousData,
  })
  const asientos = query.data?.asientos ?? []
  const truncado = Boolean(query.data?.truncado)

  // El Excel lleva el período entero, no los asientos que entran en pantalla:
  // es lo que se copia al libro.
  const [exportando, setExportando] = useState(false)
  const exportar = async () => {
    setExportando(true)
    try {
      const todo = await pedirJson<{ asientos: Asiento[] }>(`${url}&completo=1`)
      descargarCsv(
        "libro-diario.csv",
        ["Fecha", "Ejercicio", "Asiento", "Origen", "Descripción", "Cuenta", "Detalle", "Debe", "Haber"],
        todo.asientos.flatMap((a) =>
          a.lineas.map((l) => [
            a.fecha,
            a.ejercicioNombre ?? "",
            a.numero,
          ORIGEN_ASIENTO_LABEL[a.origen],
          a.descripcion,
          `${l.cuentaCodigo} · ${l.cuentaNombre}`,
          l.auxiliarNombre ?? l.detalle ?? "",
            l.debeArs || "",
            l.haberArs || "",
          ])
        )
      )
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo bajar el libro diario"))
    } finally {
      setExportando(false)
    }
  }

  if (query.isPending) return <LoadingState label="Cargando el libro diario…" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-ink-muted">
          {asientos.length} asiento{asientos.length === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!asientos.length}
            onClick={() => window.open(`/admin/contabilidad/imprimir?${p}`, "_blank", "noopener")}
          >
            <Printer className="h-3.5 w-3.5" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportar} disabled={!asientos.length || exportando}>
            {exportando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Excel
          </Button>
        </div>
      </div>

      {truncado && (
        <p className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[12px] text-warning-text">
          En pantalla se ven los asientos más recientes del período. El PDF y el Excel llevan el
          período completo.
        </p>
      )}

      {!asientos.length ? (
        <EmptyState
          icon={BookOpen}
          title="No hay asientos en el período"
          description="Los asientos se generan solos al cargar facturas, recibos y movimientos."
        />
      ) : (
        <div className="space-y-3">
          {asientos.map((a) => (
            <AsientoCard key={a.id} asiento={a} />
          ))}
        </div>
      )}
    </div>
  )
}

type LineaMensual = { cuentaId: string; codigo: string; nombre: string; debe: number; haber: number }
type AsientoMensual = {
  mes: string
  asientos: number
  lineas: LineaMensual[]
  debe: number
  haber: number
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

/** `2026-09` → `Septiembre 2026`. */
function nombreMes(mes: string): string {
  const [a, m] = mes.split("-")
  const nombre = MESES[Number(m) - 1] ?? m
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${a}`
}

function DiarioMensual({ desde, hasta }: { desde: string; hasta: string }) {
  const p = new URLSearchParams()
  if (desde) p.set("desde", desde)
  if (hasta) p.set("hasta", hasta)
  const url = `/api/admin/contabilidad/diario-mensual?${p}`

  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) =>
      pedirJson<{ meses?: AsientoMensual[]; truncado?: boolean }>(url, { signal }),
    placeholderData: keepPreviousData,
  })
  const meses = query.data?.meses ?? []

  const exportar = () =>
    descargarCsv(
      "libro-diario-mensual.csv",
      ["Mes", "Cuenta", "Debe", "Haber"],
      meses.flatMap((m) =>
        m.lineas.map((l) => [nombreMes(m.mes), `${l.codigo} · ${l.nombre}`, l.debe || "", l.haber || ""])
      )
    )

  if (query.isPending) return <LoadingState label="Agrupando el libro diario por mes…" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-ink-muted">
          Un asiento por mes con cada cuenta neteada. Es una vista: los asientos de cada documento
          siguen siendo los registrados.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!meses.length}
            onClick={() => window.open(`/admin/contabilidad/imprimir?${p}&modo=mes`, "_blank", "noopener")}
          >
            <Printer className="h-3.5 w-3.5" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportar} disabled={!meses.length}>
            <Download className="h-3.5 w-3.5" />
            Excel
          </Button>
        </div>
      </div>

      {query.data?.truncado && (
        <p className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[12px] text-warning-text">
          El período tiene demasiados movimientos para agruparlos de una vez. Acotá el rango de
          fechas: los totales de abajo están incompletos.
        </p>
      )}

      {!meses.length ? (
        <EmptyState icon={BookOpen} title="No hay asientos en el período" />
      ) : (
        <div className="space-y-3">
          {meses.map((m) => (
            <div key={m.mes} className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[12.5px] font-semibold text-ink">{nombreMes(m.mes)}</span>
                  <span className="text-[11.5px] text-ink-muted">
                    resume {m.asientos} asiento{m.asientos === 1 ? "" : "s"}
                  </span>
                </div>
                <span className="num font-mono text-[12px] font-semibold text-ink">
                  {formatearImporte(m.debe)}
                </span>
              </div>
              <Table>
                <TableBody>
                  {m.lineas.map((l) => (
                    <TableRow key={l.cuentaId}>
                      <TableCell className="w-[60%]">
                        <p className={cn("text-[12.5px] text-ink", l.haber > 0 && "pl-6")}>
                          <span className="font-mono text-[11px] text-ink-faint">{l.codigo}</span>{" "}
                          {l.nombre}
                        </p>
                      </TableCell>
                      <TableCell className="num w-[20%] text-right font-mono text-[12px] text-ink">
                        {l.debe > 0 ? formatearImporte(l.debe, "ARS", { simbolo: false }) : ""}
                      </TableCell>
                      <TableCell className="num w-[20%] text-right font-mono text-[12px] text-ink">
                        {l.haber > 0 ? formatearImporte(l.haber, "ARS", { simbolo: false }) : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-surface-subtle">
                    <TableCell className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                      Totales
                    </TableCell>
                    <TableCell className="num text-right font-mono text-[12px] font-semibold text-ink">
                      {formatearImporte(m.debe, "ARS", { simbolo: false })}
                    </TableCell>
                    <TableCell className="num text-right font-mono text-[12px] font-semibold text-ink">
                      {formatearImporte(m.haber, "ARS", { simbolo: false })}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Un asiento como se escribe en un libro: cabecera y sus líneas debajo. */
function AsientoCard({ asiento }: { asiento: Asiento }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex items-baseline gap-2.5">
          <span className="num font-mono text-[12px] font-semibold text-brand-600">
            N° {asiento.numero}
            {asiento.ejercicioNombre && (
              <span className="ml-1 font-sans text-[10.5px] font-medium text-ink-faint">
                · {asiento.ejercicioNombre}
              </span>
            )}
          </span>
          <span className="text-[12.5px] font-medium text-ink">{asiento.descripcion}</span>
          <Badge tone="neutral" size="sm">
            {ORIGEN_ASIENTO_LABEL[asiento.origen]}
          </Badge>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="num font-mono text-[11.5px] text-ink-muted">
            {formatearFecha(asiento.fecha)}
          </span>
          <span className="num font-mono text-[12px] font-semibold text-ink">
            {formatearImporte(asiento.totalArs)}
          </span>
        </div>
      </div>

      <Table>
        <TableBody>
          {asiento.lineas.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="w-[45%]">
                {/* La sangría del haber es la convención de cualquier libro
                    diario en papel: el crédito va corrido a la derecha. */}
                <div className={cn(l.haberArs > 0 && "pl-6")}>
                  <p className="text-[12.5px] text-ink">
                    <span className="font-mono text-[11px] text-ink-faint">{l.cuentaCodigo}</span>{" "}
                    {l.cuentaNombre}
                  </p>
                  {(l.auxiliarNombre || l.detalle) && (
                    <p className="text-[11px] text-ink-muted">
                      {l.auxiliarNombre ?? l.detalle}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                {l.moneda !== "ARS" && (
                  <span className="num font-mono text-[10.5px] text-ink-faint">
                    {formatearImporte(l.debe || l.haber, l.moneda)}
                  </span>
                )}
              </TableCell>
              <TableCell className="num w-[16%] text-right font-mono text-[12px] text-ink">
                {l.debeArs > 0 ? formatearImporte(l.debeArs, "ARS", { simbolo: false }) : ""}
              </TableCell>
              <TableCell className="num w-[16%] text-right font-mono text-[12px] text-ink">
                {l.haberArs > 0 ? formatearImporte(l.haberArs, "ARS", { simbolo: false }) : ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/* ── 2 · Mayor ────────────────────────────────────────────────────────────── */

function MayorDeCuenta() {
  const [cuenta, setCuenta] = useState("")
  const { desde, hasta, setDesde, setHasta, listo, ejercicios } = useRangoDeEjercicio()

  const p = new URLSearchParams({ cuenta })
  if (desde) p.set("desde", desde)
  if (hasta) p.set("hasta", hasta)
  const url = `/api/admin/contabilidad/mayor?${p}`

  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<Partial<Mayor>>(url, { signal }),
    enabled: Boolean(cuenta) && listo,
    placeholderData: keepPreviousData,
  })
  const datos = query.data
  // Mientras llega otra cuenta no se muestra el mayor de la anterior: con fechas
  // nuevas sí se deja el período viejo a la vista, pero confundir una cuenta con
  // otra es peor que esperar.
  const deOtraCuenta = query.isPlaceholderData && datos?.cuenta?.id !== cuenta
  const cargando = query.isPending || deOtraCuenta
  const mayor = !deOtraCuenta && datos?.cuenta ? (datos as Mayor) : null

  const exportar = () => {
    if (!mayor) return
    descargarCsv(
      `mayor-${mayor.cuenta.codigo}.csv`,
      [
        "Fecha",
        "Asiento",
        "Origen",
        "Concepto",
        "Auxiliar",
        "Débitos",
        "Créditos",
        "Saldo",
        "Detalle",
      ],
      mayor.filas.map((f) => [
        f.fecha,
        f.numero,
        ORIGEN_ASIENTO_LABEL[f.origen],
        f.descripcion,
        f.auxiliarNombre ?? "",
        f.debeArs || "",
        f.haberArs || "",
        f.saldoArs,
        f.detalle ?? "",
      ])
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[320px]">
            <label htmlFor="cuenta-mayor" className="mb-1 block text-[12px] text-ink-muted">
              Cuenta
            </label>
            <SelectorCuenta id="cuenta-mayor" valor={cuenta} onElegir={setCuenta} />
          </div>
          <RangoFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} ejercicios={ejercicios} />
        </div>
        <Button variant="outline" size="sm" onClick={exportar} disabled={!mayor?.filas.length}>
          <Download className="h-3.5 w-3.5" />
          Exportar
        </Button>
      </div>

      {!cuenta ? (
        <EmptyState
          icon={Layers}
          title="Elegí una cuenta"
          description="El mayor muestra todo lo que pasó por una cuenta, con el saldo corrido."
        />
      ) : cargando ? (
        <LoadingState label="Cargando el mayor…" />
      ) : !mayor ? (
        <EmptyState icon={Layers} title="No se pudo cargar el mayor" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Cifra etiqueta="Saldo inicial" valor={mayor.periodo.saldoInicial} />
            <Cifra etiqueta="Débitos" valor={mayor.periodo.debe} />
            <Cifra etiqueta="Créditos" valor={mayor.periodo.haber} />
            <Cifra
              etiqueta="Saldo final"
              valor={saldoNatural(mayor.cuenta.tipo, mayor.periodo.saldoFinal)}
              destacado
            />
          </div>

          {!mayor.filas.length ? (
            <EmptyState icon={Layers} title="La cuenta no tuvo movimientos en el período" />
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
              <Table>
                <TableHeader>
                  {/* Las mismas columnas y en el mismo orden que el extracto
                      de una cuenta bancaria —FECHA · CONCEPTO · DÉBITOS ·
                      CRÉDITOS · SALDO · DETALLE—, que es como lo pidieron: «que
                      aparezcan los movimientos relacionados a esa cuenta en el
                      mismo formato que armamos los BANCOS». Leer el mayor de
                      Proveedores y el extracto del Galicia con la misma grilla
                      es lo que permite conciliar uno contra otro sin traducir
                      mentalmente dos vocabularios. */}
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Asiento</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="text-right">Débitos</TableHead>
                    <TableHead className="text-right">Créditos</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mayor.filas.map((f, i) => (
                    <TableRow key={`${f.asientoId}-${i}`}>
                      <TableCell className="num whitespace-nowrap font-mono text-[11.5px] text-ink-muted">
                        {formatearFecha(f.fecha)}
                      </TableCell>
                      <TableCell className="num font-mono text-[11.5px] text-brand-600">
                        {f.numero}
                      </TableCell>
                      <TableCell>
                        <p className="text-[12.5px] text-ink">{f.descripcion}</p>
                        {/* El submayor va acá y no en Detalle: en el mayor de
                            Proveedores, de quién es la deuda es parte de qué
                            operación fue, no una nota al pie. */}
                        {f.auxiliarNombre && (
                          <p className="text-[11px] text-ink-muted">{f.auxiliarNombre}</p>
                        )}
                      </TableCell>
                      <TableCell className="num text-right font-mono text-[12px]">
                        {f.debeArs > 0 ? formatearImporte(f.debeArs, "ARS", { simbolo: false }) : ""}
                      </TableCell>
                      <TableCell className="num text-right font-mono text-[12px]">
                        {f.haberArs > 0
                          ? formatearImporte(f.haberArs, "ARS", { simbolo: false })
                          : ""}
                      </TableCell>
                      <TableCell className="num text-right font-mono text-[12px] font-semibold text-ink">
                        {formatearImporte(saldoNatural(mayor.cuenta.tipo, f.saldoArs), "ARS", {
                          simbolo: false,
                        })}
                      </TableCell>
                      <TableCell className="max-w-[220px] text-[11.5px] text-ink-muted">
                        {f.detalle ? (
                          <span className="line-clamp-2" title={f.detalle}>
                            {f.detalle}
                          </span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── 3 · Sumas y saldos ───────────────────────────────────────────────────── */

function Saldos() {
  const { desde, hasta, setDesde, setHasta, listo, ejercicios } = useRangoDeEjercicio()

  const p = new URLSearchParams()
  if (desde) p.set("desde", desde)
  if (hasta) p.set("hasta", hasta)
  const url = `/api/admin/contabilidad/sumas-y-saldos?${p}`

  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) =>
      pedirJson<Partial<SumasYSaldos> & { truncado?: boolean }>(url, { signal }),
    enabled: listo,
    placeholderData: keepPreviousData,
  })
  const cargando = query.isPending
  const datos = query.data?.filas ? (query.data as SumasYSaldos & { truncado?: boolean }) : null

  // Agrupado por rubro con su subtotal: lo pidió el estudio contable, que lee
  // el reporte en el formato clásico (Activo, Pasivo, PN, Pérdidas, Ganancias).
  const agrupado = datos ? agruparSumasYSaldos(datos.filas) : null

  const exportar = () => {
    if (!agrupado) return
    // Los subtotales van como filas con la cuenta "Total <rubro>" y sin código,
    // así quien filtre la planilla por código los deja afuera sin pensarlo.
    const columnas = (c: ColumnasSumasSaldos) => [c.debe, c.haber, c.saldoDeudor, c.saldoAcreedor]
    descargarCsv(
      "sumas-y-saldos.csv",
      ["Código", "Cuenta", "Rubro", "Debe", "Haber", "Saldo deudor", "Saldo acreedor"],
      [
        ...agrupado.rubros.flatMap((r) => [
          ...r.filas.map((f) => [
            f.codigo,
            f.nombre,
            TIPO_CUENTA_LABEL[f.tipo],
            f.debeArs,
            f.haberArs,
            f.saldoDeudor,
            f.saldoAcreedor,
          ]),
          ["", `Total ${TIPO_CUENTA_LABEL[r.tipo]}`, TIPO_CUENTA_LABEL[r.tipo], ...columnas(r.subtotal)],
        ]),
        ["", "Total general", "", ...columnas(agrupado.total)],
      ]
    )
  }

  const imprimir = () =>
    window.open(`/admin/contabilidad/sumas-y-saldos/imprimir?${p}`, "_blank", "noopener")

  if (cargando) return <LoadingState label="Cargando sumas y saldos…" />
  if (!datos) return <EmptyState icon={Scale} title="No se pudo cargar sumas y saldos" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangoFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} ejercicios={ejercicios} />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={imprimir} disabled={!datos.filas.length}>
            <Printer className="h-3.5 w-3.5" />
            Imprimir / PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportar} disabled={!datos.filas.length}>
            <Download className="h-3.5 w-3.5" />
            Exportar
          </Button>
        </div>
      </div>

      {/* El veredicto arriba de todo. Si la partida doble no cierra, cualquier
          número de esta pantalla es sospechoso y hay que decirlo primero. */}
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-xl border px-4 py-3",
          datos.cuadra
            ? "border-success-line bg-success-soft"
            : "border-danger-line bg-danger-soft"
        )}
      >
        {datos.cuadra ? (
          <Check className="h-4 w-4 shrink-0 text-success-text" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-danger-text" />
        )}
        <div>
          <p
            className={cn(
              "text-[12.5px] font-semibold",
              datos.cuadra ? "text-success-text" : "text-danger-text"
            )}
          >
            {datos.cuadra
              ? "La contabilidad cuadra"
              : `Descuadre de ${formatearImporte(datos.totales.diferencia)}`}
          </p>
          <p className="text-[11.5px] text-ink-muted">
            Débitos {formatearImporte(datos.totales.debe)} · Créditos{" "}
            {formatearImporte(datos.totales.haber)}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {datos.porRubro.map((r) => (
          <Cifra
            key={r.tipo}
            etiqueta={TIPO_CUENTA_LABEL[r.tipo]}
            valor={saldoNatural(r.tipo, r.saldo)}
            nota={`${r.cuentas} cuenta${r.cuentas === 1 ? "" : "s"}`}
          />
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cuenta</TableHead>
              <TableHead>Rubro</TableHead>
              <TableHead className="text-right">Debe</TableHead>
              <TableHead className="text-right">Haber</TableHead>
              <TableHead className="text-right">Saldo deudor</TableHead>
              <TableHead className="text-right">Saldo acreedor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agrupado?.rubros.map((r) => (
              <Fragment key={r.tipo}>
                {r.filas.map((f) => (
                  <TableRow key={f.cuentaId}>
                    <TableCell>
                      <p className="text-[12.5px] text-ink">
                        <span className="font-mono text-[11px] text-ink-faint">{f.codigo}</span>{" "}
                        {f.nombre}
                      </p>
                    </TableCell>
                    <TableCell className="text-[11.5px] text-ink-muted">
                      {TIPO_CUENTA_LABEL[f.tipo]}
                    </TableCell>
                    <CeldaImporte valor={f.debeArs} />
                    <CeldaImporte valor={f.haberArs} />
                    <CeldaImporte valor={f.saldoDeudor} fuerte />
                    <CeldaImporte valor={f.saldoAcreedor} fuerte />
                  </TableRow>
                ))}
                <FilaTotal etiqueta={`Total ${TIPO_CUENTA_LABEL[r.tipo]}`} columnas={r.subtotal} />
              </Fragment>
            ))}
            {agrupado && agrupado.rubros.length > 1 && (
              <FilaTotal etiqueta="Total general" columnas={agrupado.total} general />
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

/** Un importe de sumas y saldos; el cero se deja en blanco para que el saldo
 *  que importa —el deudor o el acreedor, nunca los dos— salte a la vista. */
function CeldaImporte({ valor, fuerte = false }: { valor: number; fuerte?: boolean }) {
  return (
    <TableCell className={cn("num text-right font-mono text-[12px]", fuerte && "font-semibold text-ink")}>
      {valor ? formatearImporte(valor, "ARS", { simbolo: false }) : ""}
    </TableCell>
  )
}

/** El subtotal de un rubro (o el total general): distinto del resto a simple
 *  vista, porque es la línea que el contador busca al recorrer el reporte. */
function FilaTotal({
  etiqueta,
  columnas,
  general = false,
}: {
  etiqueta: string
  columnas: ColumnasSumasSaldos
  general?: boolean
}) {
  const celda = "num text-right font-mono text-[12px] font-semibold text-ink"
  const fmt = (n: number) => formatearImporte(n, "ARS", { simbolo: false })
  return (
    <TableRow
      className={cn(
        "bg-surface-sunken hover:bg-surface-sunken",
        general ? "border-t-2 border-ink/40" : "border-t border-line-strong"
      )}
    >
      <TableCell colSpan={2} className="text-[12.5px] font-semibold text-ink">
        {etiqueta}
      </TableCell>
      <TableCell className={celda}>{fmt(columnas.debe)}</TableCell>
      <TableCell className={celda}>{fmt(columnas.haber)}</TableCell>
      <TableCell className={celda}>{fmt(columnas.saldoDeudor)}</TableCell>
      <TableCell className={celda}>{fmt(columnas.saldoAcreedor)}</TableCell>
    </TableRow>
  )
}

/* ── 4 · Sin asentar ──────────────────────────────────────────────────────── */

function Pendientes() {
  const [corrigiendo, setCorrigiendo] = useState(false)

  // La misma query que el contador de la solapa: al corregir, el diálogo
  // invalida la caché y los dos se actualizan juntos.
  const query = usePendientes()
  const docs = query.data?.documentos ?? []
  const cargando = query.isPending

  if (cargando) return <LoadingState label="Buscando documentos sin asentar…" />

  if (!docs.length) {
    return (
      <EmptyState
        icon={Check}
        title="Todo asentado"
        description="Cada factura, recibo y movimiento tiene su asiento en el libro diario."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-lg border border-warning-line bg-warning-soft px-3 py-2.5 sm:flex-row sm:items-center">
        <p className="flex-1 text-[12px] text-warning-text">
          Estos documentos están en los saldos pero no en el mayor, así que el balance no los
          incluye. Casi siempre alcanza con imputarles la cuenta contable que les falta.
        </p>
        <Button size="sm" onClick={() => setCorrigiendo(true)} className="shrink-0">
          Corregir {docs.length}
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>De quién</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead className="text-right">Importe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((d) => (
              <TableRow key={`${d.origen}-${d.id}`}>
                <TableCell className="num whitespace-nowrap font-mono text-[11.5px] text-ink-muted">
                  {formatearFecha(d.fecha)}
                </TableCell>
                <TableCell className="text-[12.5px] text-ink">{d.referencia}</TableCell>
                <TableCell className="text-[12px] text-ink-secondary">
                  {d.contraparte ?? "—"}
                </TableCell>
                <TableCell className="text-[11.5px] text-ink-muted">{d.motivo}</TableCell>
                <TableCell className="num text-right font-mono text-[12px]">
                  {formatearImporte(d.importeArs)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CorregirImputacionDialog
        abierto={corrigiendo}
        documentos={docs}
        onCerrar={() => setCorrigiendo(false)}
      />
    </div>
  )
}

/* ── Piezas chicas ────────────────────────────────────────────────────────── */

function Cifra({
  etiqueta,
  valor,
  nota,
  destacado,
}: {
  etiqueta: string
  valor: number
  nota?: string
  destacado?: boolean
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-e1">
      <p className="eyebrow">{etiqueta}</p>
      <p
        className={cn(
          "num mt-1 font-mono text-[17px] font-semibold",
          destacado ? "text-brand-600" : "text-ink"
        )}
      >
        {formatearImporte(valor)}
      </p>
      {nota && <p className="mt-0.5 text-[11px] text-ink-muted">{nota}</p>}
    </div>
  )
}

/** `2026-08-13` → `13/8/26`, que es como se lee una fecha en una tabla. */
function formatearFecha(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${Number(d)}/${Number(m)}/${a.slice(2)}`
}
