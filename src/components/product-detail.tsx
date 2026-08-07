"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import type { Product } from "@/types/product"
import { formatIva } from "@/lib/iva"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states"
import { ChevronLeft, ChevronRight, Package } from "lucide-react"
import { cn } from "@/lib/utils"

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-soft py-2.5 last:border-0">
      <dt className="shrink-0 text-[11.5px] font-medium uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </dt>
      <dd
        className={cn(
          "text-right text-[13px] font-medium text-ink",
          value && "font-mono"
        )}
      >
        {value || <span className="font-sans text-ink-faint">—</span>}
      </dd>
    </div>
  )
}

function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0) return <Badge tone="danger" size="lg">Sin stock</Badge>
  if (stock < 10)
    return <Badge tone="warning" size="lg">Stock bajo · {stock} und.</Badge>
  return <Badge tone="success" size="lg">{stock} disponibles</Badge>
}

/** Métrica del hero. El rótulo en versalita y la cifra grande en peso 700:
 *  el contraste de peso es lo que la vuelve legible de un vistazo. */
function Metric({
  label,
  value,
  suffix,
  accent,
}: {
  label: string
  value: string | number
  suffix?: string
  accent?: boolean
}) {
  return (
    <div className="px-4 py-3.5 sm:px-6 sm:py-4">
      <p className="eyebrow">{label}</p>
      <p
        className={cn(
          "num mt-1.5 font-bold leading-none",
          accent ? "text-[22px] text-brand-600 sm:text-[26px]" : "text-[20px] text-ink"
        )}
      >
        {value}
        {suffix && (
          <span className="ml-1 text-[12px] font-normal text-ink-muted">{suffix}</span>
        )}
      </p>
    </div>
  )
}

function ImageGallery({ images, name }: { images: string[]; name?: string }) {
  const [current, setCurrent] = useState(0)

  if (!images || images.length === 0) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-muted">
        <Package className="h-10 w-10 text-ink-faint/50" strokeWidth={1.4} />
        <p className="text-[12px] text-ink-faint">Sin imagen</p>
      </div>
    )
  }

  const prev = () => setCurrent((c) => (c - 1 + images.length) % images.length)
  const next = () => setCurrent((c) => (c + 1) % images.length)

  return (
    <div className="space-y-3">
      <div className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-white">
        <Image
          src={images[current]}
          alt={name ? `${name} — imagen ${current + 1}` : `Imagen ${current + 1}`}
          fill
          className="object-contain p-5"
          sizes="(max-width: 768px) 100vw, 400px"
        />
        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              aria-label="Imagen anterior"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-line bg-white/95 p-1.5 opacity-0 shadow-e2 backdrop-blur transition-all duration-200 hover:bg-white group-hover:opacity-100 focus-visible:opacity-100"
            >
              <ChevronLeft className="h-3.5 w-3.5 text-ink" />
            </button>
            <button
              onClick={next}
              aria-label="Imagen siguiente"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-line bg-white/95 p-1.5 opacity-0 shadow-e2 backdrop-blur transition-all duration-200 hover:bg-white group-hover:opacity-100 focus-visible:opacity-100"
            >
              <ChevronRight className="h-3.5 w-3.5 text-ink" />
            </button>
            <div className="num absolute bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-navy-900/70 px-2.5 py-0.5 text-[10.5px] font-medium text-white backdrop-blur-sm">
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
              aria-label={`Ver imagen ${i + 1}`}
              className={cn(
                "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition-all duration-150",
                i === current
                  ? "border-brand-500 shadow-e1"
                  : "border-line hover:border-line-strong"
              )}
            >
              <Image src={img} alt="" fill className="object-contain p-1" sizes="56px" />
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

  if (loading) return <DetailSkeleton />

  if (error) {
    return (
      <div className="panel">
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="panel">
        <EmptyState
          icon={Package}
          title="Producto no encontrado"
          description={`No hay ningún producto con el código ${code} en el catálogo.`}
        />
      </div>
    )
  }

  const ivaPercent = formatIva(product.iva)
  const iiPercent = product.ii
    ? `${(product.ii * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`
    : "0%"
  const priceFormatted = product.price
    ? `${product.currency} ${product.price.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—"

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="panel overflow-hidden">
        <div className="border-b border-line bg-gradient-to-br from-brand-50/70 via-surface to-surface px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                {product.category && (
                  <Badge tone="brand" size="sm" className="uppercase tracking-[0.06em]">
                    {product.category}
                  </Badge>
                )}
                {product.brand && (
                  <Badge tone="neutral" size="sm" className="uppercase tracking-[0.06em]">
                    {product.brand}
                  </Badge>
                )}
              </div>
              <h1 className="text-[22px] font-semibold leading-snug tracking-[-0.025em] text-ink">
                {product.name || "Producto sin nombre"}
              </h1>
              {product.subBrand && product.subBrand !== product.brand && (
                <p className="mt-1 text-[13px] text-ink-muted">{product.subBrand}</p>
              )}
            </div>
            <StockBadge stock={product.stock} />
          </div>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 divide-line sm:flex sm:divide-x [&>div]:border-b [&>div]:border-line sm:[&>div]:border-b-0 [&>div:nth-child(odd)]:border-r sm:[&>div:nth-child(odd)]:border-r-0">
          <Metric label="Precio" value={priceFormatted} accent />
          <Metric label="IVA" value={ivaPercent} />
          {product.ii > 0 && <Metric label="Imp. int." value={iiPercent} />}
          <Metric label="Stock" value={product.stock ?? 0} suffix="und." />
          <Metric label="Moneda" value={product.currency || "—"} />
        </div>
      </div>

      {/* Contenido */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="panel p-4">
            <p className="eyebrow mb-3">Imágenes</p>
            <ImageGallery images={product.images ?? []} name={product.name} />
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="panel overflow-hidden">
            <Tabs defaultValue="details">
              <div className="border-b border-line bg-surface-subtle px-5 py-3">
                <TabsList>
                  <TabsTrigger value="details">Identificación</TabsTrigger>
                  <TabsTrigger value="description">Descripción</TabsTrigger>
                  <TabsTrigger value="attributes">
                    Atributos
                    {product.attributes && product.attributes.length > 0 && (
                      <span className="num rounded-full bg-brand-100 px-1.5 py-0.5 text-[9.5px] font-bold text-brand-700">
                        {product.attributes.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="details" className="mt-0 px-5 py-3">
                <dl>
                  <DetailRow label="Código" value={product.code} />
                  <DetailRow label="SKU" value={product.sku} />
                  <DetailRow label="EAN" value={product.ean} />
                  <DetailRow label="UPC" value={product.upc} />
                  <DetailRow label="Categoría" value={product.category} />
                  <DetailRow label="Marca" value={product.brand} />
                </dl>
              </TabsContent>

              <TabsContent value="description" className="mt-0 px-5 py-4">
                {product.description || product.fullDescription ? (
                  <div className="space-y-4">
                    {product.description && (
                      <p className="text-[13.5px] leading-[1.7] text-ink-secondary">
                        {product.description}
                      </p>
                    )}
                    {product.fullDescription && (
                      <div
                        className="border-t border-line pt-4 text-[13px] leading-[1.7] text-ink-muted [&_a]:text-brand-600 [&_a]:underline [&_li]:mt-1 [&_p]:mt-2.5 [&_strong]:font-semibold [&_strong]:text-ink-secondary [&_ul]:list-disc [&_ul]:pl-5"
                        dangerouslySetInnerHTML={{ __html: product.fullDescription }}
                      />
                    )}
                  </div>
                ) : (
                  <p className="py-10 text-center text-[12.5px] text-ink-faint">
                    Sin descripción disponible
                  </p>
                )}
              </TabsContent>

              <TabsContent value="attributes" className="mt-0 px-5 py-3">
                {product.attributes && product.attributes.length > 0 ? (
                  <dl>
                    {product.attributes.map((attr, i) => (
                      <DetailRow key={i} label={attr.name} value={attr.value} />
                    ))}
                  </dl>
                ) : (
                  <p className="py-10 text-center text-[12.5px] text-ink-faint">
                    Sin atributos disponibles
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="panel overflow-hidden">
        <div className="border-b border-line px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex gap-2">
                <Skeleton className="h-4 w-20 rounded-md" />
                <Skeleton className="h-4 w-16 rounded-md opacity-70" />
              </div>
              <Skeleton className="h-6 w-2/3" />
            </div>
            <Skeleton className="h-8 w-32 rounded-md" />
          </div>
        </div>
        <div className="flex divide-x divide-line">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex-1 space-y-2.5 px-6 py-4">
              <Skeleton className="h-2 w-12" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="panel p-4">
          <Skeleton className="mb-3 h-2 w-16" />
          <Skeleton className="aspect-square rounded-xl" />
          <div className="mt-3 flex gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-14 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="panel overflow-hidden lg:col-span-2">
          <div className="flex gap-2 border-b border-line bg-surface-subtle px-5 py-3">
            {[112, 96, 80].map((w, i) => (
              <Skeleton key={i} className="h-8 rounded-md" style={{ width: w }} />
            ))}
          </div>
          <div className="px-5 py-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex justify-between border-b border-line-soft py-3 last:border-0">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-2.5 w-28 opacity-70" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
