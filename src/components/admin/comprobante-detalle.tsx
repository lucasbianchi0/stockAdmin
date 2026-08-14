"use client"

import { useCallback, useEffect, useState } from "react"
import { Pencil } from "lucide-react"

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
import { SemaforoVencimiento } from "@/components/admin/semaforo-vencimiento"
import { AdjuntosPanel } from "@/components/admin/adjuntos-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ALICUOTA_LABEL,
  buscarClase,
  estadoDeSaldo,
  etiquetaSaldo,
  formatearNumero,
  type Comprobante,
  type TipoComprobante,
  ESTADO_LABEL,
  ESTADO_TONO,
} from "@/lib/admin/comprobantes"
import type { ComprobanteDetalle as Datos } from "@/lib/admin/detalle"
import { formatearFecha, formatearFechaLarga } from "@/lib/admin/fecha"
import { formatearContravalor, formatearImporte, formatearTc } from "@/lib/admin/moneda"
import { cn } from "@/lib/utils"

/**
 * Una factura abierta desde la tabla.
 *
 * Contesta las dos preguntas que la fila no puede: **cómo se compone el total**
 * —el desglose impositivo, que es lo que se controla contra el papel— y **quién
 * la cobró**, con qué recibo y por qué cuenta entró la plata. Lo segundo es lo
 * que hoy obliga a ir hasta la pantalla de cobros a buscar a mano.
 */
export function ComprobanteDetalle({
  abierto,
  tipo,
  comprobanteId,
  onCerrar,
  onEditar,
}: {
  abierto: boolean
  tipo: TipoComprobante
  comprobanteId: string | null
  onCerrar: () => void
  onEditar: (c: Comprobante) => void
}) {
  const recurso = tipo === "compra" ? "compras" : "ventas"

  const [datos, setDatos] = useState<Datos | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!comprobanteId) return
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/${recurso}/${comprobanteId}/detalle`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el comprobante")
      setDatos(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el comprobante")
    } finally {
      setCargando(false)
    }
  }, [comprobanteId, recurso])

  useEffect(() => {
    if (abierto) cargar()
    else setDatos(null)
  }, [abierto, cargar])

  const c = datos?.comprobante
  const esCompra = tipo === "compra"
  const clase = c ? buscarClase(c.tipo, c.clase) : undefined
  const esNota = clase?.signo === -1
  const estado = c ? estadoDeSaldo(c.total, c.saldo) : "pendiente"

  return (
    <DetalleDialog
      abierto={abierto}
      onCerrar={onCerrar}
      cargando={cargando}
      error={error}
      titulo={c ? `${clase?.nombre ?? c.clase} ${formatearNumero(c.puntoVenta, c.numero)}` : "Comprobante"}
      subtitulo={
        c ? `${c.clienteNombre ?? c.proveedorNombre ?? "Sin ficha"} · ${formatearFechaLarga(c.fecha)}` : undefined
      }
      badges={
        c && (
          <>
            {/* El estado primero: si es un borrador, todo lo demás que dice este
                panel —el saldo, lo que falta cobrar— todavía no cuenta para
                nada, y esa es la información más importante de la pantalla. */}
            {c.estado !== "confirmado" && (
              <Badge tone={ESTADO_TONO[c.estado]} size="sm">
                {ESTADO_LABEL[c.estado]}
              </Badge>
            )}
            <Badge
              tone={estado === "saldado" ? "success" : esNota ? "warning" : "neutral"}
              size="sm"
            >
              {esNota ? "Ajusta deuda" : etiquetaSaldo(estado, c.tipo)}
            </Badge>
          </>
        )
      }
      acciones={
        c && (
          <Button onClick={() => onEditar(c)}>
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Button>
        )
      }
    >
      {datos && c && (
        <>
          <Bloque titulo="Situación">
            <div className="grid grid-cols-2 gap-2.5">
              <Cifra
                rotulo="Total"
                valor={`${esNota ? "−" : ""}${formatearImporte(c.total, c.moneda)}`}
                pie={
                  c.moneda === "USD"
                    ? `${formatearImporte(c.totalArs, "ARS")} · TC ${formatearTc(c.tc)}`
                    : formatearContravalor(c.totalUsd, "USD")
                }
              />
              <Cifra
                rotulo={esCompra ? "Falta pagar" : "Falta cobrar"}
                valor={formatearImporte(c.saldo, c.moneda)}
                tono={estado === "saldado" ? "success" : "danger"}
                pie={
                  c.imputado > 0
                    ? `${esCompra ? "Pagado" : "Cobrado"} ${formatearImporte(c.imputado, c.moneda)}`
                    : undefined
                }
              />
            </div>

            {/* El vencimiento solo cuando queda algo por cobrar: una factura
                saldada hace dos meses no está "vencida hace 60 días", está
                cerrada, y teñirla de rojo es ruido. */}
            {c.fechaVencimiento && estado !== "saldado" && (
              <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-line bg-surface-subtle px-3.5 py-2">
                <SemaforoVencimiento fecha={c.fechaVencimiento} />
                <span className="num text-[11.5px] text-ink-muted">
                  {formatearFecha(c.fechaVencimiento)}
                </span>
              </div>
            )}
          </Bloque>

          <Bloque titulo="Composición del total">
            <div className="overflow-hidden rounded-lg border border-line">
              <Importe rotulo="Neto gravado" valor={c.netoGravado} moneda={c.moneda} />
              <Importe
                rotulo={`IVA${
                  c.alicuotaIva !== null ? ` ${ALICUOTA_LABEL[String(c.alicuotaIva)] ?? ""}` : ""
                }`}
                valor={c.iva}
                moneda={c.moneda}
              />
              <Importe rotulo="No gravado" valor={c.noGravado} moneda={c.moneda} />
              <Importe rotulo="Exento" valor={c.exento} moneda={c.moneda} />
              <Importe rotulo="Percepción IVA" valor={c.percepcionIva} moneda={c.moneda} />
              <Importe rotulo="Percepción IIBB" valor={c.percepcionIibb} moneda={c.moneda} />
              <Importe rotulo="Otros impuestos" valor={c.otrosImpuestos} moneda={c.moneda} />
              <Importe rotulo="Total" valor={c.total} moneda={c.moneda} destacado />
            </div>
          </Bloque>

          {/* Los archivos van arriba de los datos: cuando alguien abre un
              comprobante para verificar algo, lo que quiere es mirar el papel. */}
          <Bloque titulo="Archivos">
            <AdjuntosPanel comprobanteId={c.id} />
          </Bloque>

          <Bloque titulo="Datos del comprobante">
            <ListaDatos>
              <Dato rotulo="Fecha" valor={formatearFechaLarga(c.fecha)} />
              <Dato
                rotulo="Vencimiento"
                valor={c.fechaVencimiento ? formatearFechaLarga(c.fechaVencimiento) : null}
              />
              <Dato
                rotulo="Pago estimado"
                valor={c.fechaEstimadaPago ? formatearFechaLarga(c.fechaEstimadaPago) : null}
              />
              <Dato rotulo="Condición" valor={c.condicionPago} />
              <Dato rotulo="Detalle" valor={c.detalle} className="whitespace-pre-wrap" />
              <Dato rotulo="Cuenta contable" valor={c.cuentaContableNombre} />
              <Dato rotulo="Vendedor" valor={c.vendedorNombre} />
              <Dato
                rotulo="Observaciones"
                valor={c.observaciones}
                className="whitespace-pre-wrap"
              />
              <Dato rotulo="Cargado el" valor={formatearFechaLarga(c.createdAt.slice(0, 10))} />
            </ListaDatos>
          </Bloque>

          <Bloque titulo={esCompra ? "Pagos imputados" : "Cobros imputados"}>
            <Lista>
              {datos.imputaciones.length === 0 ? (
                <Vacio
                  texto={
                    esCompra ? "Todavía no se pagó nada de este comprobante." : "Todavía no se cobró nada de esta factura."
                  }
                />
              ) : (
                datos.imputaciones.map((i) => (
                  <Renglon
                    key={i.id}
                    izquierda={
                      <>
                        <span className="num text-[12.5px] text-ink">
                          {formatearFecha(i.fecha)}
                        </span>
                        <p className="truncate text-[11.5px] text-ink-muted">
                          {i.cuentas.length > 0 ? i.cuentas.join(" · ") : "Solo retenciones"}
                          {i.referencias.length > 0 && ` · ${i.referencias.join(" · ")}`}
                        </p>
                      </>
                    }
                    derecha={
                      <span className="num text-[12.5px] font-semibold text-ink">
                        {formatearImporte(i.importe, c.moneda)}
                      </span>
                    }
                  />
                ))
              )}
            </Lista>
          </Bloque>
        </>
      )}
    </DetalleDialog>
  )
}

/**
 * Un renglón del desglose. Los ceros no se dibujan salvo el total: una factura
 * sin percepciones no necesita tres renglones diciendo "$ 0,00", y esconderlos
 * hace que cuando aparecen se noten.
 */
function Importe({
  rotulo,
  valor,
  moneda,
  destacado = false,
}: {
  rotulo: string
  valor: number
  moneda: "ARS" | "USD"
  destacado?: boolean
}) {
  if (valor === 0 && !destacado) return null

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-line-soft px-3.5 py-2 last:border-b-0",
        destacado && "bg-surface-subtle"
      )}
    >
      <span className={cn("text-[12.5px]", destacado ? "font-semibold text-ink" : "text-ink-muted")}>
        {rotulo}
      </span>
      <span
        className={cn(
          "num text-[12.5px]",
          destacado ? "font-bold text-ink" : "font-medium text-ink-secondary"
        )}
      >
        {formatearImporte(valor, moneda)}
      </span>
    </div>
  )
}
