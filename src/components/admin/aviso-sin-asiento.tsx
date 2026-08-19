"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"

import { CorregirImputacionDialog } from "@/components/admin/corregir-imputacion-dialog"
import { Button } from "@/components/ui/button"
import type { DocumentoSinAsiento } from "@/lib/admin/asientos"
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
  const [docs, setDocs] = useState<DocumentoSinAsiento[]>([])
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState(false)

  const { origen, tipo } = filtro

  const cargar = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (origen) params.set("origen", origen)
      if (tipo) params.set("tipo", tipo)
      const res = await fetch(`/api/admin/contabilidad/pendientes?${params}`)
      const data = await res.json()
      setDocs(data.documentos ?? [])
    } catch {
      // Un fallo acá no puede romper la pantalla: el aviso es información
      // adicional sobre otra cosa, y sin él el módulo sigue siendo usable.
      setDocs([])
    } finally {
      setCargando(false)
    }
  }, [origen, tipo])

  useEffect(() => {
    void cargar()
  }, [cargar])

  if (cargando || docs.length === 0) return null

  const total = docs.length
  const soloFaltaCuenta = docs.every((d) => !d.cuentaContableId)

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 sm:flex-row sm:items-center">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning-text" strokeWidth={2.1} />

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink">
            {total === 1
              ? "Hay 1 documento que no llegó al mayor"
              : `Hay ${total} documentos que no llegaron al mayor`}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-warning-text">
            {soloFaltaCuenta
              ? "Están en los saldos y en la deuda, pero fuera de la contabilidad porque les falta la cuenta contable. Se arregla en dos clicks."
              : "Están en los saldos y en la deuda, pero fuera de la contabilidad. Mirá el motivo de cada uno."}
          </p>
        </div>

        <Button size="sm" onClick={() => setAbierto(true)} className="shrink-0">
          Corregir
        </Button>
      </div>

      <CorregirImputacionDialog
        abierto={abierto}
        documentos={docs}
        onCerrar={() => setAbierto(false)}
        onCorregido={() => {
          void cargar()
          onCorregido?.()
        }}
      />
    </>
  )
}
