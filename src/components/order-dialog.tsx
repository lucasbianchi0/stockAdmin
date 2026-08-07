"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
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

/** Aviso con ícono. Los tres estados (QA, warning, error) compartían markup casi
 *  idéntico repetido cuatro veces en el archivo. */
function Aviso({
  tone,
  children,
}: {
  tone: "warning" | "danger"
  children: React.ReactNode
}) {
  const Icon = tone === "warning" ? TriangleAlert : AlertCircle
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-lg border p-3",
        tone === "warning"
          ? "border-warning-line bg-warning-soft text-warning-text"
          : "border-danger-line bg-danger-soft text-danger-text"
      )}
    >
      <Icon className="mt-px h-4 w-4 shrink-0" />
      <div className="text-[12px] leading-relaxed">{children}</div>
    </div>
  )
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={() => !submitting && onClose()}
      />

      <div className="relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-6 fade-in-0 duration-250 sm:max-h-[85vh] sm:max-w-lg sm:rounded-2xl sm:zoom-in-95 sm:slide-in-from-bottom-0">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                result ? "bg-success-soft text-success-text" : "bg-brand-50 text-brand-600"
              )}
            >
              {result ? (
                <CheckCircle2 className="h-[18px] w-[18px]" strokeWidth={2} />
              ) : (
                <ShoppingCart className="h-[18px] w-[18px]" strokeWidth={1.9} />
              )}
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
                {result ? "Pedido generado" : "Confirmar pedido"}
              </h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                {items.length} {items.length === 1 ? "producto" : "productos"} · {units}{" "}
                {units === 1 ? "unidad" : "unidades"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          {result ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface-subtle py-6 text-center">
                <p className="eyebrow">Número de pedido</p>
                <p className="num font-mono text-[24px] font-bold leading-none text-ink">
                  {result.salesOrderId}
                </p>
              </div>

              {result.warning && <Aviso tone="warning">{result.warning}</Aviso>}

              <p className="rounded-lg border border-line bg-surface-subtle p-3 text-[12px] leading-relaxed text-ink-muted">
                Distecna no expone un endpoint para consultar el estado de un pedido, así que
                este número es todo lo que devuelve. El seguimiento sale de su portal.
              </p>
            </div>
          ) : (
            <>
              {isQa && (
                <Aviso tone="warning">
                  <span className="font-semibold">Entorno de homologación (QA).</span> Este
                  pedido no llega al depósito de Distecna: no se factura, no se paga y no
                  descuenta stock real.
                </Aviso>
              )}

              {/* Ítems */}
              <div className="overflow-hidden rounded-lg border border-line">
                {items.map((i, idx) => (
                  <div
                    key={i.code}
                    className={cn(
                      "flex items-start justify-between gap-3 p-3",
                      idx > 0 && "border-t border-line-soft"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium leading-tight text-ink">
                        {i.name || i.code}
                      </p>
                      <p className="mt-1 font-mono text-[10.5px] text-ink-muted">{i.code}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="num font-mono text-[12.5px] font-semibold text-ink">
                        {fmtUsd(i.price * i.quantity)}
                      </p>
                      <p className="num mt-1 text-[10.5px] text-ink-muted">
                        {i.quantity} × {fmtUsd(i.price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Dirección */}
              {addresses.length > 0 && (
                <div>
                  <p className="eyebrow flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" />
                    Dirección de entrega
                  </p>
                  {addresses.length === 1 ? (
                    <p className="mt-1.5 text-[13px] text-ink">{addresses[0].name}</p>
                  ) : (
                    <select
                      value={addressId}
                      onChange={(e) => setAddressId(e.target.value)}
                      className="mt-1.5 h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-ink transition-colors hover:border-n-400 focus:outline-none"
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
                <p className="eyebrow">Condición de pago</p>
                <p className="mt-1.5 text-[13px] text-ink">
                  {paymentTerm ? (
                    paymentTerm.name.trim()
                  ) : (
                    <span className="text-ink-muted">Default de la cuenta</span>
                  )}
                </p>
              </div>

              {error && <Aviso tone="danger">{error}</Aviso>}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 rounded-b-2xl border-t border-line bg-surface-subtle px-5 py-4 sm:px-6">
          {result ? (
            <Button onClick={onClose} size="lg" className="w-full">
              Listo
            </Button>
          ) : (
            <>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="eyebrow">Total estimado</span>
                <span className="num font-mono text-[18px] font-bold text-ink">
                  {fmtUsd(total)}
                  {isQa && (
                    <Badge tone="warning" size="sm" className="ml-2 align-middle">
                      QA
                    </Badge>
                  )}
                </span>
              </div>
              <p className="mb-3.5 text-[11px] leading-relaxed text-ink-muted">
                Calculado con el costo de nuestro catálogo. Distecna factura con su precio al
                momento del pedido.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={onClose}
                  disabled={submitting}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button onClick={submit} disabled={submitting} size="lg" className="flex-1">
                  {submitting ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Enviando…
                    </>
                  ) : (
                    <>
                      <ShoppingCart />
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
