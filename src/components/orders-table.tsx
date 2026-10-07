"use client"

import { Fragment, useCallback, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { claveDe } from "@/lib/admin/query"
import {
  ESTADOS_PEDIDO,
  ESTADO_PEDIDO_LABEL,
  type EstadoPedido,
} from "@/lib/pedidos"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { cn } from "@/lib/utils"
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  History,
  Loader2,
  PackageOpen,
  RefreshCw,
  TriangleAlert,
} from "lucide-react"

interface OrderItem {
  id: string
  code: string
  product_type: string
  quantity: number
  unit_price: number | null
  currency: string | null
  name: string | null
}

interface Order {
  id: string
  sales_order_id: string | null
  status: EstadoPedido
  environment: string
  total_usd: number | null
  error: string | null
  created_at: string
  status_note: string | null
  status_updated_at: string | null
  status_updated_by_nombre: string | null
  items: OrderItem[]
}

/** El color de cada estado. Entregado es la única buena noticia; cancelado se
 *  apaga en gris en vez de rojo, porque no es un problema: es una decisión. El
 *  rojo queda para el error, que sí pide que alguien mire. */
const TONO_ESTADO: Record<EstadoPedido, string> = {
  enviado: "border-brand-300 bg-brand-50 text-brand-700",
  confirmado: "border-warning-line bg-warning-soft text-warning-text",
  entregado: "border-success-line bg-success-soft text-success-text",
  cancelado: "border-line bg-surface-muted text-ink-muted",
  error: "border-danger-line bg-danger-soft text-danger-text",
}

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })

function fmtUsd(n: number | null) {
  if (n === null) return "—"
  return `U$S ${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

const SIN_PEDIDOS: Order[] = []

async function pedirPedidos(): Promise<Order[]> {
  let data: { orders?: Order[]; error?: string }
  try {
    const res = await fetch("/api/orders")
    data = await res.json()
  } catch {
    throw new Error("No se pudieron cargar los pedidos.")
  }
  if (data.error) throw new Error(data.error)
  return data.orders ?? []
}

export function OrdersTable() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Sin ventana de frescura: cada vez que se entra se vuelve a consultar, porque
  // un pedido puede haberse creado desde otra pestaña. La caché solo sirve para
  // mostrar la lista anterior mientras llega la nueva, en vez de la pantalla de
  // carga.
  const query = useQuery({
    queryKey: claveDe("productos", "/api/orders"),
    queryFn: pedirPedidos,
    staleTime: 0,
    retry: false,
  })
  const orders = query.data ?? SIN_PEDIDOS
  const loading = query.isPending
  const error = query.isError ? query.error.message : null

  const { refetch } = query
  const load = useCallback(() => {
    void refetch()
  }, [refetch])

  /*
   * Cambiar el estado, directo y sin confirmación. Lo que cuida de un click
   * errado en el desplegable es el "Deshacer" del aviso, que devuelve el pedido
   * al estado que tenía.
   */
  const [cambiando, setCambiando] = useState<string | null>(null)

  const cambiarEstado = async (order: Order, status: EstadoPedido, deshacible = true) => {
    setCambiando(order.id)
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "No se pudo cambiar el estado")
      const anterior = order.status
      toast.success(
        `${order.sales_order_id ?? "Pedido"}: ${ESTADO_PEDIDO_LABEL[status].toLowerCase()}`,
        deshacible
          ? {
              action: {
                label: "Deshacer",
                onClick: () => void cambiarEstado({ ...order, status }, anterior, false),
              },
            }
          : undefined
      )
      await refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar el estado")
    } finally {
      setCambiando(null)
    }
  }

  const elegirEstado = (order: Order, status: EstadoPedido) => {
    if (status === order.status) return
    void cambiarEstado(order, status)
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (loading) return <LoadingState label="Cargando pedidos…" />

  if (error) {
    return (
      <div className="panel">
        <ErrorState message={error} onRetry={load} />
      </div>
    )
  }

  const hasQa = orders.some((o) => o.environment === "qa")

  return (
    <div className="space-y-4">
      {hasQa && (
        <div className="flex gap-3 rounded-xl border border-warning-line bg-warning-soft p-4">
          <TriangleAlert className="mt-px h-4 w-4 shrink-0 text-warning-text" />
          <p className="text-[12px] leading-relaxed text-warning-text">
            <span className="font-semibold">Hay pedidos de homologación (QA).</span> No
            llegaron al depósito de Distecna: no se facturan ni descuentan stock real. Están
            marcados con la etiqueta <span className="font-semibold">QA</span>.
          </p>
        </div>
      )}

      <div className="panel overflow-hidden">
        <div className="panel-header">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink">
              {orders.length} {orders.length === 1 ? "pedido" : "pedidos"}
            </p>
            <p className="mt-1 text-[11.5px] text-ink-muted">
              Distecna no informa el estado de los pedidos: lo actualizamos nosotros desde la columna Estado
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={query.isFetching}>
            <RefreshCw className={cn(query.isFetching && "animate-spin")} />
            Actualizar
          </Button>
        </div>

        {orders.length === 0 ? (
          <EmptyState
            icon={PackageOpen}
            title="Todavía no generaste pedidos"
            description="Seleccioná productos en Nuestros Productos y generá el pedido desde ahí."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-9" />
                  <TableHead className="min-w-[180px]">N° de pedido</TableHead>
                  <TableHead className="w-[150px]">Estado</TableHead>
                  <TableHead className="hidden w-[100px] sm:table-cell">Ítems</TableHead>
                  <TableHead className="w-[140px] text-right">Total</TableHead>
                  <TableHead className="hidden w-[150px] md:table-cell">Fecha</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {orders.map((order) => {
                  const isOpen = expanded.has(order.id)
                  const units = order.items.reduce((a, i) => a + i.quantity, 0)
                  const cancelado = order.status === "cancelado"

                  return (
                    <Fragment key={order.id}>
                      <TableRow
                        onClick={() => toggle(order.id)}
                        className={cn("cursor-pointer", isOpen && "bg-surface-subtle")}
                      >
                        <TableCell className="text-center">
                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 text-ink-faint transition-transform duration-200",
                              isOpen && "rotate-90 text-ink-muted"
                            )}
                          />
                        </TableCell>

                        <TableCell>
                          <span
                            className={cn(
                              "font-mono text-[12.5px] font-semibold",
                              cancelado ? "text-ink-muted" : "text-ink"
                            )}
                          >
                            {order.sales_order_id ?? "—"}
                          </span>
                          {order.environment === "qa" && (
                            <Badge tone="warning" size="sm" className="ml-2">
                              QA
                            </Badge>
                          )}
                        </TableCell>

                        {/* El click en el estado no despliega la fila: es otra acción. */}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {order.status === "error" ? (
                            <Badge tone="danger" size="sm">Error</Badge>
                          ) : (
                            <div className="relative inline-flex items-center">
                              <select
                                value={order.status}
                                onChange={(e) => elegirEstado(order, e.target.value as EstadoPedido)}
                                disabled={cambiando === order.id}
                                aria-label={`Estado del pedido ${order.sales_order_id ?? ""}`}
                                title="Cambiar el estado del pedido"
                                className={cn(
                                  "h-7 cursor-pointer appearance-none rounded-full border py-0 pl-2.5 pr-7 text-[11.5px] font-semibold transition-colors",
                                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-wait disabled:opacity-60",
                                  TONO_ESTADO[order.status]
                                )}
                              >
                                {ESTADOS_PEDIDO.map((e) => (
                                  <option key={e} value={e}>
                                    {ESTADO_PEDIDO_LABEL[e]}
                                  </option>
                                ))}
                              </select>
                              {cambiando === order.id ? (
                                <Loader2 className="pointer-events-none absolute right-2 h-3 w-3 animate-spin opacity-70" />
                              ) : (
                                <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 opacity-70" />
                              )}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="num hidden text-[12px] text-ink-muted sm:table-cell">
                          {order.items.length} / {units} u.
                        </TableCell>

                        <TableCell
                          className={cn(
                            "num text-right font-mono text-[12.5px] font-semibold",
                            cancelado ? "text-ink-faint line-through" : "text-ink"
                          )}
                        >
                          {fmtUsd(order.total_usd)}
                        </TableCell>

                        <TableCell className="hidden text-[11.5px] text-ink-muted md:table-cell">
                          {fechaHora(order.created_at)}
                        </TableCell>
                      </TableRow>

                      {isOpen && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={6} className="bg-surface-subtle p-0">
                            <div className="space-y-3 px-5 py-4 sm:px-8">
                              {order.status_updated_at && (
                                <div className="flex gap-2.5 text-[12px] leading-relaxed text-ink-secondary">
                                  <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" />
                                  <div>
                                    <p>
                                      <span className="font-semibold text-ink">
                                        {ESTADO_PEDIDO_LABEL[order.status]}
                                      </span>{" "}
                                      por {order.status_updated_by_nombre ?? "alguien"} el{" "}
                                      {fechaHora(order.status_updated_at)}
                                    </p>
                                    {order.status_note && (
                                      <p className="mt-0.5 text-ink-muted">“{order.status_note}”</p>
                                    )}
                                  </div>
                                </div>
                              )}

                              {order.error && (
                                <div className="flex gap-2.5 rounded-lg border border-danger-line bg-danger-soft p-3">
                                  <AlertCircle className="mt-px h-4 w-4 shrink-0 text-danger-text" />
                                  <p className="text-[12px] leading-relaxed text-danger-text">
                                    {order.error}
                                  </p>
                                </div>
                              )}

                              {order.items.length > 0 && (
                                <div className="overflow-hidden rounded-lg border border-line bg-surface">
                                  {order.items.map((item, i) => (
                                    <div
                                      key={item.id}
                                      className={cn(
                                        "flex items-start justify-between gap-3 p-3",
                                        i > 0 && "border-t border-line-soft"
                                      )}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-[12.5px] font-medium leading-tight text-ink">
                                          {item.name || item.code}
                                        </p>
                                        <p className="mt-1 font-mono text-[10.5px] text-ink-muted">
                                          {item.code} · {item.product_type}
                                        </p>
                                      </div>
                                      <div className="shrink-0 text-right">
                                        <p className="num font-mono text-[12.5px] font-semibold text-ink">
                                          {fmtUsd(
                                            item.unit_price !== null
                                              ? item.unit_price * item.quantity
                                              : null
                                          )}
                                        </p>
                                        <p className="num mt-1 text-[10.5px] text-ink-muted">
                                          {item.quantity} × {fmtUsd(item.unit_price)}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
