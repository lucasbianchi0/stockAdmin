"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { AlertTriangle, BookMarked, ChevronLeft, ChevronRight, Download, Eye, EyeOff, Printer } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { TipoComprobante } from "@/lib/admin/comprobantes"
import { descargarCsv } from "@/lib/admin/csv"
import { FORMA_JURIDICA_LABEL } from "@/lib/admin/entidades"
import { formatearImporte } from "@/lib/admin/moneda"
import { claves, mensajeError, pedirJson } from "@/lib/admin/query"
import {
  ALICUOTAS_SUBDIARIO,
  ALICUOTA_SUBDIARIO_LABEL,
  RUTA_SUBDIARIO,
  columnasVisibles,
  importeLibro,
  ivaTotal,
  mesActual,
  moverMes,
  netoTotal,
  rangoDelMes,
  soloComprobantes,
  soloRetenciones,
  totalizar,
  type FilaSubdiario,
  type Subdiario,
} from "@/lib/admin/subdiarios"
import { cn } from "@/lib/utils"

/**
 * Subdiario IVA Ventas / IVA Compras.
 *
 * Arriba el período —un mes, que es como se usa, o un rango libre— y los dos
 * filtros que pidió el contador: proveedor o cliente, y tipo de comprobante. Los
 * totales son siempre los de lo que se ve.
 *
 * La tabla lleva las columnas del libro del estudio (Libro IVA Compras / Ventas)
 * y, en ventas, las retenciones sufridas en los cobros como renglones
 * informativos que no suman al total.
 *
 * Abajo de la tabla, los totales por alícuota y el asiento resumen del período,
 * que es la lectura agrupada de los asientos de esos comprobantes: los asientos
 * de cada factura siguen siendo los registrados.
 */

type Periodo = { modo: "mes"; mes: string } | { modo: "rango"; desde: string; hasta: string }

const importe = (v: number) => (v === 0 ? "" : formatearImporte(v, "ARS", { simbolo: false }))

export function SubdiarioClient({ tipo }: { tipo: TipoComprobante }) {
  const esVenta = tipo === "venta"
  const [periodo, setPeriodo] = useState<Periodo>({ modo: "mes", mes: mesActual() })
  // `?desde=…&hasta=…` (o `?mes=2026-09`) abre en ese período: es el enlace
  // desde la ficha de un ejercicio.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const mes = p.get("mes")
    const d = p.get("desde")
    const h = p.get("hasta")
    if (mes && /^\d{4}-\d{2}$/.test(mes)) setPeriodo({ modo: "mes", mes })
    else if (d && h) setPeriodo({ modo: "rango", desde: d, hasta: h })
  }, [])
  const [entidad, setEntidad] = useState("")
  const [clase, setClase] = useState("")
  // En pantalla, las columnas del libro sin ningún importe en el período se
  // esconden: con todas, la tabla no entra y hay que correrla de costado. La
  // hoja impresa y el Excel las llevan siempre, como el libro.
  const [verVacias, setVerVacias] = useState(false)
  const [verRetenciones, setVerRetenciones] = useState(true)

  const { desde, hasta } =
    periodo.modo === "mes" ? rangoDelMes(periodo.mes) : { desde: periodo.desde, hasta: periodo.hasta }
  const listo = Boolean(desde && hasta && desde <= hasta)

  const url = `/api/admin/contabilidad/subdiarios?${new URLSearchParams({ tipo, desde, hasta })}`
  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<Subdiario>(url, { signal }),
    enabled: listo,
    placeholderData: keepPreviousData,
  })
  const datos = query.data

  const entidades = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of datos?.filas ?? []) if (f.entidadId) m.set(f.entidadId, f.razonSocial)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [datos])
  const clases = useMemo(
    () => [...new Set((datos?.filas ?? []).map((f) => f.clase))].sort(),
    [datos]
  )

  const filas = useMemo(
    () =>
      (datos?.filas ?? []).filter(
        (f) => (!entidad || f.entidadId === entidad) && (!clase || f.clase === clase)
      ),
    [datos, entidad, clase]
  )
  const filasEnPantalla = useMemo(
    () => (verRetenciones ? filas : soloComprobantes(filas)),
    [filas, verRetenciones]
  )
  const retenciones = useMemo(() => soloRetenciones(filas), [filas])
  const vacias = useMemo(
    () => columnasVisibles(tipo, filasEnPantalla).filter((c) => filasEnPantalla.every((f) => c.valor(f) === 0)),
    [tipo, filasEnPantalla]
  )
  // Los totales del libro son los de las facturas: las retenciones sufridas
  // se listan pero no son ventas.
  const totales = useMemo(() => totalizar(soloComprobantes(filas)), [filas])
  const filtrado = Boolean(entidad || clase)

  const nombreArchivo = `subdiario-iva-${esVenta ? "ventas" : "compras"}-${desde}-a-${hasta}`

  /*
   * El Excel lleva las mismas columnas que el libro, más la fecha del
   * comprobante, la moneda y el TC al final: el libro no los muestra, pero son
   * lo primero que se pregunta cuando un importe no cierra.
   */
  const exportar = () => {
    const columnas = columnasVisibles(tipo, filas)
    const comprobantes = soloComprobantes(filas)
    const retenciones = soloRetenciones(filas)
    const pie = (rotulo: string, t: ReturnType<typeof totalizar>) => [
      "",
      "",
      rotulo,
      "",
      ...columnas.map((c) => c.valor(t)),
      t.total,
      "",
      "",
      "",
    ]
    descargarCsv(
      `${nombreArchivo}.csv`,
      [
        "Fecha",
        "Factura",
        "Nombre",
        "C.U.I.T.",
        ...columnas.map((c) => c.rotulo),
        "TOTAL",
        "Fecha comprobante",
        "Moneda original",
        "TC",
      ],
      [
        ...filas.map((f) => [
          f.fecha,
          f.factura,
          f.razonSocial,
          f.cuit ? formatearCuit(f.cuit) : "",
          ...columnas.map((c) => c.valor(f)),
          f.total,
          f.fechaComprobante,
          f.moneda,
          f.tc ?? "",
        ]),
        pie(`Total (${comprobantes.length} comprobantes)`, totalizar(comprobantes)),
        ...(retenciones.length
          ? [pie("Retenciones sufridas (informativo)", totalizar(retenciones))]
          : []),
      ]
    )
  }

  // La impresión sale de su propia página, sin el menú ni los filtros: es la
  // que se guarda como PDF para el libro. Lleva los mismos filtros que esta.
  const imprimir = () => {
    const p = new URLSearchParams({ desde, hasta })
    if (entidad) p.set("entidad", entidad)
    if (clase) p.set("clase", clase)
    window.open(`${RUTA_SUBDIARIO[tipo]}/imprimir?${p}`, "_blank", "noopener")
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="mb-1 text-[12px] text-ink-muted">Período</p>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5">
              {(
                [
                  ["mes", "Mes"],
                  ["rango", "Rango"],
                ] as const
              ).map(([modo, etiqueta]) => (
                <button
                  key={modo}
                  aria-pressed={periodo.modo === modo}
                  onClick={() =>
                    setPeriodo(modo === "mes" ? { modo, mes: desde.slice(0, 7) || mesActual() } : { modo, desde, hasta })
                  }
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                    periodo.modo === modo
                      ? "bg-brand-50 text-brand-700"
                      : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                  )}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
            {periodo.modo === "mes" ? (
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Mes anterior"
                  title="Mes anterior"
                  onClick={() => setPeriodo({ modo: "mes", mes: moverMes(periodo.mes, -1) })}
                  className="h-9 w-8 px-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Input
                  type="month"
                  aria-label="Mes"
                  value={periodo.mes}
                  onChange={(e) => e.target.value && setPeriodo({ modo: "mes", mes: e.target.value })}
                  className="w-[170px]"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Mes siguiente"
                  title="Mes siguiente"
                  onClick={() => setPeriodo({ modo: "mes", mes: moverMes(periodo.mes, 1) })}
                  className="h-9 w-8 px-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <Input
                  type="date"
                  aria-label="Desde"
                  value={periodo.desde}
                  onChange={(e) => setPeriodo({ ...periodo, desde: e.target.value })}
                  className="w-[150px]"
                />
                <span className="text-[12px] text-ink-muted">a</span>
                <Input
                  type="date"
                  aria-label="Hasta"
                  value={periodo.hasta}
                  onChange={(e) => setPeriodo({ ...periodo, hasta: e.target.value })}
                  className="w-[150px]"
                />
              </>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="filtro-entidad" className="mb-1 block text-[12px] text-ink-muted">
            {esVenta ? "Cliente" : "Proveedor"}
          </label>
          <select
            id="filtro-entidad"
            value={entidad}
            onChange={(e) => setEntidad(e.target.value)}
            className="h-9 max-w-[240px] rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink"
          >
            <option value="">Todos</option>
            {entidades.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filtro-clase" className="mb-1 block text-[12px] text-ink-muted">
            Tipo de comprobante
          </label>
          <select
            id="filtro-clase"
            value={clase}
            onChange={(e) => setClase(e.target.value)}
            className="h-9 rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink"
          >
            <option value="">Todos</option>
            {clases.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportar} disabled={!filas.length}>
            <Download className="h-3.5 w-3.5" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={imprimir} disabled={!filas.length}>
            <Printer className="h-3.5 w-3.5" />
            PDF
          </Button>
        </div>
      </div>

      {!listo ? (
        <EmptyState icon={BookMarked} title="Elegí el período" />
      ) : query.isPending ? (
        <LoadingState label="Armando el subdiario…" />
      ) : query.isError ? (
        <ErrorState
          message={mensajeError(query.error, "No se pudo armar el subdiario")}
          onRetry={() => query.refetch()}
        />
      ) : !filas.length ? (
        <EmptyState
          icon={BookMarked}
          title={filtrado ? "Ningún comprobante con esos filtros" : "No hay comprobantes en el período"}
          description={
            filtrado
              ? undefined
              : `El subdiario se arma solo con las facturas de ${esVenta ? "venta" : "compra"} confirmadas.`
          }
        />
      ) : (
        <>
          <div className="panel overflow-clip">
            {/* Sin franja fija: la tabla scrollea en su caja, con los títulos
                arriba y el total abajo siempre a la vista. Una franja pegada
                taparía los títulos al bajar la página. */}
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-line bg-surface-subtle px-5 py-4">
              <Cifra rotulo="Comprobantes" valor={String(totales.comprobantes)} />
              <Cifra rotulo="Neto gravado" valor={formatearImporte(netoTotal(totales))} />
              <Cifra
                rotulo={esVenta ? "IVA débito" : "IVA crédito"}
                valor={formatearImporte(ivaTotal(totales))}
              />
              {esVenta ? (
                retenciones.length > 0 && (
                  <Cifra
                    rotulo="Retenciones sufridas"
                    valor={formatearImporte(Math.abs(totalizar(retenciones).total))}
                    nota="informativo"
                  />
                )
              ) : (
                <Cifra rotulo="Percepciones e impuestos" valor={formatearImporte(percepciones(totales))} />
              )}
              <Cifra rotulo="Total" valor={formatearImporte(totales.total)} destacado />
              {totales.notasDeCredito > 0 && (
                <p className="text-[11.5px] text-ink-muted">
                  Incluye {totales.notasDeCredito} nota{totales.notasDeCredito === 1 ? "" : "s"} de
                  crédito, en negativo
                </p>
              )}
            </div>
            {(vacias.length > 0 || verVacias || retenciones.length > 0) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-soft px-5 py-2 text-[11.5px] text-ink-muted">
                {(vacias.length > 0 || verVacias) && (
                  <button
                    onClick={() => setVerVacias((v) => !v)}
                    className="inline-flex items-center gap-1.5 hover:text-ink"
                    title={vacias.map((c) => c.rotulo).join(" · ")}
                  >
                    {verVacias ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {verVacias
                      ? "Ocultar las columnas sin importes"
                      : `${vacias.length} columna${vacias.length === 1 ? "" : "s"} sin importes en el período, ocultas`}
                  </button>
                )}
                {retenciones.length > 0 && (
                  <button
                    onClick={() => setVerRetenciones((v) => !v)}
                    className="inline-flex items-center gap-1.5 hover:text-ink"
                  >
                    {verRetenciones ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {verRetenciones
                      ? `Ocultar las ${retenciones.length} retenciones sufridas`
                      : `Ver las ${retenciones.length} retenciones sufridas`}
                  </button>
                )}
                <span className="ml-auto hidden text-ink-faint sm:inline">
                  Clic en una factura para abrirla · el PDF y el Excel llevan todas las columnas
                </span>
              </div>
            )}
            <TablaSubdiario filas={filasEnPantalla} tipo={tipo} ocultarVacias={!verVacias} enPantalla />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <TotalesPorAlicuota totales={totales} esVenta={esVenta} />
            {datos && !filtrado && <AsientoResumen resumen={datos.resumen} />}
          </div>
        </>
      )}
    </div>
  )
}

/* ── La tabla ─────────────────────────────────────────────────────────────── */

/**
 * La tabla con las columnas del libro del estudio, las mismas que la hoja
 * impresa y el Excel. Las retenciones sufridas (solo ventas) van intercaladas
 * por fecha, en gris y en negativo, y tienen su propio renglón de total: son
 * informativas y no suman al total del libro.
 */
export function TablaSubdiario({
  filas,
  tipo,
  ocultarVacias,
  enPantalla,
}: {
  filas: FilaSubdiario[]
  tipo: TipoComprobante
  /** Sin las columnas que no tienen ningún importe. */
  ocultarVacias?: boolean
  /** La tabla scrollea adentro de su caja, con títulos y total siempre a la
   *  vista, y cada factura abre su ficha. */
  enPantalla?: boolean
}) {
  const comprobantes = soloComprobantes(filas)
  const retenciones = soloRetenciones(filas)
  const totales = totalizar(comprobantes)
  const totalesRet = totalizar(retenciones)
  const columnas = columnasVisibles(tipo, filas).filter(
    (c) => !ocultarVacias || filas.some((f) => c.valor(f) !== 0)
  )
  const listado = tipo === "venta" ? "/admin/ventas/listado" : "/admin/compras/listado"
  const celda = "num whitespace-nowrap px-2 text-right font-mono text-[11.5px]"
  const texto = "text-[12px]"

  return (
    <Table contenedorClassName={enPantalla ? "max-h-[calc(100dvh-15rem)] min-h-[320px]" : undefined}>
      <TableHeader className={enPantalla ? "[&_th]:sticky [&_th]:top-0 [&_th]:z-[2]" : undefined}>
        <TableRow>
          <TableHead title="La fecha de registro: define el período">Fecha</TableHead>
          <TableHead>Factura</TableHead>
          <TableHead>Nombre</TableHead>
          <TableHead>C.U.I.T.</TableHead>
          {columnas.map((c) => (
            <TableHead key={c.clave} className="whitespace-nowrap px-2 text-right">
              {c.rotulo}
            </TableHead>
          ))}
          <TableHead className="text-right">TOTAL</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((f) => {
          const esRetencion = f.origen === "retencion"
          return (
            <TableRow
              key={f.id}
              className={cn(
                esRetencion && "text-ink-muted [&_td]:italic",
                !esRetencion && f.total < 0 && "bg-danger-soft/30"
              )}
            >
              <TableCell className={cn("num whitespace-nowrap font-mono text-ink-muted", texto)}>
                {fechaCorta(f.fecha)}
                {f.fechaComprobante !== f.fecha && (
                  <span className="block text-[9.5px] text-ink-faint" title="Fecha del comprobante">
                    comp. {fechaCorta(f.fechaComprobante)}
                  </span>
                )}
              </TableCell>
              <TableCell className={cn("num whitespace-nowrap font-mono", texto)}>
                {enPantalla && !esRetencion ? (
                  <Link
                    href={`${listado}?ver=${f.id}`}
                    target="_blank"
                    className="text-ink hover:text-brand-600 hover:underline"
                    title="Abrir la factura en otra pestaña"
                  >
                    {f.factura}
                  </Link>
                ) : (
                  f.factura
                )}
                {esRetencion && (
                  <span className="block text-[9.5px] not-italic text-ink-faint">
                    Retención sufrida · informativa
                  </span>
                )}
              </TableCell>
              <TableCell className={cn("max-w-[200px]", texto)}>
                <p className="truncate text-ink" title={f.razonSocial}>
                  {f.razonSocial}
                </p>
                {!esRetencion && f.condicionIva && (
                  <p className="text-[10.5px] text-ink-muted">{FORMA_JURIDICA_LABEL[f.condicionIva]}</p>
                )}
              </TableCell>
              <TableCell className={cn("num whitespace-nowrap font-mono text-ink-secondary", texto)}>
                {f.cuit ? formatearCuit(f.cuit) : "—"}
              </TableCell>
              {columnas.map((c) => (
                <TableCell key={c.clave} className={celda}>
                  {importeLibro(c.valor(f))}
                </TableCell>
              ))}
              <TableCell className={cn(celda, "font-semibold", !esRetencion && "text-ink")}>
                {importeLibro(f.total)}
                {f.moneda === "USD" && (
                  <span className="block text-[10px] font-normal text-ink-faint">
                    USD · TC {formatearImporte(f.tc ?? 0, "ARS", { simbolo: false })}
                  </span>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
      <TableFooter
        className={
          enPantalla
            ? "[&_td]:bg-surface-subtle [&_tr:first-child_td]:sticky [&_tr:first-child_td]:bottom-0 [&_tr:first-child_td]:z-[2]"
            : undefined
        }
      >
        <TableRow className="bg-surface-subtle">
          <TableCell colSpan={4} className={cn("font-semibold uppercase tracking-[0.06em] text-ink-muted", texto)}>
            Total · {totales.comprobantes} comprobantes
          </TableCell>
          {columnas.map((c) => (
            <TableCell key={c.clave} className={cn(celda, "font-semibold text-ink")}>
              {importeLibro(c.valor(totales))}
            </TableCell>
          ))}
          <TableCell className={cn(celda, "font-semibold text-ink")}>{importeLibro(totales.total)}</TableCell>
        </TableRow>
        {retenciones.length > 0 && (
          <TableRow>
            <TableCell colSpan={4} className={cn("italic text-ink-muted", texto)}>
              Retenciones sufridas (informativo) · {retenciones.length}
            </TableCell>
            {columnas.map((c) => (
              <TableCell key={c.clave} className={cn(celda, "italic text-ink-muted")}>
                {importeLibro(c.valor(totalesRet))}
              </TableCell>
            ))}
            <TableCell className={cn(celda, "italic text-ink-muted")}>{importeLibro(totalesRet.total)}</TableCell>
          </TableRow>
        )}
      </TableFooter>
    </Table>
  )
}

/* ── Totales por alícuota ─────────────────────────────────────────────────── */

export function TotalesPorAlicuota({
  totales,
  esVenta,
}: {
  totales: ReturnType<typeof totalizar>
  esVenta: boolean
}) {
  return (
    <div className="panel overflow-clip">
      <div className="panel-header">
        <p className="text-[13px] font-semibold text-ink">Totales por alícuota</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Alícuota</TableHead>
            <TableHead className="text-right">Neto gravado</TableHead>
            <TableHead className="text-right">{esVenta ? "IVA débito" : "IVA crédito"}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ALICUOTAS_SUBDIARIO.map((k) => (
            <TableRow key={k}>
              <TableCell className="text-[12.5px] text-ink">{ALICUOTA_SUBDIARIO_LABEL[k]}</TableCell>
              <TableCell className="num text-right font-mono text-[12px]">
                {formatearImporte(totales.neto[k], "ARS", { simbolo: false })}
              </TableCell>
              <TableCell className="num text-right font-mono text-[12px]">
                {formatearImporte(totales.iva[k], "ARS", { simbolo: false })}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-surface-subtle">
            <TableCell className="text-[12.5px] font-semibold text-ink">Total</TableCell>
            <TableCell className="num text-right font-mono text-[12px] font-semibold text-ink">
              {formatearImporte(netoTotal(totales), "ARS", { simbolo: false })}
            </TableCell>
            <TableCell className="num text-right font-mono text-[12px] font-semibold text-ink">
              {formatearImporte(ivaTotal(totales), "ARS", { simbolo: false })}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}

/* ── El asiento resumen ───────────────────────────────────────────────────── */

export function AsientoResumen({ resumen }: { resumen: Subdiario["resumen"] }) {
  return (
    <div className="panel overflow-clip">
      <div className="panel-header">
        <div>
          <p className="text-[13px] font-semibold text-ink">Asiento resumen del período</p>
          <p className="text-[11.5px] text-ink-muted">
            Los asientos de estos comprobantes, agrupados por cuenta. Para copiar al libro diario: no
            se registra de nuevo.
          </p>
        </div>
      </div>
      {resumen.sinAsiento > 0 && (
        <p className="flex items-center gap-2 border-b border-warning-line bg-warning-soft px-5 py-2 text-[11.5px] text-warning-text">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {resumen.sinAsiento === 1
            ? "1 comprobante del período no tiene asiento y no está en este resumen."
            : `${resumen.sinAsiento} comprobantes del período no tienen asiento y no están en este resumen.`}
          <Link href="/admin/contabilidad/sin-asentar" className="no-imprimir ml-auto shrink-0 font-semibold hover:underline">
            Corregir →
          </Link>
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cuenta</TableHead>
            <TableHead className="text-right">Debe</TableHead>
            <TableHead className="text-right">Haber</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {resumen.lineas.map((l) => (
            <TableRow key={l.cuentaId}>
              <TableCell>
                <p className={cn("text-[12.5px] text-ink", l.haber > 0 && "pl-6")}>
                  <span className="font-mono text-[11px] text-ink-faint">{l.codigo}</span> {l.nombre}
                </p>
              </TableCell>
              <TableCell className="num text-right font-mono text-[12px]">{importe(l.debe)}</TableCell>
              <TableCell className="num text-right font-mono text-[12px]">{importe(l.haber)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-surface-subtle">
            <TableCell className="text-[12.5px] font-semibold text-ink">Totales</TableCell>
            <TableCell className="num text-right font-mono text-[12px] font-semibold text-ink">
              {formatearImporte(resumen.debe, "ARS", { simbolo: false })}
            </TableCell>
            <TableCell className="num text-right font-mono text-[12px] font-semibold text-ink">
              {formatearImporte(resumen.haber, "ARS", { simbolo: false })}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}

/* ── Piezas chicas ────────────────────────────────────────────────────────── */

/** Lo que una compra suma por encima del neto y el IVA: percepciones, Ley
 *  25413 y los otros impuestos. */
const percepciones = (t: ReturnType<typeof totalizar>) =>
  t.percepcionIva + t.percepcionIibbCaba + t.percepcionIibbBsas + t.ley25413 + t.percepcionGanancias + t.otros

function Cifra({
  rotulo,
  valor,
  destacado,
  nota,
}: {
  rotulo: string
  valor: string
  destacado?: boolean
  nota?: string
}) {
  return (
    <div>
      <p className="eyebrow">
        {rotulo}
        {nota && <span className="ml-1 normal-case tracking-normal text-ink-faint">· {nota}</span>}
      </p>
      <p
        className={cn(
          "num mt-0.5 text-[16px] font-bold tracking-[-0.02em]",
          destacado ? "text-brand-600" : "text-ink"
        )}
      >
        {valor}
      </p>
    </div>
  )
}

/** `2026-10-07` → `07/10/2026`, como en el libro. */
export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}

/** `30711588864` → `30-71158886-4`. */
export function formatearCuit(cuit: string): string {
  const d = cuit.replace(/\D/g, "")
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : cuit
}
