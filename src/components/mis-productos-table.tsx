"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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
import {
  Eye,
  Trash2,
  ExternalLink,
  AlertCircle,
  Loader2,
  RefreshCw,
  TrendingUp,
  DollarSign,
  PackageOpen,
  Check,
} from "lucide-react"

interface MyProduct {
  code: string
  name: string | null
  brand: string | null
  stock: number
  price: number
  currency: string
  sku: string
  publication_name: string | null
  published_price: number | null
  publication_link: string | null
  added_at: string
}

type EditableField = "publication_name" | "published_price" | "publication_link"
type SemaforoColor = "verde" | "amarillo" | "rojo"

function calcPrecioMinimo(costo: number, dolar: number, margen: number): number {
  return (((costo * dolar) * 1.155) + 8000) * margen
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
  if (publishedPrice !== null && publishedPrice <= minPrice) return "Precio ≤ Mínimo"
  if (stock >= 30) return "Stock ≥ 30"
  if (stock >= 10) return `Stock ${stock} (10–29)`
  if (stock > 0) return `Stock ${stock} (1–9)`
  return "Sin stock"
}

function formatARS(value: number): string {
  return `$ ${value.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0)
    return (
      <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
        Sin stock
      </span>
    )
  if (stock < 10)
    return (
      <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
        {stock}
      </span>
    )
  return (
    <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
      {stock}
    </span>
  )
}

function SemaforoBadge({ color, detail }: { color: SemaforoColor; detail: string }) {
  const styles: Record<SemaforoColor, string> = {
    verde: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    amarillo: "bg-amber-50 text-amber-700 ring-amber-600/20",
    rojo: "bg-red-50 text-red-700 ring-red-600/20",
  }
  const labels: Record<SemaforoColor, string> = {
    verde: "Verde",
    amarillo: "Amarillo",
    rojo: "Rojo",
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${styles[color]}`}
      >
        {labels[color]}
      </span>
      <span className="text-[11px] text-muted-foreground">{detail}</span>
    </div>
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
  const editInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingCell])

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
        <p className="text-destructive font-medium">{error}</p>
        <Button variant="outline" onClick={fetchAll}>
          Reintentar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Config cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Dólar BNA */}
        <div className="rounded-xl border bg-card p-5 shadow-sm border-l-4 border-l-emerald-500">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                T/C BNA Venta
              </p>
              <p className="mt-1.5 text-2xl font-bold tracking-tight text-emerald-600">
                {dolarNum > 0 ? (
                  formatARS(dolarNum)
                ) : (
                  <span className="text-muted-foreground text-lg">—</span>
                )}
              </p>
              {dolarUpdatedAt && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Actualizado:{" "}
                  {new Date(dolarUpdatedAt).toLocaleString("es-AR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
              )}
            </div>
            <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
        </div>

        {/* Margen Accedra */}
        <div className="rounded-xl border bg-card p-5 shadow-sm border-l-4 border-l-primary">
          <div className="flex items-start justify-between">
            <div className="flex-1 mr-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Margen Accedra
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Multiplicador del precio mínimo
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                <Input
                  value={margenInput}
                  onChange={(e) => setMargenInput(e.target.value)}
                  onBlur={saveMargen}
                  onKeyDown={(e) => e.key === "Enter" && saveMargen()}
                  className="h-8 w-24 text-sm font-semibold"
                  type="number"
                  step="0.01"
                  min="1"
                />
                {margenSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : margenInput !== margen ? (
                  <Button size="sm" className="h-8 text-xs gap-1" onClick={saveMargen}>
                    <Check className="h-3 w-3" />
                    Guardar
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b bg-muted/20 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              {products.length}{" "}
              {products.length === 1 ? "producto" : "productos"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
              Precio mínimo = (( Costo × T/C BNA ) × 1,155 + $8.000) × Margen
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAll}
            className="h-8 gap-1.5 text-xs shrink-0"
          >
            <RefreshCw className="h-3 w-3" />
            Actualizar
          </Button>
        </div>

        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
            <PackageOpen className="h-10 w-10 opacity-20" />
            <p className="font-medium text-sm">No hay productos todavía</p>
            <p className="text-xs">
              Seleccioná productos desde{" "}
              <Link href="/" className="text-primary hover:underline">
                Inventario
              </Link>{" "}
              y exportalos acá.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b">
                  <TableHead className="w-10 text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3 text-center">
                    N°
                  </TableHead>
                  <TableHead className="min-w-[220px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3">
                    Publicación
                  </TableHead>
                  <TableHead className="w-[90px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3">
                    Stock
                  </TableHead>
                  <TableHead className="w-[140px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3">
                    Costo
                  </TableHead>
                  <TableHead className="w-[140px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3 hidden md:table-cell">
                    SKU
                  </TableHead>
                  <TableHead className="min-w-[190px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3">
                    Precio Mínimo
                  </TableHead>
                  <TableHead className="w-[160px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3">
                    Precio Publicado
                  </TableHead>
                  <TableHead className="w-[130px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3">
                    Semáforo
                  </TableHead>
                  <TableHead className="min-w-[170px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3 hidden lg:table-cell">
                    Link Publicación
                  </TableHead>
                  <TableHead className="w-[90px] text-right text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product, idx) => {
                  const minPrice =
                    dolarNum > 0
                      ? calcPrecioMinimo(product.price, dolarNum, margenNum)
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

                  return (
                    <TableRow
                      key={product.code}
                      className="hover:bg-primary/[0.03] transition-colors border-b border-border/60"
                    >
                      {/* N° */}
                      <TableCell className="py-3 text-xs text-muted-foreground font-medium text-center">
                        {idx + 1}
                      </TableCell>

                      {/* Publicación */}
                      <TableCell className="py-3 max-w-[220px]">
                        {isEditingPub ? (
                          <Input
                            ref={editInputRef}
                            value={editingCell.value}
                            onChange={(e) =>
                              setEditingCell((c) =>
                                c ? { ...c, value: e.target.value } : null
                              )
                            }
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit()
                              if (e.key === "Escape") setEditingCell(null)
                            }}
                            className="h-7 text-sm"
                            placeholder="Nombre de publicación…"
                          />
                        ) : (
                          <div
                            className="cursor-pointer group"
                            onClick={() =>
                              startEdit(
                                product.code,
                                "publication_name",
                                product.publication_name
                              )
                            }
                          >
                            {product.publication_name ? (
                              <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors block truncate">
                                {product.publication_name}
                              </span>
                            ) : (
                              <div>
                                <span className="text-sm font-medium text-foreground/80 block truncate">
                                  {product.name ?? product.code}
                                </span>
                                {product.brand && (
                                  <span className="text-xs text-muted-foreground block">
                                    {product.brand}
                                  </span>
                                )}
                                <span className="text-[11px] text-primary/50 group-hover:text-primary transition-colors">
                                  + Agregar nombre de publicación
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Stock */}
                      <TableCell className="py-3">
                        <StockBadge stock={product.stock} />
                      </TableCell>

                      {/* Costo */}
                      <TableCell className="py-3">
                        <span className="font-mono text-sm font-semibold text-red-600">
                          {product.currency}{" "}
                          {product.price?.toLocaleString("es-AR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </TableCell>

                      {/* SKU */}
                      <TableCell className="py-3 hidden md:table-cell">
                        <span className="font-mono text-xs text-muted-foreground">
                          {product.sku || "—"}
                        </span>
                      </TableCell>

                      {/* Precio Mínimo */}
                      <TableCell className="py-3">
                        {minPrice !== null ? (
                          <span className="text-sm font-semibold text-foreground">
                            {formatARS(minPrice)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Sin cotización
                          </span>
                        )}
                      </TableCell>

                      {/* Precio Publicado */}
                      <TableCell className="py-3">
                        {isEditingPrice ? (
                          <Input
                            ref={editInputRef}
                            value={editingCell.value}
                            onChange={(e) =>
                              setEditingCell((c) =>
                                c ? { ...c, value: e.target.value } : null
                              )
                            }
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit()
                              if (e.key === "Escape") setEditingCell(null)
                            }}
                            className="h-7 text-sm w-36"
                            type="number"
                            placeholder="0.00"
                          />
                        ) : (
                          <div
                            className="cursor-pointer group"
                            onClick={() =>
                              startEdit(
                                product.code,
                                "published_price",
                                product.published_price
                              )
                            }
                          >
                            {product.published_price !== null ? (
                              <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                                {formatARS(product.published_price)}
                              </span>
                            ) : (
                              <span className="text-[11px] text-primary/50 group-hover:text-primary transition-colors">
                                + Ingresar precio
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Semáforo */}
                      <TableCell className="py-3">
                        {semaforo && semaforoDetail ? (
                          <SemaforoBadge color={semaforo} detail={semaforoDetail} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Link */}
                      <TableCell className="py-3 hidden lg:table-cell max-w-[170px]">
                        {isEditingLink ? (
                          <Input
                            ref={editInputRef}
                            value={editingCell.value}
                            onChange={(e) =>
                              setEditingCell((c) =>
                                c ? { ...c, value: e.target.value } : null
                              )
                            }
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit()
                              if (e.key === "Escape") setEditingCell(null)
                            }}
                            className="h-7 text-xs"
                            placeholder="https://..."
                          />
                        ) : (
                          <div
                            className="flex items-center gap-1 group cursor-pointer"
                            onClick={() =>
                              startEdit(
                                product.code,
                                "publication_link",
                                product.publication_link
                              )
                            }
                          >
                            {product.publication_link ? (
                              <>
                                <a
                                  href={product.publication_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline truncate"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {product.publication_link.replace(/^https?:\/\//, "")}
                                </a>
                                <ExternalLink className="h-3 w-3 text-primary shrink-0" />
                              </>
                            ) : (
                              <span className="text-[11px] text-primary/50 group-hover:text-primary transition-colors">
                                + Agregar link
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Acciones */}
                      <TableCell className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/product/${product.code}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg hover:bg-primary hover:text-primary-foreground transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span className="sr-only">Ver detalle</span>
                            </Button>
                          </Link>
                          {isDeleting ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={() => handleDelete(product.code)}
                              >
                                Confirmar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={() => setDeletingCode(null)}
                              >
                                Cancelar
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors"
                              onClick={() => setDeletingCode(product.code)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="sr-only">Eliminar</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
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
