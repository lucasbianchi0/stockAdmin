"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge, Dot } from "@/components/ui/badge"
import { StatCard } from "@/components/ui/stat-card"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatIva, normalizeIva } from "@/lib/iva"
import { cn } from "@/lib/utils"
import {
  OrderDialog,
  type DeliveryAddress,
  type OrderDraftItem,
  type PaymentTerm,
} from "@/components/order-dialog"
import {
  Eye,
  Trash2,
  ExternalLink,
  Loader2,
  RefreshCw,
  TrendingUp,
  DollarSign,
  PackageOpen,
  Check,
  ShoppingCart,
  X,
  Plus,
} from "lucide-react"

interface MyProduct {
  code: string
  name: string | null
  brand: string | null
  stock: number
  price: number
  currency: string
  sku: string
  iva: number
  publication_name: string | null
  published_price: number | null
  publication_link: string | null
  added_at: string
}

type EditableField = "publication_name" | "published_price" | "publication_link"
type SemaforoColor = "verde" | "amarillo" | "rojo"

function calcPrecioMinimo(
  costo: number,
  dolar: number,
  margen: number,
  iva: number
): number {
  return ((costo * dolar) * 1.155 * margen * (1 + normalizeIva(iva))) + 8000
}

function getSemaforo(
  stock: number,
  publishedPrice: number | null,
  minPrice: number
): SemaforoColor {
  if (publishedPrice !== null && publishedPrice <= minPrice) return "rojo"
  if (stock >= 30) return "verde"
  if (stock >= 10) return "amarillo"
  return "rojo"
}

function getSemaforoDetail(
  stock: number,
  publishedPrice: number | null,
  minPrice: number
): string {
  if (publishedPrice !== null && publishedPrice <= minPrice) return "Precio ≤ mínimo"
  if (stock >= 30) return "Stock ≥ 30"
  if (stock >= 10) return `Stock ${stock} (10–29)`
  if (stock > 0) return `Stock ${stock} (1–9)`
  return "Sin stock"
}

function formatARS(value: number): string {
  return `$ ${value.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0) return <Badge tone="danger" size="sm">Sin stock</Badge>
  if (stock < 10) return <Badge tone="warning" size="sm" className="num">{stock}</Badge>
  return <Badge tone="success" size="sm" className="num">{stock}</Badge>
}

/**
 * Semáforo: punto de color + etiqueta + causa. El punto solo no alcanza —
 * "rojo" puede venir de precio bajo o de falta de stock, y son dos acciones
 * distintas. Y el color solo tampoco es accesible.
 */
function SemaforoBadge({ color, detail }: { color: SemaforoColor; detail: string }) {
  const tone = { verde: "success", amarillo: "warning", rojo: "danger" } as const
  const label = { verde: "Verde", amarillo: "Amarillo", rojo: "Rojo" }

  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <Dot tone={tone[color]} />
        <span
          className={cn(
            "text-[11.5px] font-semibold",
            color === "verde" && "text-success-text",
            color === "amarillo" && "text-warning-text",
            color === "rojo" && "text-danger-text"
          )}
        >
          {label[color]}
        </span>
      </span>
      <span className="text-[10.5px] leading-none text-ink-muted">{detail}</span>
    </div>
  )
}

function fmtNum(value: number, decimals = 0): string {
  return value.toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function PrecioMinimoTooltip({
  costo,
  currency,
  dolar,
  margen,
  iva,
  minPrice,
}: {
  costo: number
  currency: string
  dolar: number
  margen: number
  iva: number
  minPrice: number
}) {
  const ivaFactor = 1 + normalizeIva(iva)
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-white/45">
        Cálculo del precio mínimo
      </p>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums">
        <span className="text-white/45">Costo</span>
        <span className="text-right text-white/90">{currency} {fmtNum(costo, 2)}</span>
        <span className="text-white/45">T/C BNA</span>
        <span className="text-right text-white/90">$ {fmtNum(dolar, 2)}</span>
        <span className="text-white/45">Coef. fijo</span>
        <span className="text-right text-white/90">1,155</span>
        <span className="text-white/45">Margen</span>
        <span className="text-right text-white/90">{fmtNum(margen, 2)}</span>
        <span className="text-white/45">IVA</span>
        <span className="text-right text-white/90">{formatIva(iva)} (×{fmtNum(ivaFactor, 3)})</span>
        <span className="text-white/45">Envío</span>
        <span className="text-right text-white/90">$ 8.000</span>
      </div>
      <div className="border-t border-white/10 pt-2 font-mono text-[10.5px] leading-relaxed">
        <p className="text-white/55">
          (({fmtNum(costo, 2)} × {fmtNum(dolar, 2)}) × 1,155 × {fmtNum(margen, 2)} × {fmtNum(ivaFactor, 3)}) + 8.000
        </p>
        <p className="mt-1 text-[12px] font-semibold text-emerald-300">
          = {formatARS(minPrice)}
        </p>
      </div>
    </div>
  )
}

/** Celda editable in-place: en reposo se lee como texto, al hover insinúa que
 *  se puede tocar. Un input visible por fila convertiría la tabla en formulario. */
function CeldaEditableVacia({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-ink-faint transition-colors group-hover:text-brand-600">
      <Plus className="h-3 w-3" />
      {label}
    </span>
  )
}

export function MisProductosTable() {
  const [products, setProducts] = useState<MyProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dolar, setDolar] = useState<number | null>(null)
  const [dolarUpdatedAt, setDolarUpdatedAt] = useState<string | null>(null)
  const [margen, setMargen] = useState("1.30")
  const [margenInput, setMargenInput] = useState("1.30")
  const [margenSaving, setMargenSaving] = useState(false)
  const [editingCell, setEditingCell] = useState<{
    code: string
    field: EditableField
    value: string
  } | null>(null)
  const [deletingCode, setDeletingCode] = useState<string | null>(null)

  // Pedidos: cantidad por codigo seleccionado. Un codigo presente en el Map esta
  // seleccionado; su valor es la cantidad a pedir.
  const [selected, setSelected] = useState<Map<string, number>>(new Map())
  const [showOrderDialog, setShowOrderDialog] = useState(false)
  const [checkout, setCheckout] = useState<{
    configured: boolean
    environment: string | null
    paymentTerm: PaymentTerm | null
    addresses: DeliveryAddress[]
  } | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [prodRes, dolarRes, settingsRes] = await Promise.all([
        fetch("/api/my-products"),
        fetch("/api/dolar"),
        fetch("/api/settings"),
      ])
      const [prodData, dolarData, settingsData] = await Promise.all([
        prodRes.json(),
        dolarRes.json(),
        settingsRes.json(),
      ])
      setProducts(prodData.products ?? [])
      if (dolarData.venta) setDolar(dolarData.venta)
      if (dolarData.updatedAt) setDolarUpdatedAt(dolarData.updatedAt)
      const m = settingsData.margen_accedra ?? "1.30"
      setMargen(m)
      setMargenInput(m)
    } catch {
      setError("No se pudieron cargar los datos.")
    } finally {
      setLoading(false)
    }
  }, [])

  // El contexto de Distecna se carga aparte: si la API V2 no responde, la tabla
  // tiene que seguir funcionando igual — solo se deshabilitan los pedidos.
  useEffect(() => {
    fetch("/api/distecna/checkout")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return
        setCheckout({
          configured: Boolean(d.configured),
          environment: d.environment ?? null,
          paymentTerm: d.paymentTerm ?? null,
          addresses: d.addresses ?? [],
        })
      })
      .catch(() => {})
  }, [])

  const toggleSelect = useCallback((code: string) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(code)) next.delete(code)
      else next.set(code, 1)
      return next
    })
  }, [])

  const setQuantity = useCallback((code: string, qty: number) => {
    setSelected((prev) => {
      if (!prev.has(code)) return prev
      const next = new Map(prev)
      next.set(code, qty)
      return next
    })
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const saveMargen = useCallback(async () => {
    const val = parseFloat(margenInput)
    if (isNaN(val) || val <= 0) return
    setMargenSaving(true)
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ margen_accedra: String(val) }),
      })
      setMargen(String(val))
    } finally {
      setMargenSaving(false)
    }
  }, [margenInput])

  const startEdit = useCallback(
    (code: string, field: EditableField, current: string | number | null) => {
      setEditingCell({ code, field, value: String(current ?? "") })
    },
    []
  )

  const commitEdit = useCallback(async () => {
    if (!editingCell) return
    const { code, field, value } = editingCell
    setEditingCell(null)

    const payload: Record<string, string | number | null> = {}
    if (field === "published_price") {
      const num = parseFloat(value)
      payload[field] = isNaN(num) ? null : num
    } else {
      payload[field] = value.trim() || null
    }

    setProducts((prev) =>
      prev.map((p) => (p.code === code ? { ...p, ...payload } : p))
    )

    await fetch(`/api/my-products/${encodeURIComponent(code)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  }, [editingCell])

  const handleDelete = useCallback(async (code: string) => {
    setDeletingCode(null)
    setProducts((prev) => prev.filter((p) => p.code !== code))
    await fetch(`/api/my-products/${encodeURIComponent(code)}`, { method: "DELETE" })
  }, [])

  const margenNum = parseFloat(margen) || 1.3
  const dolarNum = dolar ?? 0

  const orderItems: OrderDraftItem[] = products
    .filter((p) => selected.has(p.code))
    .map((p) => ({
      code: p.code,
      name: p.publication_name ?? p.name,
      quantity: selected.get(p.code) ?? 1,
      price: p.price ?? 0,
      currency: p.currency,
    }))
  const orderUnits = orderItems.reduce((acc, i) => acc + i.quantity, 0)
  const orderTotal = orderItems.reduce((acc, i) => acc + i.price * i.quantity, 0)

  if (loading) return <LoadingState label="Cargando productos y cotización…" />

  if (error) {
    return (
      <div className="panel">
        <ErrorState message={error} onRetry={fetchAll} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Parámetros del cálculo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="T/C BNA venta"
          value={dolarNum > 0 ? formatARS(dolarNum) : <span className="text-ink-faint">—</span>}
          hint={
            dolarUpdatedAt
              ? `Actualizado ${new Date(dolarUpdatedAt).toLocaleString("es-AR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}`
              : undefined
          }
          icon={DollarSign}
          tone="success"
        />

        <StatCard label="Margen Accedra" icon={TrendingUp} tone="brand">
          <p className="mt-1 text-[11.5px] text-ink-muted">
            Multiplicador del precio mínimo
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <Input
              value={margenInput}
              onChange={(e) => setMargenInput(e.target.value)}
              onBlur={saveMargen}
              onKeyDown={(e) => e.key === "Enter" && saveMargen()}
              className="num h-8 w-24 text-[15px] font-semibold"
              type="number"
              step="0.01"
              min="1"
              aria-label="Margen Accedra"
            />
            {margenSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-muted" />
            ) : margenInput !== margen ? (
              <Button size="sm" onClick={saveMargen}>
                <Check />
                Guardar
              </Button>
            ) : null}
          </div>
        </StatCard>
      </div>

      {/* Tabla */}
      <div className="panel overflow-hidden">
        <div className="panel-header">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink">
              {products.length} {products.length === 1 ? "producto" : "productos"}
            </p>
            <p className="mt-1 truncate font-mono text-[10.5px] text-ink-muted">
              Precio mínimo = ((Costo × T/C BNA) × 1,155 × Margen × (1 + IVA)) + $8.000
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAll}>
            <RefreshCw />
            Actualizar
          </Button>
        </div>

        {products.length === 0 ? (
          <EmptyState
            icon={PackageOpen}
            title="No hay productos todavía"
            description={
              <>
                Seleccioná productos desde{" "}
                <Link href="/" className="font-medium text-brand-600 hover:underline">
                  Inventario
                </Link>{" "}
                y exportalos acá.
              </>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 text-center">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos"
                      className="checkbox"
                      checked={selected.size > 0 && selected.size === products.length}
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            selected.size > 0 && selected.size < products.length
                      }}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? new Map(products.map((p) => [p.code, 1]))
                            : new Map()
                        )
                      }
                    />
                  </TableHead>
                  <TableHead className="w-9 text-center">N°</TableHead>
                  <TableHead className="w-[100px]">Cantidad</TableHead>
                  <TableHead className="min-w-[230px]">Publicación</TableHead>
                  <TableHead className="w-[85px]">Stock</TableHead>
                  <TableHead className="w-[125px] text-right">Costo</TableHead>
                  <TableHead className="w-[70px] text-right">IVA</TableHead>
                  <TableHead className="hidden w-[130px] md:table-cell">SKU</TableHead>
                  <TableHead className="w-[160px] text-right">Precio mínimo</TableHead>
                  <TableHead className="w-[150px] text-right">Precio publicado</TableHead>
                  <TableHead className="w-[125px]">Semáforo</TableHead>
                  <TableHead className="hidden min-w-[160px] lg:table-cell">Link</TableHead>
                  <TableHead className="w-[112px] text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {products.map((product, idx) => {
                  const minPrice =
                    dolarNum > 0
                      ? calcPrecioMinimo(product.price, dolarNum, margenNum, product.iva)
                      : null
                  const semaforo =
                    minPrice !== null
                      ? getSemaforo(product.stock, product.published_price, minPrice)
                      : null
                  const semaforoDetail =
                    minPrice !== null
                      ? getSemaforoDetail(product.stock, product.published_price, minPrice)
                      : null

                  const isEditingPub =
                    editingCell?.code === product.code &&
                    editingCell.field === "publication_name"
                  const isEditingPrice =
                    editingCell?.code === product.code &&
                    editingCell.field === "published_price"
                  const isEditingLink =
                    editingCell?.code === product.code &&
                    editingCell.field === "publication_link"
                  const isDeleting = deletingCode === product.code

                  const isSelected = selected.has(product.code)
                  const quantity = selected.get(product.code) ?? 1

                  return (
                    <TableRow
                      key={product.code}
                      className={cn(isSelected && "bg-brand-50/70 hover:bg-brand-50")}
                    >
                      {/* Selección para pedido */}
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${product.code}`}
                          className="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(product.code)}
                        />
                      </TableCell>

                      <TableCell className="num text-center text-[11.5px] font-medium text-ink-faint">
                        {idx + 1}
                      </TableCell>

                      {/* Cantidad a pedir */}
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={isSelected ? quantity : ""}
                          disabled={!isSelected}
                          onChange={(e) =>
                            setQuantity(
                              product.code,
                              Math.max(1, parseInt(e.target.value, 10) || 1)
                            )
                          }
                          placeholder="—"
                          className="num h-7 w-[68px] text-center text-[12.5px]"
                        />
                        {isSelected && quantity > product.stock && (
                          <p className="mt-1 text-[10px] font-medium leading-none text-warning-text">
                            &gt; stock ({product.stock})
                          </p>
                        )}
                      </TableCell>

                      {/* Publicación */}
                      <TableCell className="max-w-[230px]">
                        {isEditingPub ? (
                          <Input
                            autoFocus
                            value={editingCell.value}
                            onChange={(e) =>
                              setEditingCell((c) => (c ? { ...c, value: e.target.value } : null))
                            }
                            onBlur={() => setTimeout(commitEdit, 150)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit()
                              if (e.key === "Escape") setEditingCell(null)
                            }}
                            className="h-7"
                            placeholder="Nombre de publicación…"
                          />
                        ) : (
                          <div
                            className="group -mx-1.5 cursor-pointer rounded-md px-1.5 py-1 transition-colors hover:bg-brand-50"
                            onClick={() =>
                              startEdit(product.code, "publication_name", product.publication_name)
                            }
                          >
                            {product.publication_name ? (
                              <span className="block truncate text-[13px] font-medium text-ink transition-colors group-hover:text-brand-700">
                                {product.publication_name}
                              </span>
                            ) : (
                              <>
                                <span className="block truncate text-[13px] font-medium text-ink-secondary">
                                  {product.name ?? product.code}
                                </span>
                                {product.brand && (
                                  <span className="block truncate text-[11px] text-ink-muted">
                                    {product.brand}
                                  </span>
                                )}
                                <CeldaEditableVacia label="Agregar nombre de publicación" />
                              </>
                            )}
                          </div>
                        )}
                      </TableCell>

                      <TableCell>
                        <StockBadge stock={product.stock} />
                      </TableCell>

                      {/* Costo — el dato de entrada del cálculo, en tinta secundaria */}
                      <TableCell className="num text-right font-mono text-[12.5px] font-medium text-ink-secondary">
                        {product.currency}{" "}
                        {product.price?.toLocaleString("es-AR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>

                      <TableCell className="num text-right font-mono text-[12px] text-ink-muted">
                        {formatIva(product.iva)}
                      </TableCell>

                      <TableCell className="hidden md:table-cell">
                        <span className="font-mono text-[11.5px] text-ink-muted">
                          {product.sku || "—"}
                        </span>
                      </TableCell>

                      {/* Precio mínimo */}
                      <TableCell className="text-right">
                        {minPrice !== null ? (
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="num cursor-help border-b border-dashed border-ink-faint font-mono text-[12.5px] font-semibold text-ink">
                                  {formatARS(minPrice)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" align="center" className="max-w-none">
                                <PrecioMinimoTooltip
                                  costo={product.price}
                                  currency={product.currency}
                                  dolar={dolarNum}
                                  margen={margenNum}
                                  iva={product.iva}
                                  minPrice={minPrice}
                                />
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-[11.5px] text-ink-faint">Sin cotización</span>
                        )}
                      </TableCell>

                      {/* Precio publicado */}
                      <TableCell className="text-right">
                        {isEditingPrice ? (
                          <Input
                            autoFocus
                            value={editingCell.value}
                            onChange={(e) =>
                              setEditingCell((c) => (c ? { ...c, value: e.target.value } : null))
                            }
                            onBlur={() => setTimeout(commitEdit, 150)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit()
                              if (e.key === "Escape") setEditingCell(null)
                            }}
                            className="num h-7 w-full text-right"
                            type="number"
                            placeholder="0.00"
                          />
                        ) : (
                          <div
                            className="group -mx-1.5 cursor-pointer rounded-md px-1.5 py-1 transition-colors hover:bg-brand-50"
                            onClick={() =>
                              startEdit(product.code, "published_price", product.published_price)
                            }
                          >
                            {product.published_price !== null ? (
                              <span className="num font-mono text-[12.5px] font-semibold text-ink transition-colors group-hover:text-brand-700">
                                {formatARS(product.published_price)}
                              </span>
                            ) : (
                              <CeldaEditableVacia label="Ingresar precio" />
                            )}
                          </div>
                        )}
                      </TableCell>

                      <TableCell>
                        {semaforo && semaforoDetail ? (
                          <SemaforoBadge color={semaforo} detail={semaforoDetail} />
                        ) : (
                          <span className="text-[11.5px] text-ink-faint">—</span>
                        )}
                      </TableCell>

                      {/* Link */}
                      <TableCell className="hidden max-w-[170px] lg:table-cell">
                        {isEditingLink ? (
                          <Input
                            autoFocus
                            value={editingCell.value}
                            onChange={(e) =>
                              setEditingCell((c) => (c ? { ...c, value: e.target.value } : null))
                            }
                            onBlur={() => setTimeout(commitEdit, 150)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit()
                              if (e.key === "Escape") setEditingCell(null)
                            }}
                            className="h-7 text-[11.5px]"
                            placeholder="https://…"
                          />
                        ) : (
                          <div
                            className="group -mx-1.5 flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-brand-50"
                            onClick={() =>
                              startEdit(product.code, "publication_link", product.publication_link)
                            }
                          >
                            {product.publication_link ? (
                              <>
                                <a
                                  href={product.publication_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="truncate text-[11.5px] text-brand-600 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {product.publication_link.replace(/^https?:\/\//, "")}
                                </a>
                                <ExternalLink className="h-3 w-3 shrink-0 text-brand-500" />
                              </>
                            ) : (
                              <CeldaEditableVacia label="Agregar link" />
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Acciones */}
                      <TableCell className="text-right">
                        {isDeleting ? (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="destructive"
                              size="xs"
                              onClick={() => handleDelete(product.code)}
                            >
                              Borrar
                            </Button>
                            <Button variant="ghost" size="xs" onClick={() => setDeletingCode(null)}>
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              asChild
                              variant="ghost"
                              size="icon-sm"
                              className="hover:bg-brand-600 hover:text-white"
                            >
                              <Link href={`/product/${product.code}`}>
                                <Eye />
                                <span className="sr-only">Ver detalle</span>
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="hover:bg-danger-soft hover:text-danger-text"
                              onClick={() => setDeletingCode(product.code)}
                            >
                              <Trash2 />
                              <span className="sr-only">Eliminar</span>
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Barra de pedido — fija abajo para que quede a mano en mobile sin tener
          que volver arriba. */}
      {selected.size > 0 && (
        <>
          <div className="h-24 sm:h-20" aria-hidden />
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-surface/85 backdrop-blur-xl shadow-[0_-8px_24px_-12px_oklch(0.215_0.032_257/0.18)] animate-in slide-in-from-bottom-4 duration-200">
            <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:px-8">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                  onClick={() => setSelected(new Map())}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                  aria-label="Limpiar selección"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold leading-tight text-ink">
                    {selected.size} {selected.size === 1 ? "producto" : "productos"} ·{" "}
                    {orderUnits} {orderUnits === 1 ? "unidad" : "unidades"}
                  </p>
                  <p className="num mt-0.5 flex items-center gap-2 text-[11.5px] text-ink-muted">
                    Total estimado U$S{" "}
                    {orderTotal.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    {checkout?.environment === "qa" && (
                      <Badge tone="warning" size="sm">QA</Badge>
                    )}
                  </p>
                </div>
              </div>
              <Button
                size="lg"
                className="w-full shrink-0 sm:w-auto"
                disabled={!checkout?.configured}
                onClick={() => setShowOrderDialog(true)}
              >
                <ShoppingCart />
                Generar pedido
              </Button>
            </div>
            {!checkout?.configured && (
              <p className="px-5 pb-3 text-[11px] text-warning-text sm:px-8">
                Distecna V2 no está configurado en este entorno, así que no se pueden generar
                pedidos todavía.
              </p>
            )}
          </div>
        </>
      )}

      {showOrderDialog && (
        <OrderDialog
          items={orderItems}
          paymentTerm={checkout?.paymentTerm ?? null}
          addresses={checkout?.addresses ?? []}
          environment={checkout?.environment ?? null}
          onClose={() => setShowOrderDialog(false)}
          onSuccess={() => setSelected(new Map())}
        />
      )}
    </div>
  )
}
