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
import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/ui/stat-card"
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states"
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
  X,
  Loader2,
  RefreshCw,
  Package,
  CheckCircle2,
  XCircle,
  Star,
} from "lucide-react"
import type { Product } from "@/types/product"
import { formatIva } from "@/lib/iva"
import { cn } from "@/lib/utils"

type SortField = "name" | "code" | "sku" | "stock" | "price" | "iva" | "ii"
type SortDir = "asc" | "desc"

const PAGE_SIZES = [25, 50, 100]

function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0) return <Badge tone="danger" size="sm">Sin stock</Badge>
  if (stock < 10)
    return (
      <Badge tone="warning" size="sm" className="num tabular-nums">
        {stock}
      </Badge>
    )
  return (
    <Badge tone="success" size="sm" className="num tabular-nums">
      {stock}
    </Badge>
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
      className={cn(
        "-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 uppercase tracking-[0.09em] transition-colors",
        active ? "text-brand-600" : "hover:text-ink-secondary"
      )}
    >
      {label}
      {active ? (
        sortDir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-25" />
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
  if (!price) return "—"
  return `${currency} ${price.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPercent(val: number) {
  if (val === undefined || val === null) return "—"
  return `${(val * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`
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
  const [myCodes, setMyCodes] = useState<Set<string>>(new Set())
  const [pendingCodes, setPendingCodes] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [exportedCount, setExportedCount] = useState(0)

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

  useEffect(() => {
    fetch("/api/my-products")
      .then((r) => r.json())
      .then((d) => setMyCodes(new Set<string>(d.codes ?? [])))
      .catch(() => {})
  }, [])

  const handleCheckbox = useCallback((code: string) => {
    if (myCodes.has(code)) return
    setPendingCodes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }, [myCodes])

  const handleExport = useCallback(async () => {
    if (pendingCodes.size === 0) return
    setExporting(true)
    try {
      const codes = [...pendingCodes]
      const res = await fetch("/api/my-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes }),
      })
      if (res.ok) {
        setMyCodes((prev) => new Set([...prev, ...codes]))
        setExportedCount(codes.length)
        setPendingCodes(new Set())
        setTimeout(() => setExportedCount(0), 3000)
      }
    } finally {
      setExporting(false)
    }
  }, [pendingCodes])

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

  if (loading) return <TableSkeleton />

  if (syncing) {
    return (
      <div className="panel flex flex-col items-center justify-center gap-4 py-28">
        <div className="relative flex h-14 w-14 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-brand-200/50" />
          <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 ring-1 ring-inset ring-brand-200">
            <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
          </span>
        </div>
        <div className="space-y-1 text-center">
          <p className="text-[14px] font-semibold text-ink">Sincronizando productos</p>
          <p className="max-w-sm text-[12.5px] leading-relaxed text-ink-muted">
            La primera carga puede tardar unos minutos. La página se actualiza sola.
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="panel">
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-5">
        {/* Métricas */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Total"
            value={products.length.toLocaleString()}
            hint="productos en el catálogo"
            icon={Package}
            tone="brand"
          />
          <StatCard
            label="Con stock"
            value={withStock.toLocaleString()}
            hint="disponibles para venta"
            icon={CheckCircle2}
            tone="success"
          />
          <StatCard
            label="Sin stock"
            value={(products.length - withStock).toLocaleString()}
            hint="sin unidades disponibles"
            icon={XCircle}
            tone="danger"
          />
        </div>

        {/* Tabla */}
        <div className="panel overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-col items-start justify-between gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:px-5">
            <div className="relative w-full sm:max-w-[300px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <Input
                type="search"
                placeholder="Nombre, código, SKU o marca…"
                className="h-8 pl-8 pr-8"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              />
              {search && (
                <button
                  onClick={() => { setSearch(""); setPage(1) }}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-faint transition-colors hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
              {lastSync && (
                <span className="hidden text-[11.5px] text-ink-muted lg:inline">
                  Sync{" "}
                  <span className="font-medium text-ink-secondary">
                    {formatLastSync(lastSync)}
                  </span>
                </span>
              )}
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={refreshing ? "animate-spin" : ""} />
                Actualizar
              </Button>

              <span className="toolbar-divider hidden sm:block" />

              <label className="flex cursor-pointer select-none items-center gap-2 text-[11.5px] font-medium text-ink-muted">
                <Switch
                  checked={filterStock}
                  onCheckedChange={(v) => { setFilterStock(v); setPage(1) }}
                />
                Solo con stock
              </label>

              <span className="toolbar-divider hidden sm:block" />

              <label className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
                Filas
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                  className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[11.5px] font-medium text-ink-secondary transition-colors hover:border-n-400 focus:outline-none"
                >
                  {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
          </div>

          {/* Resumen */}
          <div className="border-b border-line bg-surface-subtle px-5 py-2 text-[11.5px] text-ink-muted">
            <span className="num font-semibold text-ink">
              {filtered.length.toLocaleString()}
            </span>{" "}
            {filtered.length === products.length
              ? "productos"
              : `resultados de ${products.length.toLocaleString()}`}
            {filtered.length > 0 && (
              <span className="ml-2 text-ink-faint">
                · página <span className="num font-medium text-ink-secondary">{page}</span> de{" "}
                <span className="num font-medium text-ink-secondary">{totalPages}</span>
              </span>
            )}
          </div>

          {/* Grilla */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 text-center">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={
                        paginated.filter((p) => !myCodes.has(p.code)).length > 0 &&
                        paginated.filter((p) => !myCodes.has(p.code)).every((p) => pendingCodes.has(p.code))
                      }
                      onChange={() => {
                        const available = paginated.filter((p) => !myCodes.has(p.code)).map((p) => p.code)
                        const allSelected = available.every((c) => pendingCodes.has(c))
                        setPendingCodes((prev) => {
                          const next = new Set(prev)
                          if (allSelected) available.forEach((c) => next.delete(c))
                          else available.forEach((c) => next.add(c))
                          return next
                        })
                      }}
                      title="Seleccionar página"
                    />
                  </TableHead>
                  <TableHead className="min-w-[280px]">
                    <SortButton field="name" label="Producto" {...sortProps} />
                  </TableHead>
                  <TableHead className="hidden w-[150px] sm:table-cell">
                    <SortButton field="code" label="Código" {...sortProps} />
                  </TableHead>
                  <TableHead className="hidden w-[130px] md:table-cell">
                    <SortButton field="sku" label="SKU" {...sortProps} />
                  </TableHead>
                  <TableHead className="w-[90px]">
                    <SortButton field="stock" label="Stock" {...sortProps} />
                  </TableHead>
                  <TableHead className="w-[130px] text-right">
                    <span className="flex justify-end">
                      <SortButton field="price" label="Precio" {...sortProps} />
                    </span>
                  </TableHead>
                  <TableHead className="hidden w-[70px] text-right sm:table-cell">
                    <span className="flex justify-end">
                      <SortButton field="iva" label="IVA" {...sortProps} />
                    </span>
                  </TableHead>
                  <TableHead className="hidden w-[70px] text-right sm:table-cell">
                    <span className="flex justify-end">
                      <SortButton field="ii" label="II" {...sortProps} />
                    </span>
                  </TableHead>
                  <TableHead className="w-[76px] text-right">Detalle</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {paginated.length > 0 ? (
                  paginated.map((product) => {
                    const mine = myCodes.has(product.code)
                    const pending = pendingCodes.has(product.code)

                    return (
                      <TableRow
                        key={product.code}
                        className={cn(pending && "bg-brand-50/70 hover:bg-brand-50")}
                      >
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            className="checkbox"
                            checked={mine || pending}
                            onChange={() => handleCheckbox(product.code)}
                            disabled={mine}
                            title={mine ? "Ya está en Nuestros Productos" : undefined}
                          />
                        </TableCell>

                        <TableCell className="max-w-[280px]">
                          {(() => {
                            const entry =
                              names[product.code] ??
                              (product.name ? { name: product.name, brand: product.brand } : null)
                            if (entry)
                              return (
                                <>
                                  <span
                                    className="block truncate text-[13px] font-medium text-ink"
                                    title={entry.name}
                                  >
                                    {entry.name}
                                  </span>
                                  {entry.brand && (
                                    <span className="mt-0.5 block truncate text-[11.5px] text-ink-muted">
                                      {entry.brand}
                                    </span>
                                  )}
                                </>
                              )
                            if (loadingNames)
                              return <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-faint" />
                            return <span className="text-[11.5px] italic text-ink-faint">Sin nombre</span>
                          })()}
                        </TableCell>

                        <TableCell className="hidden sm:table-cell">
                          <span className="font-mono text-[11.5px] font-medium text-ink-secondary">
                            {product.code || "—"}
                          </span>
                        </TableCell>

                        <TableCell className="hidden md:table-cell">
                          <span className="font-mono text-[11.5px] text-ink-muted">
                            {product.sku || "—"}
                          </span>
                        </TableCell>

                        <TableCell>
                          <StockBadge stock={product.stock} />
                        </TableCell>

                        <TableCell className="num text-right font-mono text-[12.5px] font-semibold text-ink">
                          {formatPrice(product.price, product.currency)}
                        </TableCell>

                        <TableCell className="num hidden text-right text-[12px] text-ink-muted sm:table-cell">
                          {formatIva(product.iva, "—")}
                        </TableCell>

                        <TableCell className="num hidden text-right text-[12px] text-ink-muted sm:table-cell">
                          {formatPercent(product.ii)}
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {mine && (
                              <Star
                                className="h-3 w-3 shrink-0 fill-brand-500 text-brand-500"
                                aria-label="En Nuestros Productos"
                              />
                            )}
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
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={9} className="p-0">
                      <EmptyState
                        icon={Search}
                        title="Sin resultados"
                        description={
                          search
                            ? `No hay productos que coincidan con “${search}”.`
                            : "No hay productos con stock disponible."
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-line bg-surface-subtle px-5 py-3 sm:flex-row">
              <p className="num order-2 text-[11.5px] text-ink-muted sm:order-1">
                {Math.min((page - 1) * pageSize + 1, filtered.length)}–
                {Math.min(page * pageSize, filtered.length)} de{" "}
                {filtered.length.toLocaleString()}
              </p>
              <div className="order-1 flex items-center gap-1 sm:order-2">
                <Button variant="outline" size="icon-sm" onClick={() => goTo(1)} disabled={page === 1}>
                  <ChevronsLeft />
                </Button>
                <Button variant="outline" size="icon-sm" onClick={() => goTo(page - 1)} disabled={page === 1}>
                  <ChevronLeft />
                </Button>
                <div className="mx-1 flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let p: number
                    if (totalPages <= 5) p = i + 1
                    else if (page <= 3) p = i + 1
                    else if (page >= totalPages - 2) p = totalPages - 4 + i
                    else p = page - 2 + i
                    return (
                      <Button
                        key={p}
                        variant={p === page ? "default" : "ghost"}
                        size="icon-sm"
                        className="num text-[11.5px]"
                        onClick={() => goTo(p)}
                      >
                        {p}
                      </Button>
                    )
                  })}
                </div>
                <Button variant="outline" size="icon-sm" onClick={() => goTo(page + 1)} disabled={page === totalPages}>
                  <ChevronRight />
                </Button>
                <Button variant="outline" size="icon-sm" onClick={() => goTo(totalPages)} disabled={page === totalPages}>
                  <ChevronsRight />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Barra flotante de selección. Va en navy y no en blanco: tiene que
          leerse como una capa por encima de todo, no como otra card. */}
      {pendingCodes.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-navy-900 py-2 pl-5 pr-2 shadow-e4 animate-in slide-in-from-bottom-4 fade-in-0 duration-200">
          <span className="num whitespace-nowrap text-[12.5px] font-medium text-white">
            {pendingCodes.size} seleccionado{pendingCodes.size !== 1 ? "s" : ""}
          </span>
          <span className="h-4 w-px bg-white/15" />
          <Button size="sm" className="rounded-full" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="animate-spin" /> : <Star />}
            Exportar a Nuestros Productos
          </Button>
          <button
            aria-label="Limpiar selección"
            className="rounded-full p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            onClick={() => setPendingCodes(new Set())}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {exportedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-navy-900 px-5 py-2.5 shadow-e4 animate-in slide-in-from-bottom-4 fade-in-0 duration-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          <span className="text-[12.5px] font-medium text-white">
            {exportedCount} producto{exportedCount !== 1 ? "s" : ""} agregado
            {exportedCount !== 1 ? "s" : ""} a Nuestros Productos
          </span>
        </div>
      )}
    </>
  )
}

/**
 * Esqueleto con la misma métrica que la tabla real (mismas alturas de fila y
 * anchos de columna): si el layout salta al cargar, el esqueleto empeora la
 * percepción de velocidad en vez de mejorarla.
 */
function TableSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {["bg-brand-500", "bg-success", "bg-danger"].map((rail, i) => (
          <div key={i} className="relative overflow-hidden rounded-xl border border-line bg-surface p-5 shadow-e1">
            <span className={`absolute inset-y-0 left-0 w-[3px] ${rail} opacity-30`} />
            <div className="flex items-start justify-between pl-1.5">
              <div className="space-y-2.5">
                <Skeleton className="h-2 w-14" />
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-2 w-28 opacity-60" />
              </div>
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <div className="flex gap-3">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-32 rounded-lg" />
          </div>
        </div>
        <div className="border-b border-line bg-surface-subtle px-5 py-2.5">
          <Skeleton className="h-2.5 w-36" />
        </div>
        <div className="flex items-center gap-4 border-b border-line bg-surface-subtle px-5 py-3">
          {[280, 150, 130, 90, 130, 70, 70].map((w, i) => (
            <Skeleton key={i} className="h-2 shrink-0 opacity-70" style={{ width: w / 2.4 }} />
          ))}
        </div>
        {[220, 180, 240, 200, 190, 230, 210, 170, 250, 195].map((nameW, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line-soft px-5 py-3">
            <div className="shrink-0" style={{ width: 280 }}>
              <Skeleton className="mb-2 h-2.5" style={{ width: nameW }} />
              <Skeleton className="h-2 opacity-60" style={{ width: nameW / 2.6 }} />
            </div>
            <Skeleton className="h-2.5 w-[110px] shrink-0 opacity-80" />
            <Skeleton className="hidden h-2.5 w-[90px] shrink-0 opacity-60 md:block" />
            <Skeleton className="h-5 w-12 shrink-0 rounded-md" />
            <Skeleton className="h-2.5 w-[80px] shrink-0 opacity-80" />
            <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  )
}
