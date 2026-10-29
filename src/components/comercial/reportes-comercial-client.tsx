"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Download, FileQuestion, FileText, FileWarning, PieChart, Users } from "lucide-react"

import { Preguntar } from "@/components/chatbot/preguntar"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FiltroFecha } from "@/components/ui/filtro-fecha"
import { FiltroPill } from "@/components/ui/filtro-pill"
import { Menu, MenuItem } from "@/components/ui/menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { FranjaFija } from "@/components/ui/franja-fija"
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
import type { FacturaDeReporte, FacturaFaltante } from "@/lib/comercial/presupuesto-facturas-server"
import { renglon, resumen } from "@/lib/chatbot/pantalla"
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
 * tener a la vista mientras se la recorre son los totales y los títulos de las
 * columnas.
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
  const consultaFacturas = useQuery({
    queryKey: claves.url(urlFacturas),
    queryFn: ({ signal }) =>
      pedirJson<{ facturas: Record<string, FacturaDeReporte[]>; faltan?: Record<string, FacturaFaltante[]> }>(
        urlFacturas,
        { signal }
      ),
  })
  const datosFacturas = consultaFacturas.data
  const facturas = datosFacturas?.facturas ?? {}
  const faltan = datosFacturas?.faltan ?? {}
  const filas = useMemo(
    () =>
      todos.filter((p) => {
        const f = p.fecha.slice(0, 10)
        return (
          (!estado || p.estado === estado) &&
          (!vendedor || p.vendedorId === vendedor) &&
          (!desde || f >= desde) &&
          (!hasta || f <= hasta)
        )
      }),
    [todos, estado, vendedor, desde, hasta]
  )
  const hayFiltro = Boolean(estado || vendedor || desde || hasta)

  // Los vendedores que tienen presupuestos, en burbujas como el equipo del CRM.
  const vendedores = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of todos) if (p.vendedorId) m.set(p.vendedorId, p.vendedorNombre ?? "Sin nombre")
    return [...m].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
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

  const fijo = useEncabezadoFijo(filas.length > 0)

  if (consulta.isPending) return <LoadingState label="Armando el reporte…" />
  if (consulta.isError) {
    return (
      <ErrorState
        message={mensajeError(consulta.error, "No se pudo armar el reporte")}
        onRetry={() => consulta.refetch()}
      />
    )
  }

  const encabezados = (
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
      <TableHead className="text-right" title="Renta sobre venta">% renta</TableHead>
      <TableHead
        className="text-right"
        title={`${PUNTOS_SOBRE_RENTA * 100}% de la renta, sólo en lo facturado`}
      >
        Puntos
      </TableHead>
    </TableRow>
  )

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

          <Preguntar
            className="ml-auto"
            pantalla={() => ({
              titulo: "Comercial · Reportes",
              texto: textoReporte(filas, todos.length, {
                estado,
                vendedor: vendedores.find((v) => v.id === vendedor)?.nombre ?? "",
                desde,
                hasta,
                facturas,
                faltan,
              }),
            })}
            pregunta="Mirá el reporte de presupuestos: ¿cómo viene la renta, qué presupuestos me preocupan y qué haría para cerrar más de lo que está enviado o aceptado?"
            ayuda="Le pasa los totales por moneda y estado, la renta por vendedor y los presupuestos flojos, con los filtros puestos."
            seguimientos={SEGUIMIENTOS_REPORTE}
          />
          <Button
            variant="outline"
            size="sm"
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
          <Vendedores vendedores={vendedores} elegido={vendedor} onElegir={setVendedor} />
          <FiltroFecha
            desde={desde}
            hasta={hasta}
            onCambio={(d, h) => {
              setDesde(d)
              setHasta(h)
            }}
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

        {filas.length > 0 && fijo.anchos.length > 0 && (
          <div ref={fijo.franja} aria-hidden className="overflow-hidden border-t border-line">
            <table
              className="border-separate border-spacing-0 text-[13px]"
              style={{ tableLayout: "fixed", width: fijo.anchos.reduce((a, b) => a + b, 0) }}
            >
              <colgroup>
                {fijo.anchos.map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <TableHeader className="[&_th]:border-b-0">{encabezados}</TableHeader>
            </table>
          </div>
        )}
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
        <TooltipProvider delayDuration={150}>
          <Table ref={fijo.tabla}>
            <TableHeader className={OCULTO}>
              {encabezados}
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
                      faltan={faltan[p.id] ?? []}
                      facturado={puntosDe(p) !== null}
                      cargando={consultaFacturas.isPending}
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
        </TooltipProvider>
      )}
    </div>
  )
}

/**
 * Las facturas de un presupuesto como un archivo: el ícono y cuántas son.
 * Al pasar por arriba, el tooltip dice cuáles (número, fecha, total); al
 * tocarlo, con una sola abre esa factura y con varias deja elegir cuál.
 *
 * Sin permiso para ver Administración se ve igual, sin abrir nada: un enlace
 * ahí mandaría a una pantalla sin acceso.
 */
function FacturasVinculadas({
  facturas,
  faltan,
  facturado,
  enlazar,
  cargando,
}: {
  facturas: FacturaDeReporte[]
  /** PDF en el legajo que no se pudo vincular: sin cargar o de otro cliente. */
  faltan: FacturaFaltante[]
  facturado: boolean
  enlazar: boolean
  /** Mientras llegan, un lugar gris: no un «sin factura» que todavía no se sabe. */
  cargando: boolean
}) {
  const router = useRouter()
  if (cargando) return facturado ? <span className="block h-7 w-9 animate-pulse rounded-md bg-surface-muted" /> : <span className="text-ink-faint">—</span>
  const abrir = (id: string) => router.push(`/admin/ventas/listado?ver=${id}`)

  if (facturas.length === 0 && faltan.length === 0) {
    if (!facturado) return <span className="text-ink-faint">—</span>
    return (
      <ConTooltip texto="Facturado, pero sin factura vinculada. Subí el PDF de la factura al legajo del presupuesto.">
        <span className="inline-flex h-7 items-center gap-1 rounded-md border border-warning-line bg-warning-soft px-1.5 text-warning-text">
          <FileQuestion className="h-3.5 w-3.5" />
        </span>
      </ConTooltip>
    )
  }

  const detalle = (
    <div className="space-y-1">
      {facturas.map((f) => (
        <p key={f.id} className="flex items-baseline gap-3">
          <span className="font-mono font-semibold text-white">{f.etiqueta}</span>
          <span className="num text-n-300">{formatearFecha(f.fecha)}</span>
          <span className="num ml-auto pl-2 text-white">{formatearImporte(f.total, f.moneda)}</span>
        </p>
      ))}
      {faltan.map((f) => (
        <p key={f.etiqueta} className="text-[#f5d27a]">
          <span className="font-mono">{f.etiqueta}</span>
          {f.motivo === "sin_cargar"
            ? ": está el PDF en el legajo, falta cargarla en Administración"
            : ": está el PDF en el legajo, pero la factura está cargada a otro cliente"}
        </p>
      ))}
    </div>
  )

  const icono = (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md border px-1.5 text-[11.5px] font-semibold transition-colors",
        faltan.length > 0
          ? "border-warning-line bg-warning-soft text-warning-text"
          : "border-brand-200 bg-brand-50 text-brand-700",
        enlazar && facturas.length > 0 && "hover:border-brand-300 hover:bg-brand-100"
      )}
    >
      {faltan.length > 0 ? <FileWarning className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
      <span className="num">{facturas.length}</span>
    </span>
  )

  if (!enlazar || facturas.length === 0) return <ConTooltip texto={detalle}>{icono}</ConTooltip>

  if (facturas.length === 1) {
    return (
      <ConTooltip texto={detalle}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            abrir(facturas[0].id)
          }}
          aria-label={`Abrir ${facturas[0].etiqueta}`}
        >
          {icono}
        </button>
      </ConTooltip>
    )
  }

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Menu
        alinear="inicio"
        disparador={(abrirMenu) => (
          <ConTooltip texto={detalle}>
            <button type="button" onClick={abrirMenu} aria-label={`${facturas.length} facturas`}>
              {icono}
            </button>
          </ConTooltip>
        )}
      >
        {(cerrar) =>
          facturas.map((f) => (
            <MenuItem
              key={f.id}
              onClick={() => {
                cerrar()
                abrir(f.id)
              }}
            >
              <FileText />
              <span className="font-mono text-[12px] font-semibold">{f.etiqueta}</span>
              <span className="num ml-auto pl-3 text-[12px] text-ink-muted">{formatearImporte(f.total, f.moneda)}</span>
            </MenuItem>
          ))
        }
      </Menu>
    </span>
  )
}

function ConTooltip({ texto, children }: { texto: React.ReactNode; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm">
        {texto}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Los vendedores como en el CRM: «Todos» y una burbuja por persona. Tocar la
 * elegida otra vez vuelve a todos.
 */
function Vendedores({
  vendedores,
  elegido,
  onElegir,
}: {
  vendedores: { id: string; nombre: string }[]
  elegido: string
  onElegir: (id: string) => void
}) {
  if (vendedores.length === 0) return null
  return (
    <div className="mr-1 flex items-center gap-1 rounded-full border border-line bg-surface p-1">
      <button
        type="button"
        onClick={() => onElegir("")}
        aria-pressed={!elegido}
        title="Todos los vendedores"
        className={cn(
          "flex h-6 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium transition-[box-shadow,background-color] duration-150",
          !elegido ? "bg-ink text-n-25" : "text-ink-muted hover:bg-surface-muted hover:text-ink"
        )}
      >
        <Users className="h-3 w-3" />
        Todos
      </button>
      {vendedores.map((v) => {
        const on = v.id === elegido
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onElegir(on ? "" : v.id)}
            aria-pressed={on}
            title={v.nombre}
            className={cn(
              "relative rounded-full transition-[box-shadow,opacity] duration-150",
              on ? "ring-2 ring-ink ring-offset-1 ring-offset-surface" : "hover:ring-1 hover:ring-line-strong"
            )}
          >
            <Avatar id={v.id} nombre={v.nombre} size="sm" />
          </button>
        )
      })}
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

/**
 * Los títulos de las columnas, fijos junto con los totales.
 *
 * Un `<thead>` sticky no sirve acá: la tabla va dentro de una caja con scroll
 * horizontal (en pantallas angostas no entra), y esa caja pasa a ser el
 * contenedor del sticky, así que el encabezado nunca se pega al bajar la página.
 *
 * Entonces la fila de títulos se dibuja otra vez adentro de la `FranjaFija`,
 * con el ancho de cada columna copiado de la tabla real y el scroll horizontal
 * sincronizado. El `<thead>` de la tabla sigue estando —es el que decide los
 * anchos y el que leen los lectores de pantalla— pero sin alto y sin texto
 * visible (`OCULTO`): la copia es la que se ve.
 */
function useEncabezadoFijo(hayTabla: boolean) {
  const tabla = useRef<HTMLTableElement>(null)
  const franja = useRef<HTMLDivElement>(null)
  const [anchos, setAnchos] = useState<number[]>([])

  useEffect(() => {
    const t = tabla.current
    const caja = t?.parentElement
    if (!t || !caja) return
    const medir = () => {
      const nuevos = Array.from(t.querySelectorAll("thead th"), (th) => th.getBoundingClientRect().width)
      setAnchos((viejos) => (viejos.length === nuevos.length && viejos.every((w, i) => w === nuevos[i]) ? viejos : nuevos))
    }
    const seguir = () => {
      if (franja.current) franja.current.scrollLeft = caja.scrollLeft
    }
    medir()
    const observador = new ResizeObserver(() => {
      medir()
      seguir()
    })
    observador.observe(t)
    caja.addEventListener("scroll", seguir, { passive: true })
    return () => {
      observador.disconnect()
      caja.removeEventListener("scroll", seguir)
    }
  }, [hayTabla])

  // Recién montada, la copia arranca en 0: si la tabla ya estaba corrida, se alinea.
  useEffect(() => {
    const caja = tabla.current?.parentElement
    if (franja.current && caja) franja.current.scrollLeft = caja.scrollLeft
  }, [anchos])

  return { tabla, franja, anchos }
}

/** El `<thead>` real: ocupa su lugar en el cálculo de anchos pero no se ve. */
const OCULTO = "[&_th]:h-0 [&_th]:border-b-0 [&_th]:leading-[0] [&_th]:text-transparent [&_th]:select-none"

/* ── Para el chat ─────────────────────────────────────────────────────────── */

/** Las repreguntas que quedan a mano después de preguntar desde el reporte. */
const SEGUIMIENTOS_REPORTE = [
  { emoji: "📉", corto: "¿Por qué baja la renta?", texto: "¿Qué explica la renta más baja en algunos presupuestos? ¿Es el costo, el margen o el break?" },
  { emoji: "🤝", corto: "Qué cierro primero", texto: "De lo enviado y aceptado, ¿qué conviene empujar primero para que se facture este mes?" },
  { emoji: "🧾", corto: "Facturas sin vincular", texto: "¿Qué hago con los presupuestos facturados que no tienen la factura vinculada?" },
  { emoji: "🎫", corto: "Anotalo como ticket", texto: "Anotá como ticket la acción principal que propusiste, con el detalle para que la pueda hacer otra persona." },
]

/**
 * El reporte en texto, para el chat: totales por moneda, cómo se reparten por
 * estado y por vendedor, y los presupuestos que piden mirarse. Sin nombres de
 * clientes: el número del presupuesto alcanza para ubicarlo.
 */
function textoReporte(
  filas: PresupuestoFila[],
  total: number,
  f: {
    estado: EstadoPresupuesto | ""
    vendedor: string
    desde: string
    hasta: string
    facturas: Record<string, FacturaDeReporte[]>
    faltan: Record<string, FacturaFaltante[]>
  }
): string {
  const pct = (renta: number, venta: number) => (venta === 0 ? "—" : `${Math.round((renta / venta) * 100)}%`)
  const monedas = (["ARS", "USD"] as const).filter((m) => filas.some((p) => p.moneda === m))

  const porMoneda = monedas.map((m) => {
    const de = filas.filter((p) => p.moneda === m)
    const venta = de.reduce((a, p) => a + p.totales.venta, 0)
    const costo = de.reduce((a, p) => a + p.totales.costo, 0)
    const renta = de.reduce((a, p) => a + p.totales.rentabilidad, 0)
    const puntos = de.reduce((a, p) => a + (puntosDe(p) ?? 0), 0)
    return [
      `### En ${m === "ARS" ? "pesos" : "dólares"} (${de.length})`,
      `Vendido ${formatearImporte(venta, m)} · costo ${formatearImporte(costo, m)} · renta ${formatearImporte(renta, m)} (${pct(renta, venta)})`,
      renglon("Puntos (8% de la renta facturada)", puntos ? formatearImporte(puntos, m) : null),
      ESTADOS.map((e) => {
        const est = de.filter((p) => p.estado === e)
        if (!est.length) return null
        const v = est.reduce((a, p) => a + p.totales.venta, 0)
        const r = est.reduce((a, p) => a + p.totales.rentabilidad, 0)
        return `${ESTADO_LABEL[e]}: ${est.length} · ${formatearImporte(v, m)} · renta ${pct(r, v)}`
      }),
    ]
  })

  // Por vendedor: cuántos tiene, cuántos facturó y con qué renta.
  const vendedores = new Map<string, PresupuestoFila[]>()
  for (const p of filas) {
    const n = p.vendedorNombre ?? "Sin vendedor"
    vendedores.set(n, [...(vendedores.get(n) ?? []), p])
  }
  const porVendedor = [...vendedores].map(([nombre, ps]) => {
    const fact = ps.filter((p) => p.estado === "facturado").length
    const montos = monedas
      .map((m) => {
        const de = ps.filter((p) => p.moneda === m)
        if (!de.length) return null
        const v = de.reduce((a, p) => a + p.totales.venta, 0)
        const r = de.reduce((a, p) => a + p.totales.rentabilidad, 0)
        return `${formatearImporte(v, m)} (renta ${pct(r, v)})`
      })
      .filter(Boolean)
      .join(" + ")
    return `${nombre}: ${ps.length} presupuestos, ${fact} facturados · ${montos}`
  })

  const negativos = filas.filter((p) => p.totales.rentabilidad < 0)
  const flojos = filas.filter((p) => p.totales.venta > 0 && p.totales.rentabilidad >= 0 && p.totales.rentaPct < 0.1)
  const sinFactura = filas.filter((p) => p.estado === "facturado" && !(f.facturas[p.id]?.length))
  const conFaltantes = filas.filter((p) => f.faltan[p.id]?.length)
  const lista = (ps: PresupuestoFila[]) =>
    ps
      .slice(0, 12)
      .map((p) => `N.º ${p.numero} (${ESTADO_LABEL[p.estado]}, ${formatearImporte(p.totales.venta, p.moneda)}, renta ${pct(p.totales.rentabilidad, p.totales.venta)})`)
      .join("; ") + (ps.length > 12 ? ` y ${ps.length - 12} más` : "")

  return resumen(
    `Presupuestos en pantalla: ${filas.length} de ${total}`,
    renglon("Estado", f.estado ? ESTADO_LABEL[f.estado] : null),
    renglon("Vendedor", f.vendedor || null),
    renglon("Desde", f.desde || null),
    renglon("Hasta", f.hasta || null),
    "Los montos van por moneda: pesos y dólares no se suman.",
    "",
    "## Totales",
    porMoneda.flat(2),
    "",
    "## Por vendedor",
    porVendedor,
    "",
    "## Para mirar",
    negativos.length ? `Con renta negativa: ${lista(negativos)}` : "Ninguno con renta negativa.",
    flojos.length > 0 && `Con renta menor al 10%: ${lista(flojos)}`,
    sinFactura.length > 0 && `Facturados sin factura vinculada: ${sinFactura.length} (${sinFactura.map((p) => `N.º ${p.numero}`).join(", ")})`,
    conFaltantes.length > 0 && `Con un PDF de factura en el legajo que no se pudo vincular: ${conFaltantes.length}`
  )
}
