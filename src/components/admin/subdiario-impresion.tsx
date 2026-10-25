"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Printer } from "lucide-react"

import { AsientoResumen, TotalesPorAlicuota, formatearCuit } from "@/components/admin/subdiario-client"
import { Button } from "@/components/ui/button"
import { ErrorState, LoadingState } from "@/components/ui/states"
import type { TipoComprobante } from "@/lib/admin/comprobantes"
import { claves, mensajeError, pedirJson } from "@/lib/admin/query"
import {
  TITULO_LIBRO,
  columnasVisibles,
  fechaEncabezadoLibro,
  fechaRenglonLibro,
  importeLibro,
  soloComprobantes,
  soloRetenciones,
  totalizar,
  type ColumnaLibro,
  type FilaSubdiario,
  type Subdiario,
  type TotalesSubdiario,
} from "@/lib/admin/subdiarios"
import { EMPRESA } from "@/lib/brand-kit"

/**
 * El subdiario como hoja para el libro: se imprime o se guarda como PDF desde
 * el diálogo del navegador.
 *
 * Copia el libro que mandó el estudio (Libro IVA Compras de septiembre): un
 * recuadro con la razón social, el título centrado, «Desde / Hasta» y el número
 * de página; abajo las columnas del libro, un «Subtotal:» al pie de cada hoja y
 * el «Total :» al final. Apaisado.
 *
 * Las hojas se arman acá, cortando por cantidad de renglones, y no con los
 * márgenes de `@page`: el encabezado, el número de página y el subtotal de cada
 * hoja tienen que ser parte de la hoja, y los navegadores no imprimen el
 * contenido de los márgenes de `@page` (Chrome los ignora, Safari también).
 *
 * No se imprime sola al abrirse: el diálogo de impresión tapa la hoja, y lo
 * primero que hay que poder hacer es mirarla.
 */

/** Renglones por hoja. A 8px entran unos 34 en A4 apaisado con el recuadro del
 *  encabezado; se deja aire para el subtotal y, en la última, el total. */
const RENGLONES_POR_HOJA = 30

/** El nombre cortado como en el libro: la columna tiene ancho fijo. */
const nombreCorto = (s: string) => (s.length > 28 ? s.slice(0, 28) : s)

export function SubdiarioImpresion({ tipo }: { tipo: TipoComprobante }) {
  const [params, setParams] = useState<URLSearchParams | null>(null)
  useEffect(() => setParams(new URLSearchParams(window.location.search)), [])

  const desde = params?.get("desde") ?? ""
  const hasta = params?.get("hasta") ?? ""
  const entidad = params?.get("entidad") ?? ""
  const clase = params?.get("clase") ?? ""

  const url = `/api/admin/contabilidad/subdiarios?${new URLSearchParams({ tipo, desde, hasta })}`
  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<Subdiario>(url, { signal }),
    enabled: Boolean(desde && hasta),
  })

  const filas = useMemo(
    () =>
      (query.data?.filas ?? []).filter(
        (f) => (!entidad || f.entidadId === entidad) && (!clase || f.clase === clase)
      ),
    [query.data, entidad, clase]
  )
  const hojas = useMemo(() => {
    const out: FilaSubdiario[][] = []
    for (let i = 0; i < filas.length; i += RENGLONES_POR_HOJA) out.push(filas.slice(i, i + RENGLONES_POR_HOJA))
    return out.length ? out : [[]]
  }, [filas])
  const filtrado = Boolean(entidad || clase)

  if (!params || query.isPending) return <LoadingState label="Armando la hoja…" />
  if (query.isError || !query.data) {
    return <ErrorState message={mensajeError(query.error, "No se pudo armar el subdiario")} />
  }

  const columnas = columnasVisibles(tipo, filas)
  const totales = totalizar(soloComprobantes(filas))
  const retenciones = soloRetenciones(filas)

  return (
    <div className="min-h-screen bg-surface-muted text-black print:bg-white">
      <style>{`
        @page { size: A4 landscape; margin: 8mm 8mm; }
        @media print {
          .no-imprimir { display: none !important; }
          .hoja { box-shadow: none !important; margin: 0 !important; break-after: page; }
          .hoja:last-of-type { break-after: auto; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .libro td, .libro th { padding: 1px 3px; white-space: nowrap; }
      `}</style>

      <div className="no-imprimir sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-6 py-3">
        <p className="text-[12.5px] text-ink-muted">
          Vista para el libro. En el diálogo elegí <b>Guardar como PDF</b> y orientación horizontal.
        </p>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" />
          Imprimir o guardar PDF
        </Button>
      </div>

      <div className="py-6 print:py-0">
        {hojas.map((renglones, i) => {
          const ultima = i === hojas.length - 1
          return (
            <section
              key={i}
              className="hoja mx-auto mb-6 w-[281mm] bg-white px-[4mm] py-[4mm] shadow-md print:w-auto print:px-0 print:py-0"
            >
              <Encabezado tipo={tipo} desde={desde} hasta={hasta} pagina={i + 1} />

              {i === 0 && filtrado && (
                <p className="mb-1 text-[8px]">
                  Filtrado{clase && ` · tipo ${clase}`}
                  {entidad && ` · ${filas[0]?.razonSocial ?? ""}`}. No es el libro completo del período.
                </p>
              )}

              <table className="libro w-full border-collapse text-[7.5px] tabular-nums">
                <thead>
                  <tr className="border-b border-black text-[7.5px]">
                    <th className="text-left font-normal">Fecha</th>
                    <th className="text-left font-normal">Factura</th>
                    <th className="text-left font-normal">Nombre</th>
                    <th className="text-left font-normal">C.U.I.T.</th>
                    {columnas.map((c) => (
                      <th key={c.clave} className="text-right font-normal">
                        {c.rotulo}
                      </th>
                    ))}
                    <th className="text-right font-normal">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {renglones.length === 0 && (
                    <tr>
                      <td colSpan={columnas.length + 5} className="py-6 text-center">
                        Sin comprobantes en el período.
                      </td>
                    </tr>
                  )}
                  {renglones.map((f) => (
                    <tr key={f.id} className={f.origen === "retencion" ? "italic text-neutral-600" : undefined}>
                      <td>{fechaRenglonLibro(f.fecha)}</td>
                      <td>{f.factura}</td>
                      <td>{nombreCorto(f.razonSocial)}</td>
                      <td>{f.cuit ? formatearCuit(f.cuit) : ""}</td>
                      {columnas.map((c) => (
                        <td key={c.clave} className="text-right">
                          {importeLibro(c.valor(f))}
                        </td>
                      ))}
                      <td className="text-right">{importeLibro(f.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {/* El subtotal es el de las facturas de la hoja: las
                      retenciones sufridas son informativas y no suman. */}
                  <Pie rotulo="Subtotal:" columnas={columnas} t={totalizar(soloComprobantes(renglones))} borde />
                  {ultima && (
                    <Fragment>
                      <Pie rotulo="Total :" columnas={columnas} t={totales} negrita />
                      {retenciones.length > 0 && (
                        <Pie
                          rotulo="Retenciones sufridas (informativo):"
                          columnas={columnas}
                          t={totalizar(retenciones)}
                          italica
                        />
                      )}
                    </Fragment>
                  )}
                </tfoot>
              </table>
            </section>
          )
        })}

        {filas.length > 0 && (
          <section className="hoja mx-auto w-[281mm] bg-white px-[4mm] py-[4mm] shadow-md print:w-auto print:px-0 print:py-0">
            <div className="grid grid-cols-2 gap-6">
              <TotalesPorAlicuota totales={totales} esVenta={tipo === "venta"} />
              {!filtrado && <AsientoResumen resumen={query.data.resumen} />}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

/** El recuadro del libro: razón social, título, período y página. */
function Encabezado({
  tipo,
  desde,
  hasta,
  pagina,
}: {
  tipo: TipoComprobante
  desde: string
  hasta: string
  pagina: number
}) {
  return (
    <header className="mb-2 border-2 border-black px-3 py-2 text-[9px]">
      <p>{EMPRESA.razonSocial}</p>
      <h1 className="my-1 text-center text-[13px] font-bold">{TITULO_LIBRO[tipo]}</h1>
      <div className="flex items-end justify-between">
        <p>
          Desde:&nbsp; {fechaEncabezadoLibro(desde)}&nbsp;&nbsp;&nbsp; Hasta:&nbsp; {fechaEncabezadoLibro(hasta)}
        </p>
        <p>Página:&nbsp;&nbsp;&nbsp; {pagina}</p>
      </div>
    </header>
  )
}

function Pie({
  rotulo,
  columnas,
  t,
  borde,
  negrita,
  italica,
}: {
  rotulo: string
  columnas: ColumnaLibro[]
  t: TotalesSubdiario
  borde?: boolean
  negrita?: boolean
  italica?: boolean
}) {
  const clase = [borde && "border-t border-black", negrita && "font-bold", italica && "italic"]
    .filter(Boolean)
    .join(" ")
  return (
    <tr className={clase}>
      <td colSpan={4} className="pt-1">
        {rotulo}
      </td>
      {columnas.map((c) => (
        <td key={c.clave} className="pt-1 text-right">
          {importeLibro(c.valor(t))}
        </td>
      ))}
      <td className="pt-1 text-right">{importeLibro(t.total)}</td>
    </tr>
  )
}
