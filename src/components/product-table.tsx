"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
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
import { Switch } from "@/components/ui/switch"
import {
  Eye,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  X,
  Loader2,
  RefreshCw,
  Package,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import type { Product } from "@/types/product"

type SortField = "name" | "code" | "sku" | "stock" | "price" | "iva" | "ii"
type SortDir = "asc" | "desc"

const PAGE_SIZES = [25, 50, 100]

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

function SortButton({
  field,
  label,
  sortField,
  sortDir,
  onSort,
}: {
  field: SortField
  label: string
  sortField: SortField
  sortDir: SortDir
  onSort: (f: SortField) => void
}) {
  const active = sortField === field
  return (
    <button
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 font-semibold transition-colors ${active ? "text-primary" : "hover:text-foreground"}`}
    >
      {label}
      {active ? (
        sortDir === "asc" ? (
          <ArrowUp className="h-3 w-3 text-primary" />
        ) : (
          <ArrowDown className="h-3 w-3 text-primary" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-30" />
      )}
    </button>
  )
}

function formatLastSync(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHs = diffMs / (1000 * 60 * 60)
  const time = date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })

  if (diffHs < 24) return `hoy ${time}`
  if (diffHs < 48) return `ayer ${time}`
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) + ` ${time}`
}

function formatPrice(price: number, currency: string) {
  if (!price) return "-"
  return `${currency} ${price.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPercent(val: number) {
  if (val === undefined || val === null) return "-"
  return `${(val * 100).toFixed(0)}%`
}

export function ProductTable() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [loadingNames, setLoadingNames] = useState(false)
  const [, setNamesProgress] = useState({ current: 0, total: 0 })
  const [names, setNames] = useState<Record<string, { name: string; brand?: string }>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterStock, setFilterStock] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [sortField, setSortField] = useState<SortField>("stock")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const startPolling = useCallback((intervalRef: { current: ReturnType<typeof setInterval> | null }) => {
    intervalRef.current = setInterval(async () => {
      try {
        const statusRes = await fetch("/api/products/status")
        const status = await statusRes.json()
        setNamesProgress({ current: status.current, total: status.total })
        if (status.names) setNames(status.names)
        if (status.done) {
          clearInterval(intervalRef.current!)
          setLoadingNames(false)
          setRefreshing(false)
        }
      } catch {
        // keep polling
      }
    }, 2000)
  }, [])

  useEffect(() => {
    const pollRef = { current: null as ReturnType<typeof setInterval> | null }

    const fetchProducts = async () => {
      try {
        const res = await fetch("/api/products")
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setProducts(data.products ?? [])
        if (data.lastSync) setLastSync(data.lastSync)

        if (data.syncing && (data.products ?? []).length === 0) {
          setSyncing(true)
          pollRef.current = setInterval(async () => {
            try {
              const r = await fetch("/api/products")
              const d = await r.json()
              if ((d.products ?? []).length > 0) {
                setProducts(d.products)
                setSyncing(false)
                clearInterval(pollRef.current!)
              }
            } catch { /* keep polling */ }
          }, 5000)
        }
      } catch (err) {
        setError("No se pudieron cargar los productos. Intentá de nuevo.")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchProducts()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [startPolling])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    setNames({})
    setNamesProgress({ current: 0, total: 0 })
    try {
      await fetch("/api/products/refresh", { method: "POST" })
      const res = await fetch("/api/products")
      if (res.ok) {
        const data = await res.json()
        setProducts(data.products ?? [])
      }
      setLoadingNames(true)
      const pollRef = { current: null as ReturnType<typeof setInterval> | null }
      startPolling(pollRef)
    } catch {
      setRefreshing(false)
    }
  }, [startPolling])

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"))
      } else {
        setSortField(field)
        setSortDir("desc")
      }
      setPage(1)
    },
    [sortField]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products
      .filter((p) => {
        if (!q) return true
        const entry = names[p.code]
        const name = entry?.name ?? p.name ?? ""
        const brand = entry?.brand ?? p.brand ?? ""
        return (
          name.toLowerCase().includes(q) ||
          brand.toLowerCase().includes(q) ||
          p.code?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q)
        )
      })
      .filter((p) => (filterStock ? p.stock > 0 : true))
      .sort((a, b) => {
        const va = a[sortField] ?? 0
        const vb = b[sortField] ?? 0
        const cmp =
          typeof va === "string"
            ? (va as string).localeCompare(vb as string)
            : (va as number) - (vb as number)
        return sortDir === "asc" ? cmp : -cmp
      })
  }, [products, names, search, filterStock, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)
  const withStock = useMemo(() => products.filter((p) => p.stock > 0).length, [products])

  const goTo = (p: number) => setPage(Math.min(Math.max(1, p), totalPages))
  const sortProps = { sortField, sortDir, onSort: handleSort }

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[["border-l-primary", "bg-primary/10"], ["border-l-emerald-500", "bg-emerald-50"], ["border-l-red-400", "bg-red-50"]].map(([border, icon], i) => (
            <div key={i} className={`rounded-xl border bg-card p-5 shadow-sm border-l-4 ${border}`}>
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="h-2 w-14 bg-muted rounded" />
                  <div className="h-8 w-20 bg-muted rounded" />
                  <div className="h-2 w-28 bg-muted/60 rounded" />
                </div>
                <div className={`h-9 w-9 rounded-lg ${icon}`} />
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/20 flex justify-between items-center">
            <div className="h-8 w-60 bg-muted rounded-md" />
            <div className="flex gap-3">
              <div className="h-8 w-24 bg-muted rounded-md" />
              <div className="h-8 w-28 bg-muted rounded-md" />
            </div>
          </div>
          <div className="px-5 py-2 border-b bg-muted/10">
            <div className="h-3 w-32 bg-muted rounded" />
          </div>
          <div>
            <div className="bg-slate-50/80 px-5 py-3 border-b flex items-center gap-4">
              {[260, 140, 120, 90, 110, 60, 60, 60].map((w, i) => (
                <div key={i} className="h-2 bg-muted rounded shrink-0" style={{ width: w }} />
              ))}
            </div>
            {[
              [220, 80], [180, 60], [240, 90], [200, 70], [190, 80],
              [230, 65], [210, 75], [170, 85], [250, 70], [195, 60],
            ].map(([nameW, brandW], i) => (
              <div key={i} className="px-5 py-3.5 border-b flex items-center gap-4">
                <div className="shrink-0" style={{ width: 260 }}>
                  <div className="h-3 bg-muted rounded mb-1.5" style={{ width: nameW }} />
                  <div className="h-2.5 bg-muted/50 rounded" style={{ width: brandW }} />
                </div>
                <div className="h-2.5 bg-muted/70 rounded shrink-0" style={{ width: 140 }} />
                <div className="h-2.5 bg-muted/50 rounded shrink-0" style={{ width: 100 }} />
                <div className="h-5 w-14 bg-muted rounded-md shrink-0" />
                <div className="h-2.5 bg-muted/70 rounded shrink-0" style={{ width: 80 }} />
                <div className="h-2.5 bg-muted/50 rounded shrink-0 w-10" />
                <div className="h-2.5 bg-muted/50 rounded shrink-0 w-10" />
                <div className="h-7 w-7 bg-muted rounded-lg shrink-0 ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (syncing) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="font-semibold text-foreground">Sincronizando productos...</p>
        <p className="text-sm text-muted-foreground">La primera carga puede tardar unos minutos. La página se actualizará sola.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <AlertCircle className="h-11 w-11 text-destructive" />
        <p className="text-destructive font-medium">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Reintentar</Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-5 shadow-sm border-l-4 border-l-primary">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Total</p>
              <p className="mt-1.5 text-3xl font-bold tracking-tight">{products.length.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">productos registrados</p>
            </div>
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="h-4.5 w-4.5 text-primary" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm border-l-4 border-l-emerald-500">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Con stock</p>
              <p className="mt-1.5 text-3xl font-bold tracking-tight text-emerald-600">{withStock.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">disponibles para venta</p>
            </div>
            <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm border-l-4 border-l-red-400">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Sin stock</p>
              <p className="mt-1.5 text-3xl font-bold tracking-tight text-red-500">{(products.length - withStock).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">sin unidades disponibles</p>
            </div>
            <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <XCircle className="h-4.5 w-4.5 text-red-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-3.5 border-b bg-muted/20">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Nombre, código, SKU o marca…"
              className="pl-8 pr-8 h-8 text-sm bg-background"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
            {search && (
              <button
                onClick={() => { setSearch(""); setPage(1) }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {lastSync && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Sync: <span className="font-medium text-foreground">{formatLastSync(lastSync)}</span>
              </span>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="h-8 gap-1.5 text-xs">
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              Actualizar
            </Button>

            <div className="h-4 w-px bg-border" />

            <div className="flex items-center gap-2">
              <Switch id="filter-stock" checked={filterStock} onCheckedChange={(v) => { setFilterStock(v); setPage(1) }} />
              <label htmlFor="filter-stock" className="text-xs font-medium cursor-pointer select-none text-muted-foreground">
                Solo con stock
              </label>
            </div>

            <div className="h-4 w-px bg-border" />

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Filas:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                className="text-xs rounded-md border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring h-8"
              >
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Results summary */}
        <div className="px-5 py-2 border-b text-xs text-muted-foreground bg-muted/10">
          {filtered.length === products.length ? (
            <span><strong className="text-foreground font-semibold">{filtered.length.toLocaleString()}</strong> productos</span>
          ) : (
            <span><strong className="text-foreground font-semibold">{filtered.length.toLocaleString()}</strong> resultados de {products.length.toLocaleString()}</span>
          )}
          {filtered.length > 0 && (
            <span className="ml-2 text-muted-foreground/70">— página <strong className="text-foreground font-medium">{page}</strong> de <strong className="text-foreground font-medium">{totalPages}</strong></span>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b">
                <TableHead className="min-w-[260px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3">
                  <SortButton field="name" label="Producto" {...sortProps} />
                </TableHead>
                <TableHead className="w-[160px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3 hidden sm:table-cell">
                  <SortButton field="code" label="Código" {...sortProps} />
                </TableHead>
                <TableHead className="w-[140px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3 hidden md:table-cell">
                  <SortButton field="sku" label="SKU" {...sortProps} />
                </TableHead>
                <TableHead className="w-[100px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3">
                  <SortButton field="stock" label="Stock" {...sortProps} />
                </TableHead>
                <TableHead className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3">
                  <SortButton field="price" label="Precio" {...sortProps} />
                </TableHead>
                <TableHead className="w-[80px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3 hidden sm:table-cell">
                  <SortButton field="iva" label="IVA" {...sortProps} />
                </TableHead>
                <TableHead className="w-[80px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3 hidden sm:table-cell">
                  <SortButton field="ii" label="II" {...sortProps} />
                </TableHead>
                <TableHead className="text-right w-[72px] text-[11px] font-semibold tracking-wide uppercase text-muted-foreground py-3">
                  Detalle
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length > 0 ? (
                paginated.map((product) => (
                  <TableRow key={product.code} className="hover:bg-primary/[0.03] transition-colors border-b border-border/60">
                    <TableCell className="max-w-[260px] py-3">
                      {(() => {
                        const entry = names[product.code] ?? (product.name ? { name: product.name, brand: product.brand } : null)
                        if (entry) return (
                          <>
                            <span className="block truncate text-sm font-medium text-foreground" title={entry.name}>{entry.name}</span>
                            {entry.brand && <span className="block truncate text-xs text-muted-foreground mt-0.5">{entry.brand}</span>}
                          </>
                        )
                        if (loadingNames) return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/50" />
                        return <span className="text-muted-foreground/50 italic text-xs">Sin nombre</span>
                      })()}
                    </TableCell>
                    <TableCell className="py-3 hidden sm:table-cell">
                      <span className="font-mono text-xs font-medium text-foreground/80">{product.code || "—"}</span>
                    </TableCell>
                    <TableCell className="py-3 hidden md:table-cell">
                      <span className="font-mono text-xs text-muted-foreground">{product.sku || "—"}</span>
                    </TableCell>
                    <TableCell className="py-3">
                      <StockBadge stock={product.stock} />
                    </TableCell>
                    <TableCell className="py-3 font-medium text-sm">
                      {formatPrice(product.price, product.currency)}
                    </TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground hidden sm:table-cell">
                      {formatPercent(product.iva)}
                    </TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground hidden sm:table-cell">
                      {formatPercent(product.ii)}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <Link href={`/product/${product.code}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-primary hover:text-primary-foreground transition-colors">
                          <Eye className="h-3.5 w-3.5" />
                          <span className="sr-only">Ver detalle</span>
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-2.5 text-muted-foreground">
                      <Search className="h-8 w-8 opacity-20" />
                      <p className="font-medium text-sm">Sin resultados</p>
                      <p className="text-xs text-muted-foreground/70">
                        {search ? `No hay productos que coincidan con "${search}"` : "No hay productos con stock disponible"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 border-t bg-muted/10">
            <p className="text-xs text-muted-foreground order-2 sm:order-1">
              {Math.min((page - 1) * pageSize + 1, filtered.length)}–{Math.min(page * pageSize, filtered.length)} de {filtered.length.toLocaleString()} resultados
            </p>
            <div className="flex items-center gap-1 order-1 sm:order-2">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => goTo(1)} disabled={page === 1}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => goTo(page - 1)} disabled={page === 1}><ChevronLeft className="h-3.5 w-3.5" /></Button>
              <div className="flex items-center gap-1 mx-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p: number
                  if (totalPages <= 5) p = i + 1
                  else if (page <= 3) p = i + 1
                  else if (page >= totalPages - 2) p = totalPages - 4 + i
                  else p = page - 2 + i
                  return (
                    <Button key={p} variant={p === page ? "default" : "ghost"} size="icon" className="h-7 w-7 text-xs" onClick={() => goTo(p)}>
                      {p}
                    </Button>
                  )
                })}
              </div>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => goTo(page + 1)} disabled={page === totalPages}><ChevronRight className="h-3.5 w-3.5" /></Button>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => goTo(totalPages)} disabled={page === totalPages}><ChevronsRight className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
