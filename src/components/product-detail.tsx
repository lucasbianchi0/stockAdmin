"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import type { Product } from "@/types/product"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, ChevronLeft, ChevronRight, Package } from "lucide-react"
import { Button } from "@/components/ui/button"

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0 gap-4">
      <dt className="text-xs font-medium text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-sm font-medium text-right">{value || "—"}</dd>
    </div>
  )
}

function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0)
    return (
      <span className="inline-flex items-center rounded-md bg-red-50 px-3 py-1 text-sm font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
        Sin stock
      </span>
    )
  if (stock < 10)
    return (
      <span className="inline-flex items-center rounded-md bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
        Stock bajo · {stock} und.
      </span>
    )
  return (
    <span className="inline-flex items-center rounded-md bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
      {stock} disponibles
    </span>
  )
}

function ImageGallery({ images, name }: { images: string[]; name?: string }) {
  const [current, setCurrent] = useState(0)

  if (!images || images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center aspect-square rounded-xl bg-muted/50 text-muted-foreground gap-3 border border-dashed">
        <Package className="h-14 w-14 opacity-15" />
        <p className="text-sm text-muted-foreground/60">Sin imagen</p>
      </div>
    )
  }

  const prev = () => setCurrent((c) => (c - 1 + images.length) % images.length)
  const next = () => setCurrent((c) => (c + 1) % images.length)

  return (
    <div className="space-y-3">
      <div className="relative aspect-square rounded-xl overflow-hidden bg-white border">
        <Image
          src={images[current]}
          alt={name ? `${name} - imagen ${current + 1}` : `Imagen ${current + 1}`}
          fill
          className="object-contain p-4"
          sizes="(max-width: 768px) 100vw, 400px"
        />
        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 backdrop-blur-sm p-1.5 shadow-md hover:bg-white transition-colors border border-border/50"
            >
              <ChevronLeft className="h-3.5 w-3.5 text-foreground" />
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 backdrop-blur-sm p-1.5 shadow-md hover:bg-white transition-colors border border-border/50"
            >
              <ChevronRight className="h-3.5 w-3.5 text-foreground" />
            </button>
            <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-black/30 backdrop-blur-sm px-2.5 py-0.5 text-xs font-medium text-white">
              {current + 1} / {images.length}
            </div>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`relative h-14 w-14 shrink-0 rounded-lg overflow-hidden border-2 transition-all duration-150 ${
                i === current
                  ? "border-primary shadow-sm"
                  : "border-transparent hover:border-border bg-muted/30"
              }`}
            >
              <Image src={img} alt={`Miniatura ${i + 1}`} fill className="object-contain p-1" sizes="56px" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ProductDetail({ code }: { code: string }) {
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const res = await fetch(`/api/products/${code}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setProduct(data)
      } catch (err) {
        setError("No se pudo cargar el producto.")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchProduct()
  }, [code])

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        {/* Hero skeleton */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b bg-muted/10">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2.5">
                <div className="flex gap-2">
                  <div className="h-5 w-20 bg-muted rounded-full" />
                  <div className="h-5 w-16 bg-muted/70 rounded-full" />
                </div>
                <div className="h-6 w-2/3 bg-muted rounded" />
              </div>
              <div className="h-7 w-28 bg-muted rounded-md shrink-0" />
            </div>
          </div>
          <div className="px-6 py-4 flex items-center gap-0 divide-x divide-border">
            {[[28, 28], [20, 20], [20, 20], [20, 20]].map(([h, w], i) => (
              <div key={i} className={`${i === 0 ? "pr-6" : "px-6"} space-y-1.5`}>
                <div className="h-2.5 w-10 bg-muted rounded" />
                <div className="bg-muted rounded" style={{ height: h, width: w * 3 }} />
              </div>
            ))}
          </div>
        </div>
        {/* Grid skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="rounded-xl border bg-card shadow-sm p-4">
            <div className="h-2.5 w-16 bg-muted rounded mb-3" />
            <div className="aspect-square bg-muted/50 rounded-xl" />
            <div className="flex gap-2 mt-3">
              {[0,1,2].map(i => <div key={i} className="h-14 w-14 bg-muted/50 rounded-lg" />)}
            </div>
          </div>
          <div className="lg:col-span-2 rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b flex gap-2 bg-muted/10">
              {[28, 24, 20].map((w, i) => <div key={i} className="h-8 bg-muted rounded-md" style={{ width: w * 4 }} />)}
            </div>
            <div className="px-5 py-4">
              {[180, 220, 140, 160, 200, 170].map((w, i) => (
                <div key={i} className="flex justify-between py-2.5 border-b last:border-0">
                  <div className="h-3 w-16 bg-muted rounded" />
                  <div className="h-3 bg-muted/70 rounded" style={{ width: w / 3 * 2 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
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

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted-foreground">
        <Package className="h-11 w-11 opacity-20" />
        <p className="text-sm">Producto no encontrado</p>
      </div>
    )
  }

  const ivaPercent = product.iva ? `${(product.iva * 100).toFixed(0)}%` : "—"
  const iiPercent = product.ii ? `${(product.ii * 100).toFixed(0)}%` : "0%"
  const priceFormatted = product.price
    ? `${product.currency} ${product.price.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—"

  return (
    <div className="space-y-5">

      {/* Hero card */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 pt-5 pb-4 border-b bg-gradient-to-r from-primary/[0.04] to-transparent">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {product.category && (
                  <span className="text-[11px] font-semibold tracking-wide uppercase text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                    {product.category}
                  </span>
                )}
                {product.brand && (
                  <span className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full">
                    {product.brand}
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold tracking-tight leading-snug">
                {product.name || "Producto sin nombre"}
              </h1>
              {product.subBrand && product.subBrand !== product.brand && (
                <p className="text-sm text-muted-foreground mt-0.5">{product.subBrand}</p>
              )}
            </div>
            <StockBadge stock={product.stock} />
          </div>
        </div>

        {/* Key metrics row */}
        <div className="grid grid-cols-2 sm:flex sm:items-center sm:divide-x sm:divide-border border-t sm:border-t-0 divide-y sm:divide-y-0 [&>div]:p-4 sm:[&>div]:p-0">
          <div className="sm:pr-6 sm:py-4 border-r sm:border-r-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Precio</p>
            <p className="text-xl sm:text-2xl font-bold text-primary tracking-tight">{priceFormatted}</p>
          </div>
          <div className="sm:px-6 sm:py-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">IVA</p>
            <p className="text-xl font-bold tracking-tight">{ivaPercent}</p>
          </div>
          {product.ii > 0 && (
            <div className="sm:px-6 sm:py-4 border-r sm:border-r-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Imp. Int.</p>
              <p className="text-xl font-bold tracking-tight">{iiPercent}</p>
            </div>
          )}
          <div className={`sm:px-6 sm:py-4 ${product.ii > 0 ? "" : "border-r sm:border-r-0"}`}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Stock</p>
            <p className="text-xl font-bold tracking-tight">{product.stock ?? 0} <span className="text-sm font-normal text-muted-foreground">und.</span></p>
          </div>
          <div className="sm:pl-6 sm:py-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Moneda</p>
            <p className="text-xl font-bold tracking-tight">{product.currency || "—"}</p>
          </div>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Image gallery */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border bg-card shadow-sm p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Imágenes</p>
            <ImageGallery images={product.images ?? []} name={product.name} />
          </div>
        </div>

        {/* Tabs */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <Tabs defaultValue="details">
              <div className="px-5 pt-4 border-b bg-muted/10">
                <TabsList className="h-9 bg-transparent p-0 gap-1">
                  <TabsTrigger value="details" className="h-8 px-4 text-xs font-semibold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-md">
                    Identificación
                  </TabsTrigger>
                  <TabsTrigger value="description" className="h-8 px-4 text-xs font-semibold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-md">
                    Descripción
                  </TabsTrigger>
                  <TabsTrigger value="attributes" className="h-8 px-4 text-xs font-semibold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-md">
                    Atributos
                    {product.attributes && product.attributes.length > 0 && (
                      <span className="ml-1.5 text-[10px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
                        {product.attributes.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="details" className="px-5 py-4 mt-0">
                <dl>
                  <DetailRow label="Código" value={product.code} />
                  <DetailRow label="SKU" value={product.sku} />
                  <DetailRow label="EAN" value={product.ean} />
                  <DetailRow label="UPC" value={product.upc} />
                  <DetailRow label="Categoría" value={product.category} />
                  <DetailRow label="Marca" value={product.brand} />
                </dl>
              </TabsContent>

              <TabsContent value="description" className="px-5 py-4 mt-0">
                {product.description || product.fullDescription ? (
                  <div className="space-y-4">
                    {product.description && (
                      <p className="text-sm leading-relaxed text-foreground">{product.description}</p>
                    )}
                    {product.fullDescription && (
                      <div
                        className="text-sm leading-relaxed text-muted-foreground prose prose-sm max-w-none border-t pt-4"
                        dangerouslySetInnerHTML={{ __html: product.fullDescription }}
                      />
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground/60 py-8 text-center">Sin descripción disponible</p>
                )}
              </TabsContent>

              <TabsContent value="attributes" className="px-5 py-4 mt-0">
                {product.attributes && product.attributes.length > 0 ? (
                  <dl>
                    {product.attributes.map((attr, i) => (
                      <div key={i} className="flex items-center justify-between py-2.5 border-b last:border-0 gap-4">
                        <dt className="text-xs font-medium text-muted-foreground shrink-0">{attr.name}</dt>
                        <dd className="text-sm font-medium text-right">{attr.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground/60 py-8 text-center">Sin atributos disponibles</p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  )
}
