"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MapPin,
  ShoppingCart,
  TriangleAlert,
  X,
} from "lucide-react"

export interface OrderDraftItem {
  code: string
  name: string | null
  quantity: number
  price: number
  currency: string
}

export interface PaymentTerm {
  id: string
  code: string
  name: string
}

export interface DeliveryAddress {
  id: string
  name: string
  street: string
  number: string
  jurisdiction: string
  postalCode: string
}

interface Props {
  items: OrderDraftItem[]
  paymentTerm: PaymentTerm | null
  addresses: DeliveryAddress[]
  environment: string | null
  onClose: () => void
  onSuccess: () => void
}

function fmtUsd(n: number) {
  return `U$S ${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function OrderDialog({
  items,
  paymentTerm,
  addresses,
  environment,
  onClose,
  onSuccess,
}: Props) {
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ salesOrderId: string; warning?: string } | null>(
    null
  )

  const total = items.reduce((acc, i) => acc + i.price * i.quantity, 0)
  const units = items.reduce((acc, i) => acc + i.quantity, 0)
  const isQa = environment === "qa"

  // Cerrar con Escape, salvo mientras se esta enviando el pedido.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, submitting])

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ code: i.code, quantity: i.quantity })),
          paymentTermId: paymentTerm?.id ?? null,
          deliveryAddressId: addressId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear el pedido.")
        return
      }
      setResult({ salesOrderId: data.salesOrderId, warning: data.warning })
      onSuccess()
    } catch {
      setError("No se pudo conectar con el servidor.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={() => !submitting && onClose()}
      />

      <div className="relative w-full sm:max-w-lg max-h-[92vh] sm:max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <ShoppingCart className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">
                {result ? "Pedido generado" : "Confirmar pedido"}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {items.length} {items.length === 1 ? "producto" : "productos"} · {units}{" "}
                {units === 1 ? "unidad" : "unidades"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors shrink-0"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-4">
          {result ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center text-center gap-3 py-4">
                <div className="h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Número de pedido
                  </p>
                  <p className="mt-1 text-xl font-bold font-mono tracking-tight">
                    {result.salesOrderId}
                  </p>
                </div>
              </div>

              {result.warning && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2.5">
                  <TriangleAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-900 leading-relaxed">
                    {result.warning}
                  </p>
                </div>
              )}

              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Distecna no expone un endpoint para consultar el estado de un pedido, así
                  que este número es todo lo que devuelve. El seguimiento sale de su portal.
                </p>
              </div>
            </div>
          ) : (
            <>
              {isQa && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2.5">
                  <TriangleAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 leading-relaxed">
                    <span className="font-semibold">Entorno de homologación (QA).</span>{" "}
                    Este pedido no llega al depósito de Distecna: no se factura, no se paga
                    y no descuenta stock real.
                  </div>
                </div>
              )}

              {/* Items */}
              <div className="rounded-lg border divide-y overflow-hidden">
                {items.map((i) => (
                  <div key={i.code} className="p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight truncate">
                        {i.name || i.code}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                        {i.code}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {fmtUsd(i.price * i.quantity)}
                      </p>
                      <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                        {i.quantity} × {fmtUsd(i.price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Dirección */}
              {addresses.length > 0 && (
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" />
                    Dirección de entrega
                  </label>
                  {addresses.length === 1 ? (
                    <p className="mt-1.5 text-sm">{addresses[0].name}</p>
                  ) : (
                    <select
                      value={addressId}
                      onChange={(e) => setAddressId(e.target.value)}
                      className="mt-1.5 w-full h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {addresses.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Condición de pago */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Condición de pago
                </p>
                <p className="mt-1.5 text-sm">
                  {paymentTerm ? (
                    paymentTerm.name.trim()
                  ) : (
                    <span className="text-muted-foreground">
                      Default de la cuenta
                    </span>
                  )}
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex gap-2.5">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive leading-relaxed">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-5 sm:px-6 py-4 shrink-0 bg-muted/20 rounded-b-2xl">
          {result ? (
            <Button onClick={onClose} className="w-full h-10">
              Listo
            </Button>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Total estimado
                </span>
                <span className="text-lg font-bold tracking-tight tabular-nums">
                  {fmtUsd(total)}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
                Calculado con el costo de nuestro catálogo. Distecna factura con su precio
                al momento del pedido.
              </p>
              <div className="flex flex-col-reverse sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={submitting}
                  className="flex-1 h-10"
                >
                  Cancelar
                </Button>
                <Button onClick={submit} disabled={submitting} className="flex-1 h-10 gap-2">
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-4 w-4" />
                      Generar pedido
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
