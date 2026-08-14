"use client"

import { Check, Trash2 } from "lucide-react"

import { Bloque, Cifra, Dato, DetalleDialog, ListaDatos } from "@/components/admin/detalle-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  CATEGORIA_LABEL,
  ORIGEN_LABEL,
  esEditable,
  type Movimiento,
} from "@/lib/admin/movimientos"
import { formatearFechaLarga } from "@/lib/admin/fecha"
import { formatearContravalor, formatearImporte, formatearTc } from "@/lib/admin/moneda"

/**
 * Un movimiento de caja abierto desde la tabla.
 *
 * El dato que el listado no muestra y acá manda es el contravalor: un gasto
 * cargado en dólares afecta el saldo en dólares, pero para el control mensual
 * hace falta saber cuántos pesos fueron al cambio de ese día. Está guardado en
 * el movimiento —no se recalcula— justamente para que no cambie solo.
 */
export function MovimientoDetalle({
  abierto,
  movimiento: m,
  onCerrar,
  onConciliar,
  onBorrar,
}: {
  abierto: boolean
  movimiento: Movimiento | null
  onCerrar: () => void
  onConciliar: () => void
  /** Opcional: el extracto solo deja borrar lo que no cuelga de un recibo. */
  onBorrar?: () => void
}) {
  const entra = m?.signo === 1

  return (
    <DetalleDialog
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={m ? ORIGEN_LABEL[m.origen] : "Movimiento"}
      subtitulo={m ? `${m.cuentaNombre ?? "Sin cuenta"} · ${formatearFechaLarga(m.fecha)}` : undefined}
      badges={
        m?.conciliado ? (
          <Badge tone="success" size="sm">
            Conciliado
          </Badge>
        ) : undefined
      }
      acciones={
        m && (
          <>
            <Button variant="outline" onClick={onConciliar}>
              <Check className="h-3.5 w-3.5" />
              {m.conciliado ? "Desmarcar" : "Marcar conciliado"}
            </Button>
            {/* Los que cuelgan de un recibo se anulan desde el recibo: borrar
                acá dejaría la factura cancelada sin la plata que la respalda. */}
            {esEditable(m.origen) && (
              <Button variant="destructive" onClick={onBorrar}>
                <Trash2 className="h-3.5 w-3.5" />
                Borrar
              </Button>
            )}
          </>
        )
      }
    >
      {m && (
        <>
          <Bloque titulo="Importe">
            <div className="grid grid-cols-2 gap-2.5">
              <Cifra
                rotulo={entra ? "Entró" : "Salió"}
                valor={`${entra ? "+" : "−"}${formatearImporte(m.importe, m.moneda)}`}
                tono={entra ? "success" : "danger"}
              />
              <Cifra
                rotulo={m.moneda === "USD" ? "En pesos" : "En dólares"}
                valor={
                  m.moneda === "USD"
                    ? formatearContravalor(m.importeArs, "ARS")
                    : formatearContravalor(m.importeUsd, "USD")
                }
                pie={m.tc === null ? "sin cotización" : `TC ${formatearTc(m.tc)}`}
              />
            </div>
          </Bloque>

          <Bloque titulo="Datos">
            <ListaDatos>
              <Dato rotulo="Cuenta" valor={m.cuentaNombre} />
              <Dato rotulo="Fecha" valor={formatearFechaLarga(m.fecha)} />
              <Dato rotulo="Origen" valor={ORIGEN_LABEL[m.origen]} />
              <Dato
                rotulo="Categoría"
                valor={m.categoria ? CATEGORIA_LABEL[m.categoria] : null}
              />
              <Dato rotulo="Detalle" valor={m.detalle} className="whitespace-pre-wrap" />
              <Dato rotulo="Referencia" valor={m.referencia} className="num" />
              <Dato rotulo="Cuenta contable" valor={m.cuentaContableNombre} />
              <Dato rotulo="Cargado el" valor={formatearFechaLarga(m.createdAt.slice(0, 10))} />
            </ListaDatos>
          </Bloque>
        </>
      )}
    </DetalleDialog>
  )
}
