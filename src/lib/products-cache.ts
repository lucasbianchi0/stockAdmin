import type { Product } from "@/types/product"
import { supabase } from "@/lib/supabase"

const MEMORY_TTL_MS = 5 * 60 * 1000

export type NameEntry = { name: string; brand?: string }

export let enrichedCache: { products: Product[]; builtAt: number } | null = null
export const buildState = {
  running: false,
  current: 0,
  total: 0,
  names: {} as Record<string, NameEntry>,
  lastSync: null as string | null,
}

export function triggerSync() {
  if (buildState.running) return
  buildState.running = true

  fetch(`${process.env.SUPABASE_URL}/functions/v1/sync-products`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
  })
    .then(() => { buildState.running = false })
    .catch((err) => {
      console.error("[sync] trigger error:", err)
      buildState.running = false
    })
}

export async function getProducts(): Promise<Product[]> {
  if (enrichedCache && Date.now() - enrichedCache.builtAt < MEMORY_TTL_MS) {
    return enrichedCache.products
  }

  const PAGE = 1000
  let all: Record<string, unknown>[] = []
  let from = 0

  while (true) {
    const { data: page, error } = await supabase
      .from("products")
      .select("*")
      .order("code")
      .range(from, from + PAGE - 1)

    if (error) {
      console.error("[products-cache] supabase error:", error.message)
      return enrichedCache?.products ?? []
    }

    if (!page || page.length === 0) break
    all = all.concat(page)
    if (page.length < PAGE) break
    from += PAGE
  }

  const data = all

  if (!data || data.length === 0) {
    triggerSync()
    return []
  }

  const products: Product[] = data.map((row) => ({
    code: row.code,
    sku: row.sku,
    stock: row.stock,
    currency: row.currency,
    price: row.price,
    iva: row.iva,
    ii: row.ii,
    name: row.name ?? undefined,
    brand: row.brand ?? undefined,
    subBrand: row.sub_brand ?? undefined,
    category: row.category ?? undefined,
    ean: row.ean ?? undefined,
    upc: row.upc ?? undefined,
    description: row.description ?? undefined,
    fullDescription: row.full_description ?? undefined,
    attributes: row.attributes ?? undefined,
    images: row.images ?? undefined,
  }))

  const names: Record<string, NameEntry> = {}
  products.forEach((p) => {
    if (p.name) names[p.code] = { name: p.name, brand: p.brand }
  })

  buildState.current = products.length
  buildState.total = products.length
  buildState.names = names
  buildState.lastSync = data[0]?.synced_at ?? null
  buildState.running = false

  enrichedCache = { products, builtAt: Date.now() }
  return products
}

export function resetEnrichment() {
  enrichedCache = null
  triggerSync()
}
