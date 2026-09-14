"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle } from "lucide-react"

import { CorregirImputacionDialog } from "@/components/admin/corregir-imputacion-dialog"
import { Button } from "@/components/ui/button"
import type { DocumentoSinAsiento } from "@/lib/admin/asientos"
import { claves, pedirJson } from "@/lib/admin/query"
import type { FiltroPendientes } from "@/lib/admin/pendientes-contables-server"

/**
 * El cartel de "esto no llegó al mayor", en el módulo donde se cargó.
 *
 * POR QUE EN CADA MODULO Y NO SOLO EN CONTABILIDAD
 *
 * El problema nace en Facturas de compra y se ve en Contabilidad, que son dos
 * pantallas distintas usadas por dos personas distintas en dos momentos
 * distintos. Quien carga la factura no vuelve a abrir el mayor, así que se
 * entera del descuadre cuando alguien se lo dice — o en el cierre.
 *
 * Poniendo el aviso donde se originó el documento, el que lo cargó lo ve
 * mientras todavía se acuerda de qué era esa factura, que es el único momento en
 * que elegir la cuenta correcta es fácil. Un mes después, decidir contra qué se
 * imputa "FCC 00002-00000626" es arqueología.
 *
 * No se muestra nada cuando no hay pendientes: un cartel verde diciendo que todo
 * está bien entrena a ignorar la zona donde después aparece el rojo.
 */
export function AvisoSinAsiento({
  filtro,
  /** Se llama al corregir algo, para que la pantalla de atrás se refresque. */
  onCorregido,
}: {
  filtro: FiltroPendientes
  onCorregido?: () => void
}) {
  const [abierto, setAbierto] = useState(false)

  const { origen, tipo } = filtro
  const params = new URLSearchParams()
  if (origen) params.set("origen", origen)
  if (tipo) params.set("tipo", tipo)
  // Sin filtro, el mismo URL que la solapa de Contabilidad: comparten caché.
  const qs = params.toString()
  const url = `/api/admin/contabilidad/pendientes${qs ? `?${qs}` : ""}`

  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) =>
      pedirJson<{ documentos?: DocumentoSinAsiento[] }>(url, { signal }),
  })

  // Un fallo acá no puede romper la pantalla: el aviso es información adicional
  // sobre otra cosa, y sin él el módulo sigue siendo usable. Por eso un error se
  // lee igual que "no hay pendientes".
  const docs = query.data?.documentos ?? []

  if (query.isPending || docs.length === 0) return null

  const total = docs.length
  // "Se arregla en dos clicks" sólo es cierto cuando todo lo que falta es elegir
  // la cuenta. Un recibo fuera del mayor no se arregla desde acá, y prometerlo
  // haría que el que abre el diálogo busque un botón que no está.
  const soloFaltaCuenta = docs.every((d) => d.corregibleConCuenta && !d.cuentaContableId)
  const esRecibo = docs.every((d) => d.origen === "pago")

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 sm:flex-row sm:items-center">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning-text" strokeWidth={2.1} />

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink">
            {esRecibo
              ? total === 1
                ? "Hay 1 recibo que no llegó al mayor"
                : `Hay ${total} recibos que no llegaron al mayor`
              : total === 1
                ? "Hay 1 documento que no llegó al mayor"
                : `Hay ${total} documentos que no llegaron al mayor`}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-warning-text">
            {soloFaltaCuenta
              ? "Están en los saldos y en la deuda, pero fuera de la contabilidad porque les falta la cuenta contable. Se arregla en dos clicks."
              : esRecibo
                ? "La plata ya figura en las cuentas y las facturas ya figuran canceladas, pero el asiento no salió. Mirá el motivo de cada uno."
                : "Están en los saldos y en la deuda, pero fuera de la contabilidad. Mirá el motivo de cada uno."}
          </p>
        </div>

        <Button size="sm" onClick={() => setAbierto(true)} className="shrink-0">
          {soloFaltaCuenta ? "Corregir" : "Ver el motivo"}
        </Button>
      </div>

      <CorregirImputacionDialog
        abierto={abierto}
        documentos={docs}
        onCerrar={() => setAbierto(false)}
        onCorregido={onCorregido}
      />
    </>
  )
}
