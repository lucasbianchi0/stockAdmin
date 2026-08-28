"use client"

import { useCallback, useState } from "react"
import { Eye, HandCoins, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { PagoDialog } from "@/components/admin/pago-dialog"
import { PagoDetalle } from "@/components/admin/pago-detalle"
import { ConfirmarDialog } from "@/components/admin/confirmar-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Paginacion } from "@/components/ui/paginacion"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatearNumero } from "@/lib/admin/comprobantes"
import type { Cobro } from "@/lib/admin/cobros"
import type { TipoPago } from "@/lib/admin/cobros-server"
import { formatearFecha } from "@/lib/admin/fecha"
import { formatearImporte } from "@/lib/admin/moneda"
import { useTablaAdmin } from "@/lib/admin/use-tabla"
import { cn } from "@/lib/utils"

/**
 * Listado de cobros.
 *
 * No hay edición: un recibo se anula y se vuelve a cargar. Cambiar uno ya
 * imputado significa recalcular saldos de varias facturas y mover plata entre
 * cuentas, y hacerlo por partes deja estados intermedios inconsistentes — el
 * momento en que la factura ya está descancelada pero la plata todavía figura
 * en el banco.
 */
export function PagosClient({ tipo }: { tipo: TipoPago }) {
  const esCobro = tipo === "cobro"
  const recurso = esCobro ? "cobros" : "pagos"
  const rotuloEntidad = esCobro ? "Cliente" : "Proveedor"

  /**
   * El listado de cobros va sin el desglose; el de pagos lo conserva.
   *
   * Es el punto 3.C del pliego: «que sólo figure para ingresar el cobro, no el
   * detalle que después lo vemos en otro módulo». Qué facturas cancela y por qué
   * cuenta entró la plata se ven en el detalle del recibo —que se abre haciendo
   * clic en la fila— y en el estado de cuenta del cliente, así que acá eran dos
   * columnas anchas que empujaban el importe fuera de la vista para repetir algo
   * que ya está en otro lado.
   *
   * En pagos se dejan: la pregunta que se le hace a esa pantalla es «de qué
   * cuenta salió esto», y ahí el desglose es el dato, no el ruido.
   */
  const conDesglose = !esCobro

  const tabla = useTablaAdmin<Cobro>({
    endpoint: `/api/admin/${recurso}`,
    clave: recurso,
  })

  const [nuevo, setNuevo] = useState(false)
  const [editando, setEditando] = useState<Cobro | null>(null)
  const [ver, setVer] = useState<Cobro | null>(null)
  const [aAnular, setAAnular] = useState<Cobro | null>(null)
  const [anulando, setAnulando] = useState(false)

  const { recargar } = tabla

  const alGuardar = useCallback(() => {
    setNuevo(false)
    toast.success(esCobro ? "Cobro registrado" : "Pago registrado")
    recargar()
  }, [recargar, esCobro])

  const anular = async () => {
    if (!aAnular) return
    setAnulando(true)
    try {
      const res = await fetch(`/api/admin/${recurso}/${aAnular.id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo anular")
      toast.success(
        `${esCobro ? "Cobro" : "Pago"} anulado — los comprobantes volvieron a quedar pendientes`
      )
      setAAnular(null)
      setVer(null)
      recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo anular")
    } finally {
      setAnulando(false)
    }
  }

  return (
    <>
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-subtle px-4 py-3">
          <p className="text-[12.5px] text-ink-muted">
            {esCobro
              ? "Los cobros recibidos. El desglose de cada uno está en su detalle"
              : "Órdenes de pago con su imputación y las cuentas de donde salió la plata"}
          </p>
          <Button onClick={() => setNuevo(true)}>
            <Plus className="h-3.5 w-3.5" />
            Nuevo {tipo}
          </Button>
        </div>

        {tabla.cargandoInicial ? (
          <LoadingState label={`Cargando ${recurso}…`} />
        ) : tabla.error ? (
          <ErrorState message={tabla.error} onRetry={tabla.recargar} />
        ) : (
          <>
            <div
              className={cn(
                "transition-opacity duration-150",
                tabla.cargando && "pointer-events-none opacity-55"
              )}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>{rotuloEntidad}</TableHead>
                    {conDesglose && (
                      <>
                        <TableHead>Cancela</TableHead>
                        <TableHead>Salió de</TableHead>
                      </>
                    )}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-[86px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tabla.filas.length > 0 ? (
                    tabla.filas.map((c) => (
                      <TableRow
                        key={c.id}
                        onClick={() => setVer(c)}
                        className="cursor-pointer"
                      >
                        <TableCell className="num whitespace-nowrap text-ink-secondary">
                          {formatearFecha(c.fecha)}
                        </TableCell>

                        <TableCell className="font-medium text-ink">
                          {c.clienteNombre ?? "—"}
                        </TableCell>

                        {/* Dos comprobantes y el resto contado. Un recibo que
                            cancela quince facturas hacía una fila de tres
                            renglones de chips que empujaba la plata fuera de
                            la vista; el desglose completo está en el detalle. */}
                        {conDesglose && (
                        <>
                        <TableCell>
                          {c.imputaciones.length === 0 ? (
                            <span className="text-ink-faint">—</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1">
                              {c.imputaciones.slice(0, 2).map((i) => (
                                <Badge key={i.id} tone="neutral" size="sm">
                                  {i.clase} {formatearNumero(i.puntoVenta, i.numero)}
                                </Badge>
                              ))}
                              {c.imputaciones.length > 2 && (
                                <span className="text-[11px] text-ink-muted">
                                  +{c.imputaciones.length - 2}
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-ink-secondary">
                          {c.medios.length === 0 ? (
                            <span className="text-ink-faint">Solo retenciones</span>
                          ) : (
                            <div className="min-w-0">
                              <p className="truncate text-[12px]">{c.medios[0].cuentaNombre}</p>
                              {c.medios.length > 1 ? (
                                <span className="text-[11px] text-ink-muted">
                                  y {c.medios.length - 1} cuenta
                                  {c.medios.length - 1 !== 1 ? "s" : ""} más
                                </span>
                              ) : (
                                c.medios[0].referencia && (
                                  <span className="num block truncate text-[11px] text-ink-muted">
                                    {c.medios[0].referencia}
                                  </span>
                                )
                              )}
                            </div>
                          )}
                        </TableCell>
                        </>
                        )}

                        {/* Total es lo que canceló, no lo que entró a la caja.
                            Cuando hay retención los dos números no coinciden, y
                            el que importa contra la factura es este. */}
                        <TableCell className="text-right">
                          <span className="num block font-semibold text-ink">
                            {formatearImporte(c.totalMedios + c.totalRetenciones, c.moneda)}
                          </span>
                          {c.totalRetenciones > 0 && (
                            <span className="num block text-[11px] text-ink-muted">
                              incl. {formatearImporte(c.totalRetenciones, c.moneda)} de ret.
                            </span>
                          )}
                        </TableCell>

                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setVer(c)}
                              aria-label="Ver detalle"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {/* Editar en vez de anular y rehacer. Reemplaza las
                                imputaciones, las retenciones y los movimientos
                                del recibo conservando su id, así los enlaces
                                desde el extracto del banco siguen sirviendo. */}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setEditando(c)}
                              aria-label="Editar"
                              title={`Editar el ${tipo}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setAAnular(c)}
                              aria-label="Anular"
                              title={`Anular el ${tipo}`}
                              className="text-ink-faint hover:bg-danger-soft hover:text-danger-text"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={conDesglose ? 6 : 4} className="p-0">
                        <EmptyState
                          icon={HandCoins}
                          title={`Todavía no hay ${recurso}`}
                          description={
                            esCobro
                              ? "Registrá el primer cobro para empezar a cancelar facturas."
                              : "Registrá el primer pago para empezar a cancelar comprobantes."
                          }
                          action={
                            <Button onClick={() => setNuevo(true)}>
                              <Plus className="h-3.5 w-3.5" />
                              Nuevo {tipo}
                            </Button>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <Paginacion
              pagina={tabla.pagina}
              totalPaginas={tabla.totalPaginas}
              total={tabla.total}
              porPagina={tabla.porPagina}
              cargando={tabla.cargando}
              onIr={tabla.irA}
            />
          </>
        )}
      </div>

      <PagoDetalle
        abierto={ver !== null}
        tipo={tipo}
        cobro={ver}
        onCerrar={() => setVer(null)}
        onAnular={() => ver && setAAnular(ver)}
      />

      <PagoDialog
        tipo={tipo}
        abierto={nuevo || editando !== null}
        cobro={editando}
        onCerrar={() => {
          setNuevo(false)
          setEditando(null)
        }}
        onGuardado={() => {
          setEditando(null)
          alGuardar()
        }}
      />

      <ConfirmarDialog
        abierto={aAnular !== null}
        titulo={`¿Anular este ${tipo}?`}
        descripcion={
          <>
            Los comprobantes que cancelaba vuelven a quedar pendientes y el movimiento
            se saca de la cuenta. No se puede deshacer, pero podés volver a cargarlo.
          </>
        }
        confirmar={`Anular ${tipo}`}
        trabajando={anulando}
        onCerrar={() => setAAnular(null)}
        onConfirmar={anular}
      />
    </>
  )
}
