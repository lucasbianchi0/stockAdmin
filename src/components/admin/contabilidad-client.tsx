"use client"

import { Fragment, useEffect, useState } from "react"
import Link from "next/link"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { AlertTriangle, BookOpen, Check, ChevronDown, ChevronRight, Download, Layers, Loader2, Printer, Scale, Search } from "lucide-react"
import { toast } from "sonner"

import { SelectorCuenta } from "@/components/admin/selector-cuenta"
import { CorregirImputacionDialog } from "@/components/admin/corregir-imputacion-dialog"
import { Preguntar } from "@/components/chatbot/preguntar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Menu, MenuItem, MenuRotulo } from "@/components/ui/menu"
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
import {
  ORIGEN_ASIENTO_LABEL,
  agruparSumasYSaldos,
  esDeudora,
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
import { renglon, resumen } from "@/lib/chatbot/pantalla"
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

/** Una lista vacía fija: un `[]` nuevo en cada render reiniciaría la página. */
const SIN_FILAS: never[] = []

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
  // Para el cartel alcanza con la cantidad: `?solo=cantidad` cuenta en la base
  // en vez de traer y detallar cada documento en todas las vistas.
  const pendientes =
    useQuery({
      queryKey: claves.url(`${URL_PENDIENTES}?solo=cantidad`),
      queryFn: ({ signal }) =>
        pedirJson<{ cantidad?: number }>(`${URL_PENDIENTES}?solo=cantidad`, { signal }),
    }).data?.cantidad ?? 0

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
  const paginado = usePaginado(asientos, 25, url)

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
          <BotonPdfDiario desde={desde} hasta={hasta} origen={origen} disabled={!asientos.length} />
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
        <div ref={paginado.ancla} className="scroll-mt-28 space-y-3">
          {paginado.visibles.map((a) => (
            <AsientoCard key={a.id} asiento={a} />
          ))}
          {paginado.hayMasDeUna && (
            <Paginacion
              className="rounded-xl border border-line"
              pagina={paginado.pagina}
              totalPaginas={paginado.totalPaginas}
              total={paginado.total}
              porPagina={paginado.porPagina}
              onIr={paginado.irA}
            />
          )}
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

/**
 * El PDF del libro diario. Por defecto sale con el formato del estudio, el que
 * va a los libros rubricados (un renglón por imputación, facturas resumidas
 * por mes, hojas numeradas). Las otras dos hojas siguen a mano en el menú.
 */
function BotonPdfDiario({
  desde,
  hasta,
  origen = "",
  disabled,
}: {
  desde: string
  hasta: string
  origen?: string
  disabled: boolean
}) {
  const abrir = (modo: "libro" | "asientos" | "mes") => {
    const p = new URLSearchParams()
    if (desde) p.set("desde", desde)
    if (hasta) p.set("hasta", hasta)
    // El libro es siempre el período entero; el filtro por origen sólo vale
    // para la hoja detallada, que ya avisa que no es el libro completo.
    if (modo === "asientos" && origen) p.set("origen", origen)
    if (modo !== "asientos") p.set("modo", modo)
    window.open(`/admin/contabilidad/imprimir?${p}`, "_blank", "noopener")
  }

  return (
    <div className="flex items-center">
      <Button
        variant="outline"
        size="sm"
        className="rounded-r-none"
        disabled={disabled}
        onClick={() => abrir("libro")}
        title="Formato del libro rubricado"
      >
        <Printer className="h-3.5 w-3.5" />
        PDF
      </Button>
      <Menu
        disparador={(abrirMenu) => (
          <Button
            variant="outline"
            size="sm"
            className="-ml-px rounded-l-none px-2"
            disabled={disabled}
            onClick={abrirMenu}
            aria-label="Otros formatos del PDF"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        )}
      >
        {(cerrar) => (
          <>
            <MenuRotulo>Imprimir el libro diario</MenuRotulo>
            {(
              [
                ["libro", "Formato del libro rubricado"],
                ["asientos", "Detallado por asiento"],
                ["mes", "Resumen mensual por cuenta"],
              ] as const
            ).map(([modo, rotulo]) => (
              <MenuItem
                key={modo}
                onClick={() => {
                  cerrar()
                  abrir(modo)
                }}
              >
                {rotulo}
              </MenuItem>
            ))}
          </>
        )}
      </Menu>
    </div>
  )
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
          <BotonPdfDiario desde={desde} hasta={hasta} disabled={!meses.length} />
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
  // `?cuenta=<id>` abre esa cuenta: es el enlace desde sumas y saldos.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("cuenta")
    if (id) setCuenta(id)
  }, [])
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
  // El saldo corrido viene calculado fila por fila desde el servidor: paginar
  // en pantalla no lo altera, y el Excel sigue saliendo entero.
  const paginado = usePaginado(mayor?.filas ?? SIN_FILAS, 100, url)

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
            <div ref={paginado.ancla} className="scroll-mt-28 overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
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
                  {paginado.visibles.map((f, i) => (
                    <TableRow key={`${f.asientoId}-${paginado.offset + i}`}>
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

  // En pantalla, cada rubro se pliega y se puede buscar una cuenta. Los totales
  // de rubro son siempre los del rubro entero: la búsqueda solo ayuda a
  // encontrar, no cambia los números. El PDF y el Excel van completos.
  const [buscar, setBuscar] = useState("")
  const [plegados, setPlegados] = useState<Set<string>>(new Set())
  const plegar = (tipo: string) =>
    setPlegados((prev) => {
      const s = new Set(prev)
      if (s.has(tipo)) s.delete(tipo)
      else s.add(tipo)
      return s
    })
  const termino = buscar.trim().toLowerCase()
  const coincide = (f: { codigo: string; nombre: string }) =>
    !termino || f.codigo.startsWith(termino) || f.nombre.toLowerCase().includes(termino)
  const irAlRubro = (tipo: string) => {
    setPlegados((prev) => {
      const s = new Set(prev)
      s.delete(tipo)
      return s
    })
    document.getElementById(`rubro-${tipo}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const enlaceMayor = (cuentaId: string) => {
    const q = new URLSearchParams({ cuenta: cuentaId })
    if (desde) q.set("desde", desde)
    if (hasta) q.set("hasta", hasta)
    return `/admin/contabilidad/mayor?${q}`
  }

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

  // La misma consulta que el cartel de arriba: comparten caché, no pide nada nuevo.
  const sinAsentar =
    useQuery({
      queryKey: claves.url(`${URL_PENDIENTES}?solo=cantidad`),
      queryFn: ({ signal }) =>
        pedirJson<{ cantidad?: number }>(`${URL_PENDIENTES}?solo=cantidad`, { signal }),
    }).data?.cantidad ?? 0

  if (cargando) return <LoadingState label="Cargando sumas y saldos…" />
  if (!datos) return <EmptyState icon={Scale} title="No se pudo cargar sumas y saldos" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangoFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} ejercicios={ejercicios} />
        <div className="flex items-center gap-2">
          <Preguntar
            agente="finanzas"
            pantalla={() => ({
              titulo: "Administración · Sumas y saldos",
              texto: textoSaldos(datos, desde, hasta, sinAsentar),
            })}
            pregunta="Mirá estas sumas y saldos: ¿hay algo raro? Cuentas con saldo al revés, descuadres, rubros que no cierran con lo que esperarías."
            ayuda="Le pasa el veredicto, los rubros, el resultado y las cuentas con saldo contrario a su naturaleza."
            seguimientos={SEGUIMIENTOS_SALDOS}
          />
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

      <div className="grid gap-3 sm:grid-cols-3 2xl:grid-cols-6">
        {datos.porRubro.map((r) => (
          <button key={r.tipo} onClick={() => irAlRubro(r.tipo)} className="text-left" title="Ir al rubro">
            <Cifra
              etiqueta={TIPO_CUENTA_LABEL[r.tipo]}
              valor={saldoNatural(r.tipo, r.saldo)}
              nota={`${r.cuentas} cuenta${r.cuentas === 1 ? "" : "s"}`}
            />
          </button>
        ))}
        {(() => {
          // Ganancias menos pérdidas: la primera pregunta de cualquiera que mira
          // un balance, y la cuenta que nadie quiere hacer a mano.
          const de = (tipo: string) => datos.porRubro.find((r) => r.tipo === tipo)
          const g = de("ingreso")
          const pe = de("egreso")
          if (!g && !pe) return null
          const resultado =
            (g ? saldoNatural(g.tipo, g.saldo) : 0) - (pe ? saldoNatural(pe.tipo, pe.saldo) : 0)
          return (
            <Cifra
              etiqueta={resultado >= 0 ? "Resultado · ganancia" : "Resultado · pérdida"}
              valor={Math.abs(resultado)}
              nota="Ganancias − pérdidas"
              destacado
            />
          )
        })()}
      </div>

      <div className="relative max-w-[320px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
        <Input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar cuenta por nombre o código"
          className="pl-8"
        />
      </div>

      <div className="overflow-clip rounded-xl border border-line bg-surface shadow-e1">
        <Table contenedorClassName="max-h-[calc(100dvh-12rem)] min-h-[320px]">
          <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-[2]">
            <TableRow>
              <TableHead>Cuenta</TableHead>
              <TableHead className="text-right">Debe</TableHead>
              <TableHead className="text-right">Haber</TableHead>
              <TableHead className="text-right">Saldo deudor</TableHead>
              <TableHead className="text-right">Saldo acreedor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agrupado?.rubros.map((r) => {
              const visibles = r.filas.filter(coincide)
              if (termino && !visibles.length) return null
              const plegado = plegados.has(r.tipo) && !termino
              return (
              <Fragment key={r.tipo}>
                <TableRow id={`rubro-${r.tipo}`} className="scroll-mt-10 hover:bg-transparent">
                  <TableCell colSpan={5} className="border-b border-line bg-surface py-2">
                    <button
                      onClick={() => plegar(r.tipo)}
                      aria-expanded={!plegado}
                      className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700 hover:text-brand-600"
                    >
                      {plegado ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {TIPO_CUENTA_LABEL[r.tipo]}
                      <span className="font-normal normal-case tracking-normal text-ink-faint">
                        · {termino ? `${visibles.length} de ${r.filas.length}` : r.filas.length} cuenta
                        {r.filas.length === 1 ? "" : "s"}
                      </span>
                    </button>
                  </TableCell>
                </TableRow>
                {!plegado && visibles.map((f) => (
                  <TableRow key={f.cuentaId} className="group">
                    <TableCell className="pl-8">
                      <Link
                        href={enlaceMayor(f.cuentaId)}
                        className="text-[12.5px] text-ink group-hover:text-brand-700"
                        title="Ver el mayor de la cuenta"
                      >
                        <span className="font-mono text-[11px] text-ink-faint">{f.codigo}</span>{" "}
                        {f.nombre}
                        <span className="ml-1.5 text-[11px] text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
                          Ver mayor →
                        </span>
                      </Link>
                    </TableCell>
                    <CeldaImporte valor={f.debeArs} />
                    <CeldaImporte valor={f.haberArs} />
                    <CeldaImporte valor={f.saldoDeudor} fuerte />
                    <CeldaImporte valor={f.saldoAcreedor} fuerte />
                  </TableRow>
                ))}
                <FilaTotal etiqueta={`Total ${TIPO_CUENTA_LABEL[r.tipo]}`} columnas={r.subtotal} />
              </Fragment>
              )
            })}
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
        general
          ? "border-t-2 border-ink/40 [&_td]:sticky [&_td]:bottom-0 [&_td]:z-[2] [&_td]:border-t [&_td]:border-line-strong [&_td]:bg-surface-sunken"
          : "border-t border-line-strong"
      )}
    >
      <TableCell className="text-[12.5px] font-semibold text-ink">
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
          "num mt-1 whitespace-nowrap font-mono text-[17px] font-semibold",
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

/* ── Para el chat ─────────────────────────────────────────────────────────── */

const SEGUIMIENTOS_SALDOS = [
  { emoji: "🧾", corto: "¿Qué asiento falta?", texto: "Para cada cosa rara que encontraste, ¿qué asiento o qué carga probablemente falta o está mal?" },
  { emoji: "📊", corto: "Leeme el resultado", texto: "Explicame el resultado del período en criollo: de dónde sale la ganancia o la pérdida y qué pesa más." },
  { emoji: "✅", corto: "Antes de cerrar", texto: "¿Qué revisarías antes de mandarle este balance al contador o de cerrar el período?" },
]

/**
 * Sumas y saldos en texto, para el chat: el veredicto de la partida doble, los
 * rubros, el resultado y lo que suele delatar un error de carga —una cuenta
 * con el saldo del lado que no le corresponde—. Son cuentas del plan, no
 * fichas: no hay datos de clientes ni proveedores.
 */
function textoSaldos(
  datos: SumasYSaldos & { truncado?: boolean },
  desde: string | null | undefined,
  hasta: string | null | undefined,
  sinAsentar: number
): string {
  const $ = (n: number) => formatearImporte(n)
  const de = (tipo: string) => datos.porRubro.find((r) => r.tipo === tipo)
  const g = de("ingreso")
  const pe = de("egreso")
  const resultado = (g ? saldoNatural(g.tipo, g.saldo) : 0) - (pe ? saldoNatural(pe.tipo, pe.saldo) : 0)

  // Saldo al revés: un activo acreedor o un pasivo deudor. A veces es legítimo
  // (un banco en descubierto), pero casi siempre es una carga mal imputada.
  const alReves = datos.filas
    .filter((f) => Math.abs(f.saldoArs) >= 1 && saldoNatural(f.tipo, f.saldoArs) < 0)
    .sort((a, b) => Math.abs(b.saldoArs) - Math.abs(a.saldoArs))

  const mayores = (tipo: string) =>
    datos.filas
      .filter((f) => f.tipo === tipo && Math.abs(f.saldoArs) >= 1)
      .sort((a, b) => Math.abs(b.saldoArs) - Math.abs(a.saldoArs))
      .slice(0, 4)
      .map((f) => `  ${f.codigo} ${f.nombre}: ${$(saldoNatural(f.tipo, f.saldoArs))}`)

  return resumen(
    renglon("Período", desde || hasta ? `${desde || "inicio"} → ${hasta || "hoy"}` : "todo"),
    datos.cuadra ? "La partida doble cuadra." : `DESCUADRE de ${$(datos.totales.diferencia)}.`,
    renglon("Débitos", $(datos.totales.debe)),
    renglon("Créditos", $(datos.totales.haber)),
    renglon("Cuentas con movimiento", datos.filas.length),
    sinAsentar > 0 && `${sinAsentar} documentos sin asentar: están en los saldos de las fichas pero no en el mayor.`,
    datos.truncado && "Ojo: la consulta se cortó, puede faltar algo.",
    "",
    "## Por rubro (saldo con su signo natural)",
    datos.porRubro.map(
      (r) => `${TIPO_CUENTA_LABEL[r.tipo]}: ${$(saldoNatural(r.tipo, r.saldo))} (${r.cuentas} cuentas)`
    ),
    (g || pe) && `Resultado: ${resultado >= 0 ? "ganancia" : "pérdida"} de ${$(Math.abs(resultado))}`,
    "",
    `## Cuentas con saldo contrario a su naturaleza (${alReves.length})`,
    alReves.length === 0 && "Ninguna.",
    alReves
      .slice(0, 15)
      .map(
        (f) =>
          `${f.codigo} ${f.nombre} (${TIPO_CUENTA_LABEL[f.tipo]}): saldo ${esDeudora(f.tipo) ? "acreedor" : "deudor"} de ${$(
            Math.abs(f.saldoArs)
          )}`
      ),
    "",
    "## Los saldos más grandes de cada rubro",
    datos.porRubro.flatMap((r) => [`${TIPO_CUENTA_LABEL[r.tipo]}:`, ...mayores(r.tipo)])
  )
}
