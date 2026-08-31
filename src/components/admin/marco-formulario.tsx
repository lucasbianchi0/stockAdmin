"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * El marco de los formularios de carga —comprobantes y pagos—, que ahora viven
 * en dos lugares distintos con el mismo contenido adentro.
 *
 *  · **Modal**, encima de un listado: así se editan una factura de venta o un
 *    cobro ya cargados, sin perder de vista la fila de la que se salió.
 *  · **Embebido**, como la pantalla entera: así se cargan las facturas de
 *    compra y los pagos, que son pantallas de alta y nada más. Ahí no hay nada
 *    detrás que tapar, y un overlay sobre una página vacía es una ventana
 *    flotando sobre nada.
 *
 * Lo único que cambia entre los dos es esta cáscara: el fondo, el `max-height`
 * y el rol accesible. El formulario de adentro —seiscientas líneas de campos,
 * cálculos y validaciones— es exactamente el mismo, que es la razón de que esto
 * sea un marco y no un segundo formulario.
 */
export function MarcoFormulario({
  embebido,
  etiqueta,
  alto,
  onFondo,
  children,
}: {
  embebido: boolean
  /** Nombre accesible del diálogo. Embebido no hace falta: el `PageHeader` de
   *  la pantalla ya lo dice, y repetirlo suma un rótulo sin dueño. */
  etiqueta: string
  /** El techo del modal, que cada formulario ajusta al largo que tiene. */
  alto: string
  /** Click en el fondo. Solo existe en modal. */
  onFondo: () => void
  children: ReactNode
}) {
  if (embebido) {
    return <div className="panel flex flex-col overflow-hidden">{children}</div>
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={etiqueta}
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={onFondo}
      />

      <div
        className={cn(
          "relative flex w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-6 fade-in-0 duration-250 sm:max-w-3xl sm:rounded-2xl",
          alto
        )}
      >
        {children}
      </div>
    </div>
  )
}
