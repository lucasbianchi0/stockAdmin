"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Printer } from "lucide-react"

import { fechaCorta } from "@/components/admin/subdiario-client"
import { Button } from "@/components/ui/button"
import { ErrorState, LoadingState } from "@/components/ui/states"
import {
  agruparSumasYSaldos,
  type ColumnasSumasSaldos,
  type SumasYSaldos,
} from "@/lib/admin/asientos"
import { formatearImporte } from "@/lib/admin/moneda"
import { TIPO_CUENTA_LABEL } from "@/lib/admin/plan-cuentas"
import { claves, mensajeError, pedirJson } from "@/lib/admin/query"
import { EMPRESA } from "@/lib/brand-kit"

/**
 * Sumas y saldos como hoja A4 vertical, para imprimir o guardar como PDF.
 *
 * El estudio contable lo pidió con el encabezado de siempre en cada hoja:
 * razón social, título, período y número de página dentro de un recuadro.
 *
 * La paginación se arma acá y no en el navegador. El número de página con
 * `@page { @top-right }` no lo dibuja Chrome de forma confiable, y un contador
 * CSS dentro de un `<thead>` repetido no avanza entre hojas. Así que se parte
 * en hojas de una cantidad fija de renglones: cada renglón tiene alto fijo y
 * los nombres se recortan a una línea, con lo que cada hoja entra exacta en un
 * A4 y lleva su propio encabezado con su número.
 */

/** Renglones por hoja. A4 (297mm) − márgenes (2×10mm) − recuadro y títulos de
 *  columna (~32mm) = ~245mm; a 5mm por renglón entran 49, se dejan 46 de aire. */
const RENGLONES_POR_HOJA = 46

type Renglon =
  | { clase: "cuenta"; id: string; codigo: string; nombre: string; columnas: ColumnasSumasSaldos }
  | { clase: "subtotal" | "total"; id: string; etiqueta: string; columnas: ColumnasSumasSaldos }

const importe = (n: number) => (n ? formatearImporte(n, "ARS", { simbolo: false }) : "")

export function SumasSaldosImpresion() {
  const [params, setParams] = useState<URLSearchParams | null>(null)
  useEffect(() => setParams(new URLSearchParams(window.location.search)), [])

  // Los mismos filtros que la pantalla: el PDF tiene que dar lo mismo que se ve.
  const desde = params?.get("desde") ?? ""
  const hasta = params?.get("hasta") ?? ""
  const todas = params?.get("todas") === "1"

  const p = new URLSearchParams()
  if (desde) p.set("desde", desde)
  if (hasta) p.set("hasta", hasta)
  if (todas) p.set("todas", "1")
  const url = `/api/admin/contabilidad/sumas-y-saldos?${p}`

  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<SumasYSaldos & { truncado?: boolean }>(url, { signal }),
    enabled: params !== null,
  })

  if (!params || query.isPending) return <LoadingState label="Armando sumas y saldos…" />
  if (query.isError || !query.data?.filas) {
    return <ErrorState message={mensajeError(query.error, "No se pudo armar sumas y saldos")} />
  }

  const { rubros, total } = agruparSumasYSaldos(query.data.filas)
  const renglones: Renglon[] = [
    ...rubros.flatMap((r): Renglon[] => [
      ...r.filas.map(
        (f): Renglon => ({
          clase: "cuenta",
          id: f.cuentaId,
          codigo: f.codigo,
          nombre: f.nombre,
          columnas: {
            debe: f.debeArs,
            haber: f.haberArs,
            saldoDeudor: f.saldoDeudor,
            saldoAcreedor: f.saldoAcreedor,
          },
        })
      ),
      { clase: "subtotal", id: `sub-${r.tipo}`, etiqueta: `Total ${TIPO_CUENTA_LABEL[r.tipo]}`, columnas: r.subtotal },
    ]),
    ...(rubros.length ? [{ clase: "total" as const, id: "total", etiqueta: "Total general", columnas: total }] : []),
  ]

  const hojas: Renglon[][] = []
  for (let i = 0; i < renglones.length; i += RENGLONES_POR_HOJA) {
    hojas.push(renglones.slice(i, i + RENGLONES_POR_HOJA))
  }
  if (!hojas.length) hojas.push([])

  const periodo =
    desde && hasta
      ? `Desde: ${fechaCorta(desde)}    Hasta: ${fechaCorta(hasta)}`
      : desde
        ? `Desde: ${fechaCorta(desde)}`
        : hasta
          ? `Al ${fechaCorta(hasta)}`
          : "Todos los períodos"

  return (
    <div className="min-h-screen bg-surface-sunken text-ink print:bg-white">
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          .no-imprimir { display: none !important; }
          .hoja { box-shadow: none !important; margin: 0 !important; padding: 0 !important; width: auto !important; }
          .hoja:not(:last-child) { break-after: page; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="no-imprimir sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-6 py-3">
        <p className="text-[12.5px] text-ink-muted">
          Vista para imprimir. En el diálogo elegí <b>Guardar como PDF</b> para tener el archivo.
        </p>
        <Button size="sm" onClick={() => window.print()} disabled={!renglones.length}>
          <Printer className="h-3.5 w-3.5" />
          Imprimir o guardar PDF
        </Button>
      </div>

      {query.data.truncado && (
        <p className="no-imprimir mx-auto mt-4 w-[210mm] rounded border border-warning-line bg-warning-soft px-3 py-2 text-[11.5px] text-warning-text">
          El período es demasiado grande y los saldos se cortaron. Elegí un rango más chico.
        </p>
      )}

      {hojas.map((hoja, i) => (
        <section
          key={i}
          className="hoja mx-auto my-6 w-[210mm] bg-white p-[10mm] shadow-e1"
        >
          <header className="mb-[3mm] grid grid-cols-[1fr_auto_1fr] items-center gap-4 border border-ink/70 px-3 py-2">
            <p className="text-[11px] font-bold uppercase">{EMPRESA.razonSocial}</p>
            <div className="text-center">
              <h1 className="text-[13px] font-bold uppercase tracking-[0.04em]">Sumas y saldos</h1>
              <p className="num mt-0.5 whitespace-pre text-[10px]">{periodo}</p>
            </div>
            <p className="num text-right text-[10px]">Página: {i + 1}</p>
          </header>

          {renglones.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-ink-muted">Sin movimientos en el período.</p>
          ) : (
            <table className="w-full table-fixed border-collapse text-[9px] leading-none">
              <colgroup>
                <col className="w-[13mm]" />
                <col />
                <col className="w-[26mm]" />
                <col className="w-[26mm]" />
                <col className="w-[26mm]" />
                <col className="w-[26mm]" />
              </colgroup>
              <thead>
                <tr className="h-[6mm] border-b border-ink/50 text-left text-[8.5px] uppercase tracking-[0.03em]">
                  <th className="pr-1 font-semibold">Código</th>
                  <th className="pr-1 font-semibold">Cuenta</th>
                  <th className="pl-1 text-right font-semibold">Debe</th>
                  <th className="pl-1 text-right font-semibold">Haber</th>
                  <th className="pl-1 text-right font-semibold">Saldo deudor</th>
                  <th className="pl-1 text-right font-semibold">Saldo acreedor</th>
                </tr>
              </thead>
              <tbody>
                {hoja.map((r) =>
                  r.clase === "cuenta" ? (
                    <tr key={r.id} className="h-[5mm]">
                      <td className="num pr-1 text-ink-secondary">{r.codigo}</td>
                      <td className="truncate pr-1">{r.nombre}</td>
                      <Importes columnas={r.columnas} />
                    </tr>
                  ) : (
                    <tr
                      key={r.id}
                      className={`h-[5mm] font-bold ${
                        r.clase === "total" ? "border-y-2 border-ink/70" : "border-y border-ink/50"
                      }`}
                    >
                      <td />
                      <td className="truncate pr-1">{r.etiqueta}</td>
                      <Importes columnas={r.columnas} siempre />
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  )
}

/** Las cuatro columnas. En las cuentas el cero va en blanco; en los totales se
 *  escribe, porque un subtotal vacío parece un dato que falta. */
function Importes({ columnas, siempre = false }: { columnas: ColumnasSumasSaldos; siempre?: boolean }) {
  const fmt = siempre ? (n: number) => formatearImporte(n, "ARS", { simbolo: false }) : importe
  return (
    <>
      <td className="num truncate pl-1 text-right">{fmt(columnas.debe)}</td>
      <td className="num truncate pl-1 text-right">{fmt(columnas.haber)}</td>
      <td className="num truncate pl-1 text-right">{fmt(columnas.saldoDeudor)}</td>
      <td className="num truncate pl-1 text-right">{fmt(columnas.saldoAcreedor)}</td>
    </>
  )
}
