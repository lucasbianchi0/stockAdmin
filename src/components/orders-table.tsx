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
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
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

function StatusBadge({ status }: { status: string }) {
  if (status === "error")
    return (
      <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
        Error
      </span>
    )
  return (
    <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
      Enviado
    </span>
  )
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-destructive font-medium text-sm">{error}</p>
        <Button variant="outline" onClick={load}>
          Reintentar
        </Button>
      </div>
    )
  }

  const hasQa = orders.some((o) => o.environment === "qa")

  return (
    <div className="space-y-4">
      {hasQa && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
          <TriangleAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <span className="font-semibold">Hay pedidos de homologación (QA).</span> No
            llegaron al depósito de Distecna: no se facturan ni descuentan stock real.
            Están marcados con la etiqueta <span className="font-semibold">QA</span>.
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b bg-muted/20 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              {orders.length} {orders.length === 1 ? "pedido" : "pedidos"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              La API de Distecna no expone estado de pedido — este es nuestro registro
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            className="h-8 gap-1.5 text-xs shrink-0"
          >
            <RefreshCw className="h-3 w-3" />
            Actualizar
          </Button>
        </div>

        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
            <PackageOpen className="h-10 w-10 opacity-20" />
            <p className="font-medium text-sm">Todavía no generaste pedidos</p>
            <p className="text-xs">
              Seleccioná productos en Nuestros Productos y generá el pedido desde ahí.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b">
                  <TableHead className="w-8" />
                  <TableHead className="min-w-[180px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3">
                    N° de pedido
                  </TableHead>
                  <TableHead className="w-[110px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3">
                    Estado
                  </TableHead>
                  <TableHead className="w-[90px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3 hidden sm:table-cell">
                    Ítems
                  </TableHead>
                  <TableHead className="w-[130px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3">
                    Total
                  </TableHead>
                  <TableHead className="w-[150px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3 hidden md:table-cell">
                    Fecha
                  </TableHead>
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
                        className="cursor-pointer hover:bg-primary/[0.03] transition-colors border-b border-border/60"
                      >
                        <TableCell className="py-3 text-center text-muted-foreground">
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="font-mono text-sm font-semibold">
                            {order.sales_order_id ?? "—"}
                          </span>
                          {order.environment === "qa" && (
                            <span className="ml-2 inline-flex items-center rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 font-semibold text-[10px] uppercase tracking-wide">
                              QA
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <StatusBadge status={order.status} />
                        </TableCell>
                        <TableCell className="py-3 text-sm text-muted-foreground hidden sm:table-cell tabular-nums">
                          {order.items.length} / {units} u.
                        </TableCell>
                        <TableCell className="py-3 text-sm font-semibold tabular-nums">
                          {fmtUsd(order.total_usd)}
                        </TableCell>
                        <TableCell className="py-3 text-xs text-muted-foreground hidden md:table-cell">
                          {new Date(order.created_at).toLocaleString("es-AR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </TableCell>
                      </TableRow>

                      {isOpen && (
                        <TableRow className="bg-muted/20">
                          <TableCell colSpan={6} className="py-0">
                            <div className="px-4 sm:px-6 py-4 space-y-3">
                              {order.error && (
                                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex gap-2.5">
                                  <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                                  <p className="text-xs text-destructive leading-relaxed">
                                    {order.error}
                                  </p>
                                </div>
                              )}
                              {order.items.length > 0 && (
                                <div className="rounded-lg border bg-card divide-y overflow-hidden">
                                  {order.items.map((item) => (
                                    <div
                                      key={item.id}
                                      className="p-3 flex items-start justify-between gap-3"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium leading-tight truncate">
                                          {item.name || item.code}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                          {item.code} · {item.product_type}
                                        </p>
                                      </div>
                                      <div className="text-right shrink-0">
                                        <p className="text-sm font-semibold tabular-nums">
                                          {fmtUsd(
                                            item.unit_price !== null
                                              ? item.unit_price * item.quantity
                                              : null
                                          )}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
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
