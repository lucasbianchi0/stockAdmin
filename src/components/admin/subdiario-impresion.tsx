"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Printer } from "lucide-react"

import {
  AsientoResumen,
  TablaSubdiario,
  TotalesPorAlicuota,
  fechaCorta,
} from "@/components/admin/subdiario-client"
import { Button } from "@/components/ui/button"
import { ErrorState, LoadingState } from "@/components/ui/states"
import type { TipoComprobante } from "@/lib/admin/comprobantes"
import { claves, mensajeError, pedirJson } from "@/lib/admin/query"
import { TITULO_SUBDIARIO, totalizar, type Subdiario } from "@/lib/admin/subdiarios"
import { EMPRESA } from "@/lib/brand-kit"

/**
 * El subdiario como hoja para el libro: se imprime o se guarda como PDF desde
 * el diálogo del navegador.
 *
 * Copia el formato del modelo que mandó el contador: razón social arriba a la
 * izquierda, el título centrado, el período abajo y el número de página arriba
 * a la derecha. Apaisado, porque son dieciséis columnas.
 *
 * No se imprime sola al abrirse: el diálogo de impresión tapa la hoja, y lo
 * primero que hay que poder hacer es mirarla.
 */
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
  const filtrado = Boolean(entidad || clase)
  const titulo = TITULO_SUBDIARIO[tipo]

  if (!params || query.isPending) return <LoadingState label="Armando la hoja…" />
  if (query.isError || !query.data) {
    return <ErrorState message={mensajeError(query.error, "No se pudo armar el subdiario")} />
  }

  return (
    <div className="min-h-screen bg-white text-ink">
      <style>{`
        @page { size: A4 landscape; margin: 12mm 10mm;
          @top-right { content: "Página " counter(page); font: 9px sans-serif; color: #555; } }
        @media print {
          .no-imprimir { display: none !important; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="no-imprimir sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-6 py-3">
        <p className="text-[12.5px] text-ink-muted">
          Vista para el libro. En el diálogo elegí <b>Guardar como PDF</b> para tener el archivo.
        </p>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" />
          Imprimir o guardar PDF
        </Button>
      </div>

      <div className="mx-auto max-w-[1400px] px-6 py-6 print:max-w-none print:px-0 print:py-0">
        <header className="mb-4 grid grid-cols-3 items-end gap-4 border-b border-ink/30 pb-3">
          <div>
            <p className="text-[12px] font-bold uppercase">{EMPRESA.razonSocial}</p>
            <p className="text-[10.5px] text-ink-secondary">CUIT {EMPRESA.cuit}</p>
          </div>
          <h1 className="text-center text-[14px] font-bold uppercase tracking-[0.04em] underline">
            {titulo}
          </h1>
          <p className="text-right text-[10.5px] text-ink-secondary">
            Período {fechaCorta(desde)} al {fechaCorta(hasta)}
          </p>
        </header>

        {filtrado && (
          <p className="mb-3 text-[10.5px] text-ink-secondary">
            Filtrado{clase && ` · tipo ${clase}`}
            {entidad && ` · ${filas[0]?.razonSocial ?? ""}`}. No es el subdiario completo del período.
          </p>
        )}

        {filas.length === 0 ? (
          <p className="py-10 text-center text-[12px] text-ink-muted">Sin comprobantes en el período.</p>
        ) : (
          <>
            <TablaSubdiario filas={filas} esVenta={tipo === "venta"} impresion />
            <div className="mt-6 grid grid-cols-2 gap-6 break-inside-avoid">
              <TotalesPorAlicuota totales={totalizar(filas)} esVenta={tipo === "venta"} />
              {!filtrado && <AsientoResumen resumen={query.data.resumen} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
