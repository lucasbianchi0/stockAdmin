"use client"

import { Trash2 } from "lucide-react"

import {
  Bloque,
  Cifra,
  Dato,
  DetalleDialog,
  Lista,
  ListaDatos,
  Renglon,
  Vacio,
} from "@/components/admin/detalle-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatearNumero } from "@/lib/admin/comprobantes"
import { convertir, etiquetaRetencion, type Cobro } from "@/lib/admin/cobros"
import type { TipoPago } from "@/lib/admin/cobros-server"
import { formatearFechaLarga } from "@/lib/admin/fecha"
import { formatearImporte, formatearTc } from "@/lib/admin/moneda"

/**
 * Un recibo abierto desde la tabla.
 *
 * Todo lo que se muestra ya viaja en la fila —el listado trae medios,
 * imputaciones y retenciones—, así que este panel no pide nada al servidor: es
 * la misma información desplegada. En la tabla los comprobantes entran como
 * chips y las cuentas como una línea de texto; acá cada uno lleva su importe, y
 * esa es la diferencia: la fila dice *qué* canceló, el panel dice *cuánto de
 * cada cosa*.
 */
export function PagoDetalle({
  abierto,
  tipo,
  cobro,
  onCerrar,
  onAnular,
}: {
  abierto: boolean
  tipo: TipoPago
  cobro: Cobro | null
  onCerrar: () => void
  onAnular: () => void
}) {
  const esCobro = tipo === "cobro"
  /** Hubo conversión si alguna factura o alguna cuenta estaba en otra moneda que
   *  el recibo. Es la condición para que el TC signifique algo. */
  const hayConversion = Boolean(
    cobro &&
      (cobro.moneda === "USD" ||
        cobro.imputaciones.some((i) => i.moneda !== cobro.moneda) ||
        cobro.medios.some((m) => m.moneda !== cobro.moneda))
  )
  const total = cobro ? cobro.totalMedios + cobro.totalRetenciones : 0

  return (
    <DetalleDialog
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`${esCobro ? "Cobro" : "Pago"} del ${formatearFechaLarga(cobro?.fecha ?? null)}`}
      subtitulo={cobro?.clienteNombre ?? undefined}
      acciones={
        <Button variant="destructive" onClick={onAnular}>
          <Trash2 className="h-3.5 w-3.5" />
          Anular {esCobro ? "cobro" : "pago"}
        </Button>
      }
    >
      {cobro && (
        <>
          <Bloque titulo="Importes">
            <div className="grid grid-cols-2 gap-2.5">
              <Cifra
                rotulo="Canceló"
                valor={formatearImporte(total, cobro.moneda)}
                pie="Medios + retenciones"
              />
              <Cifra
                rotulo={esCobro ? "Entró a caja" : "Salió de caja"}
                valor={formatearImporte(cobro.totalMedios, cobro.moneda)}
                tono={esCobro ? "success" : "neutral"}
              />
            </div>
          </Bloque>

          <Bloque titulo="Comprobantes cancelados">
            <Lista>
              {cobro.imputaciones.length === 0 ? (
                <Vacio texto="Sin imputar a ningún comprobante." />
              ) : (
                cobro.imputaciones.map((i) => (
                  <Renglon
                    key={i.id}
                    izquierda={
                      <div className="flex items-center gap-2">
                        <Badge tone="neutral" size="sm">
                          {i.clase}
                        </Badge>
                        <span className="num text-[12px] text-ink-secondary">
                          {formatearNumero(i.puntoVenta, i.numero)}
                        </span>
                      </div>
                    }
                    derecha={
                      <div className="text-right">
                        <span className="num text-[12.5px] font-semibold text-ink">
                          {formatearImporte(i.importe, i.moneda)}
                        </span>
                        {/* Con qué dólar se canceló ESTA factura. Sin esto el
                            dato se guarda y desaparece: el recibo dice que
                            canceló USD 671,91 y nadie puede reconstruir de dónde
                            salieron los pesos que entraron al banco. */}
                        {i.moneda !== cobro.moneda && i.tcAplicado !== null && (
                          <p className="num text-[10.5px] text-ink-muted">
                            TC {formatearTc(i.tcAplicado)} ={" "}
                            {formatearImporte(
                              convertir(i.importe, i.moneda, cobro.moneda, i.tcAplicado),
                              cobro.moneda
                            )}
                          </p>
                        )}
                      </div>
                    }
                  />
                ))
              )}
            </Lista>
          </Bloque>

          <Bloque titulo={esCobro ? "Por dónde entró" : "De dónde salió"}>
            <Lista>
              {cobro.medios.length === 0 ? (
                <Vacio texto="No hubo movimiento de plata: se canceló solo con retenciones." />
              ) : (
                cobro.medios.map((m) => (
                  <Renglon
                    key={m.id}
                    izquierda={
                      <>
                        <span className="text-[12.5px] text-ink">{m.cuentaNombre ?? "—"}</span>
                        {m.referencia && (
                          <p className="num truncate text-[11.5px] text-ink-muted">
                            {m.referencia}
                          </p>
                        )}
                      </>
                    }
                    derecha={
                      <span className="num text-[12.5px] font-semibold text-ink">
                        {formatearImporte(m.importe, m.moneda)}
                      </span>
                    }
                  />
                ))
              )}
            </Lista>
          </Bloque>

          {/* Solo las que hubo: son filas, así que una retención que no se
              cargó simplemente no está. */}
          {cobro.retenciones.length > 0 && (
            <Bloque titulo="Retenciones">
              <Lista>
                {cobro.retenciones.map((r, i) => (
                  <Renglon
                    key={r.id ?? i}
                    izquierda={
                      <span className="min-w-0">
                        <span className="block text-[12.5px] text-ink">
                          {etiquetaRetencion(r)}
                        </span>
                        {/* El certificado y la cuenta contable, cuando están:
                            es lo que el proveedor pide y lo que el asiento
                            necesita. */}
                        {(r.numeroCertificado || r.cuentaContableNombre) && (
                          <span className="block truncate text-[11px] text-ink-muted">
                            {[r.numeroCertificado, r.cuentaContableNombre]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </span>
                    }
                    derecha={
                      <span className="num text-[12.5px] font-semibold text-ink">
                        {formatearImporte(r.importe, cobro.moneda)}
                      </span>
                    }
                  />
                ))}
              </Lista>
            </Bloque>
          )}

          <Bloque titulo="Datos">
            <ListaDatos>
              <Dato rotulo="Moneda" valor={cobro.moneda} />
              {/* Antes se mostraba sólo en los recibos en dólares, que es
                  justo el caso donde menos hace falta. El que lo necesita es el
                  recibo en pesos que cancela facturas en dólares: ahí el TC es
                  lo único que explica por qué entraron esos pesos. */}
              <Dato
                rotulo="Tipo de cambio"
                valor={hayConversion ? formatearTc(cobro.tc) : null}
              />
              <Dato
                rotulo="Observaciones"
                valor={cobro.observaciones}
                className="whitespace-pre-wrap"
              />
              <Dato
                rotulo="Cargado el"
                valor={formatearFechaLarga(cobro.createdAt.slice(0, 10))}
              />
            </ListaDatos>
          </Bloque>
        </>
      )}
    </DetalleDialog>
  )
}
