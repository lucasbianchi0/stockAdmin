"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Printer } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ErrorState, LoadingState } from "@/components/ui/states"
import type { Asiento } from "@/lib/admin/asientos"
import { armarLibroDiario, paginarLibro, type RenglonLibro } from "@/lib/admin/libro-diario"
import { claves, mensajeError, pedirJson } from "@/lib/admin/query"
import { EMPRESA } from "@/lib/brand-kit"

/**
 * El libro diario con el formato del estudio (`?modo=libro`): la hoja que va
 * directo a los libros rubricados, igual a la que venían encuadernando.
 *
 * Las hojas se arman acá, con un alto fijo de A4 y una cantidad fija de
 * renglones, cada una con su recuadro y su "Página: N". No se usa el contador
 * de `@page`: Chrome lo dibuja pero Safari y Firefox no, y un libro rubricado
 * sin números de hoja no sirve. Como cada renglón es de una sola línea (cuenta
 * y descripción se recortan al ancho de la columna), contar renglones alcanza
 * para saber qué entra en una hoja.
 *
 * Siempre el libro completo del período: el filtro por origen de la pantalla
 * no aplica acá.
 */

/** Renglones por hoja: lo que entra en el alto útil con 3,75 mm por renglón. */
const RENGLONES_POR_HOJA = 62

/**
 * Importes en 1.234,56, como los subdiarios y el resto del sistema. El libro
 * del sistema anterior salía en 1,234.56; si el estudio lo quiere igual, es
 * cambiar "es-AR" por "en-US" acá y en los subdiarios a la vez, para que los
 * tres libros sigan saliendo iguales.
 */
const importe = (n: number) =>
  n ? n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""

/** Las columnas del original, en mm: entran justo en el ancho útil de A4. */
const COLUMNAS = "15mm 8mm 11mm 43mm 61mm 24mm 24mm"

export function LibroDiarioImpresion() {
  const [params, setParams] = useState<URLSearchParams | null>(null)
  useEffect(() => setParams(new URLSearchParams(window.location.search)), [])

  const desde = params?.get("desde") ?? ""
  const hasta = params?.get("hasta") ?? ""

  const p = new URLSearchParams()
  if (desde) p.set("desde", desde)
  if (hasta) p.set("hasta", hasta)
  const url = `/api/admin/contabilidad/diario?${p}&completo=1`

  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<{ asientos: Asiento[]; truncado?: boolean }>(url, { signal }),
    enabled: params !== null,
  })

  const hojas = useMemo(
    () =>
      paginarLibro(
        armarLibroDiario(query.data?.asientos ?? [], { desde, hasta }),
        RENGLONES_POR_HOJA
      ),
    [query.data, desde, hasta]
  )

  if (!params || query.isPending) return <LoadingState label="Armando el libro…" />
  if (query.isError || !query.data) {
    return <ErrorState message={mensajeError(query.error, "No se pudo armar el libro diario")} />
  }

  return (
    <div className="min-h-screen bg-surface-muted text-black print:bg-white">
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          .no-imprimir { display: none !important; }
          html, body { background: #fff !important; }
          .hoja { margin: 0 !important; box-shadow: none !important; }
          .hoja:not(:last-child) { break-after: page; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="no-imprimir sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-6 py-3">
        <p className="text-[12.5px] text-ink-muted">
          Formato del libro rubricado · {hojas.length} hoja{hojas.length === 1 ? "" : "s"}. En el
          diálogo elegí <b>Guardar como PDF</b>, tamaño A4 y sin márgenes ni encabezados.
        </p>
        <Button size="sm" onClick={() => window.print()} disabled={!hojas.length}>
          <Printer className="h-3.5 w-3.5" />
          Imprimir o guardar PDF
        </Button>
      </div>

      {query.data.truncado && (
        <p className="no-imprimir mx-auto mt-4 max-w-[210mm] rounded border border-warning-line bg-warning-soft px-3 py-2 text-[11.5px] text-warning-text">
          El período es demasiado grande y el libro se cortó. Elegí un rango más chico.
        </p>
      )}

      {!hojas.length ? (
        <p className="py-10 text-center text-[12px] text-ink-muted">Sin asientos en el período.</p>
      ) : (
        hojas.map((renglones, i) => <Hoja key={i} numero={i + 1} renglones={renglones} />)
      )}
    </div>
  )
}

function Hoja({ numero, renglones }: { numero: number; renglones: RenglonLibro[] }) {
  return (
    <section
      className="hoja mx-auto my-6 overflow-hidden bg-white shadow-e4"
      style={{
        width: "210mm",
        // Un pelo menos que 297 mm: con el alto exacto, el redondeo de algunos
        // navegadores empuja una hoja en blanco entre cada hoja.
        height: "296mm",
        padding: "10mm 12mm",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <header
        className="flex flex-col border-2 border-black px-[2.5mm] py-[1.5mm]"
        style={{ height: "22mm" }}
      >
        <div className="flex items-start justify-between text-[10pt]">
          <span>{EMPRESA.razonSocial}</span>
          <span className="flex gap-[8mm]">
            <span>Página:</span>
            <span className="tabular-nums">{numero}</span>
          </span>
        </div>
        <h1 className="text-center text-[12pt] font-bold">LIBRO DIARIO</h1>
      </header>

      <div
        className="mt-[3mm] grid items-end border-b border-black pb-[1mm] text-[10pt]"
        style={{ gridTemplateColumns: COLUMNAS }}
      >
        <span className="text-center">Fecha</span>
        <span className="text-right">Asto</span>
        <span className="col-span-2 text-center">Cuenta</span>
        <span className="text-center">Descripción</span>
        <span className="text-right pr-[6mm]">Debe</span>
        <span className="text-right pr-[3mm]">Haber</span>
      </div>

      <div className="mt-[2mm] text-[8.5pt]">
        {renglones.map((r, i) =>
          r.tipo === "blanco" ? (
            <div key={i} style={{ height: "3.75mm" }} />
          ) : (
            <div
              key={i}
              className="grid items-center whitespace-nowrap"
              style={{ gridTemplateColumns: COLUMNAS, height: "3.75mm", lineHeight: "3.75mm" }}
            >
              <span className="tabular-nums">{r.fecha}</span>
              <span className="text-right tabular-nums">{r.asto}</span>
              <span className="pr-[1.5mm] text-right tabular-nums">{r.codigo}</span>
              <span className="overflow-hidden">{r.cuenta}</span>
              <span className="overflow-hidden pl-[1mm]">{r.descripcion}</span>
              <span className="text-right tabular-nums">{importe(r.debe)}</span>
              <span className="text-right tabular-nums">{importe(r.haber)}</span>
            </div>
          )
        )}
      </div>
    </section>
  )
}
