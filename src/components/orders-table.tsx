"use client"

import { Fragment, useCallback, useEffect, useState } from "react"
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
  ChevronRight,
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
  status: string
  environment: string
  total_usd: number | null
  error: string | null
  created_at: string
  items: OrderItem[]
}

function fmtUsd(n: number | null) {
  if (n === null) return "—"
  return `U$S ${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function OrdersTable() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/orders")
      const data = await res.json()
      if (data.error) setError(data.error)
      else setOrders(data.orders ?? [])
    } catch {
      setError("No se pudieron cargar los pedidos.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

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
              La API de Distecna no expone estado de pedido — este es nuestro registro
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw />
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
                  <TableHead className="w-[110px]">Estado</TableHead>
                  <TableHead className="hidden w-[100px] sm:table-cell">Ítems</TableHead>
                  <TableHead className="w-[140px] text-right">Total</TableHead>
                  <TableHead className="hidden w-[150px] md:table-cell">Fecha</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {orders.map((order) => {
                  const isOpen = expanded.has(order.id)
                  const units = order.items.reduce((a, i) => a + i.quantity, 0)

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
                          <span className="font-mono text-[12.5px] font-semibold text-ink">
                            {order.sales_order_id ?? "—"}
                          </span>
                          {order.environment === "qa" && (
                            <Badge tone="warning" size="sm" className="ml-2">
                              QA
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell>
                          {order.status === "error" ? (
                            <Badge tone="danger" size="sm">Error</Badge>
                          ) : (
                            <Badge tone="success" size="sm">Enviado</Badge>
                          )}
                        </TableCell>

                        <TableCell className="num hidden text-[12px] text-ink-muted sm:table-cell">
                          {order.items.length} / {units} u.
                        </TableCell>

                        <TableCell className="num text-right font-mono text-[12.5px] font-semibold text-ink">
                          {fmtUsd(order.total_usd)}
                        </TableCell>

                        <TableCell className="hidden text-[11.5px] text-ink-muted md:table-cell">
                          {new Date(order.created_at).toLocaleString("es-AR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </TableCell>
                      </TableRow>

                      {isOpen && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={6} className="bg-surface-subtle p-0">
                            <div className="space-y-3 px-5 py-4 sm:px-8">
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
