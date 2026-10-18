"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Printer } from "lucide-react"

import { fechaCorta } from "@/components/admin/subdiario-client"
import { Button } from "@/components/ui/button"
import { ErrorState, LoadingState } from "@/components/ui/states"
import type { Asiento } from "@/lib/admin/asientos"
import { formatearImporte } from "@/lib/admin/moneda"
import { claves, mensajeError, pedirJson } from "@/lib/admin/query"
import { EMPRESA } from "@/lib/brand-kit"

/**
 * El libro diario como hoja para copiar al libro rubricado: se imprime o se
 * guarda como PDF desde el diálogo del navegador.
 *
 * Mismo encabezado que los subdiarios (razón social, título, período y número
 * de página). Vertical: son cuatro columnas. Dos formas, las mismas que en
 * pantalla: cada asiento, o un asiento resumen por mes (`?modo=mes`).
 *
 * Trae el período completo (`completo=1`), no los últimos 200 asientos de la
 * pantalla: un libro al que le faltan hojas no sirve.
 */

type LineaMensual = { cuentaId: string; codigo: string; nombre: string; debe: number; haber: number }
type AsientoMensual = { mes: string; asientos: number; lineas: LineaMensual[]; debe: number; haber: number }

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`
const importe = (n: number) => (n ? formatearImporte(n, "ARS", { simbolo: false }) : "")

export function DiarioImpresion() {
  const [params, setParams] = useState<URLSearchParams | null>(null)
  useEffect(() => setParams(new URLSearchParams(window.location.search)), [])

  const desde = params?.get("desde") ?? ""
  const hasta = params?.get("hasta") ?? ""
  const porMes = params?.get("modo") === "mes"
  const origen = porMes ? "" : (params?.get("origen") ?? "")

  const p = new URLSearchParams()
  if (desde) p.set("desde", desde)
  if (hasta) p.set("hasta", hasta)
  if (origen) p.set("origen", origen)
  const url = porMes
    ? `/api/admin/contabilidad/diario-mensual?${p}`
    : `/api/admin/contabilidad/diario?${p}&completo=1`

  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) =>
      pedirJson<{ asientos?: Asiento[]; meses?: AsientoMensual[]; truncado?: boolean }>(url, { signal }),
    enabled: params !== null,
  })

  if (!params || query.isPending) return <LoadingState label="Armando el libro…" />
  if (query.isError || !query.data) {
    return <ErrorState message={mensajeError(query.error, "No se pudo armar el libro diario")} />
  }

  // Del más viejo al más nuevo: el orden en que se copia al libro.
  const meses = [...(query.data.meses ?? [])].sort((a, b) => a.mes.localeCompare(b.mes))
  const asientos = query.data.asientos ?? []
  const debe = porMes
    ? meses.reduce((s, m) => s + m.debe, 0)
    : asientos.reduce((s, a) => s + a.lineas.reduce((x, l) => x + l.debeArs, 0), 0)
  const haber = porMes
    ? meses.reduce((s, m) => s + m.haber, 0)
    : asientos.reduce((s, a) => s + a.lineas.reduce((x, l) => x + l.haberArs, 0), 0)
  const vacio = porMes ? meses.length === 0 : asientos.length === 0

  return (
    <div className="min-h-screen bg-white text-ink">
      <style>{`
        @page { size: A4 portrait; margin: 14mm 12mm;
          @top-right { content: "Página " counter(page); font: 9px sans-serif; color: #555; } }
        @media print {
          .no-imprimir { display: none !important; }
          thead { display: table-header-group; }
          tbody { break-inside: avoid; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="no-imprimir sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-6 py-3">
        <p className="text-[12.5px] text-ink-muted">
          Vista para el libro. En el diálogo elegí <b>Guardar como PDF</b> para tener el archivo.
        </p>
        <Button size="sm" onClick={() => window.print()} disabled={vacio}>
          <Printer className="h-3.5 w-3.5" />
          Imprimir o guardar PDF
        </Button>
      </div>

      <div className="mx-auto max-w-[900px] px-6 py-6 print:max-w-none print:px-0 print:py-0">
        <header className="mb-4 grid grid-cols-3 items-end gap-4 border-b border-ink/30 pb-3">
          <div>
            <p className="text-[12px] font-bold uppercase">{EMPRESA.razonSocial}</p>
            <p className="text-[10.5px] text-ink-secondary">CUIT {EMPRESA.cuit}</p>
          </div>
          <h1 className="text-center text-[14px] font-bold uppercase tracking-[0.04em] underline">
            Libro diario{porMes ? " · resumen mensual" : ""}
          </h1>
          <p className="text-right text-[10.5px] text-ink-secondary">
            {desde && hasta ? `Período ${fechaCorta(desde)} al ${fechaCorta(hasta)}` : "Todos los períodos"}
          </p>
        </header>

        {origen && (
          <p className="mb-3 text-[10.5px] text-ink-secondary">
            Filtrado por origen. No es el libro diario completo del período.
          </p>
        )}

        {query.data.truncado && (
          <p className="no-imprimir mb-3 rounded border border-warning-line bg-warning-soft px-3 py-2 text-[11.5px] text-warning-text">
            El período es demasiado grande y el libro se cortó. Elegí un rango más chico.
          </p>
        )}

        {vacio ? (
          <p className="py-10 text-center text-[12px] text-ink-muted">Sin asientos en el período.</p>
        ) : (
          <table className="w-full border-collapse text-[10.5px] leading-snug">
            <thead>
              <tr className="border-b border-ink/40 text-left text-[9.5px] uppercase tracking-[0.04em] text-ink-secondary">
                <th className="w-[70px] py-1.5 pr-2 font-semibold">Código</th>
                <th className="py-1.5 pr-2 font-semibold">Cuenta</th>
                <th className="w-[110px] py-1.5 pl-2 text-right font-semibold">Debe</th>
                <th className="w-[110px] py-1.5 pl-2 text-right font-semibold">Haber</th>
              </tr>
            </thead>
            {porMes
              ? meses.map((m, i) => (
                  <tbody key={m.mes}>
                    <Cabecera
                      numero={i + 1}
                      fecha={`Resumen de ${nombreMes(m.mes)}`}
                      descripcion={`${m.asientos} asiento${m.asientos === 1 ? "" : "s"} del mes, agrupados por cuenta`}
                    />
                    {m.lineas.map((l) => (
                      <Linea key={l.cuentaId} codigo={l.codigo} cuenta={l.nombre} debe={l.debe} haber={l.haber} />
                    ))}
                    <Suma debe={m.debe} haber={m.haber} />
                  </tbody>
                ))
              : asientos.map((a) => (
                  <tbody key={a.id}>
                    <Cabecera
                      numero={a.numero}
                      ejercicio={a.ejercicioNombre}
                      fecha={fechaCorta(a.fecha)}
                      descripcion={a.descripcion}
                    />
                    {a.lineas.map((l) => (
                      <Linea
                        key={l.id}
                        codigo={l.cuentaCodigo}
                        cuenta={l.cuentaNombre}
                        detalle={l.auxiliarNombre ?? l.detalle}
                        debe={l.debeArs}
                        haber={l.haberArs}
                      />
                    ))}
                    <Suma
                      debe={a.lineas.reduce((s, l) => s + l.debeArs, 0)}
                      haber={a.lineas.reduce((s, l) => s + l.haberArs, 0)}
                    />
                  </tbody>
                ))}
            <tfoot>
              <tr className="border-t-2 border-ink/60 font-bold">
                <td className="py-2" colSpan={2}>
                  Total del período
                </td>
                <td className="num py-2 pl-2 text-right">{importe(debe)}</td>
                <td className="num py-2 pl-2 text-right">{importe(haber)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}

function Cabecera({
  numero,
  ejercicio,
  fecha,
  descripcion,
}: {
  numero: number
  ejercicio?: string
  fecha: string
  descripcion: string
}) {
  return (
    <tr className="border-t border-ink/25">
      <td className="pb-0.5 pt-2.5 font-bold" colSpan={4}>
        <span className="num">
          Asiento N° {numero}
          {ejercicio ? ` · ${ejercicio}` : ""}
        </span>
        <span className="mx-2 text-ink-faint">—</span>
        <span className="num">{fecha}</span>
        <span className="ml-2 font-normal text-ink-secondary">{descripcion}</span>
      </td>
    </tr>
  )
}

function Linea({
  codigo,
  cuenta,
  detalle,
  debe,
  haber,
}: {
  codigo: string
  cuenta: string
  detalle?: string | null
  debe: number
  haber: number
}) {
  return (
    <tr>
      <td className="num py-0.5 pr-2 text-ink-secondary">{codigo}</td>
      <td className={`py-0.5 pr-2 ${haber && !debe ? "pl-6" : ""}`}>
        {cuenta}
        {detalle && <span className="text-ink-muted"> · {detalle}</span>}
      </td>
      <td className="num py-0.5 pl-2 text-right">{importe(debe)}</td>
      <td className="num py-0.5 pl-2 text-right">{importe(haber)}</td>
    </tr>
  )
}

function Suma({ debe, haber }: { debe: number; haber: number }) {
  return (
    <tr className="text-ink-secondary">
      <td colSpan={2} />
      <td className="num border-t border-ink/20 py-0.5 pl-2 text-right">{importe(debe)}</td>
      <td className="num border-t border-ink/20 py-0.5 pl-2 text-right">{importe(haber)}</td>
    </tr>
  )
}
