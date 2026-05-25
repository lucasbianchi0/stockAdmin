import { createClient } from "npm:@supabase/supabase-js@2"

const API_URL = Deno.env.get("API_URL")!
const API_KEY = Deno.env.get("API_KEY") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const BATCH_SIZE = 35
const UPSERT_CHUNK = 500

// distecna uses a self-signed cert — bypass TLS validation via Deno's native HTTP client
const httpClient = Deno.createHttpClient({ unsafeIgnoreTls: true })

function apiFetch(url: string) {
  return fetch(url, {
    // deno-lint-ignore no-explicit-any
    client: httpClient as any,
    headers: { "x-apikey": API_KEY },
  })
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    console.log("[sync] fetching product list...")
    const listRes = await apiFetch(API_URL)
    if (!listRes.ok) throw new Error(`List fetch failed: HTTP ${listRes.status}`)

    const listData = await listRes.json() as { products?: Record<string, unknown>[] }
    const products = listData.products ?? []
    console.log(`[sync] ${products.length} products to enrich`)

    const enriched: Record<string, unknown>[] = []

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE)
      const details = await Promise.all(
        batch.map(async (p) => {
          try {
            const res = await apiFetch(`${API_URL}/${p.code}`)
            if (!res.ok) return {}
            return await res.json() as Record<string, unknown>
          } catch {
            return {}
          }
        })
      )
      batch.forEach((p, j) => enriched.push({ ...p, ...details[j] }))
      console.log(`[sync] enriched ${Math.min(i + BATCH_SIZE, products.length)}/${products.length}`)
    }

    const now = new Date().toISOString()
    const rows = enriched.map((p) => ({
      code: p.code,
      sku: p.sku,
      stock: p.stock,
      currency: p.currency,
      price: p.price,
      iva: p.iva,
      ii: p.ii,
      name: p.name ?? null,
      brand: p.brand ?? null,
      sub_brand: p.subBrand ?? null,
      category: p.category ?? null,
      ean: p.ean ?? null,
      upc: p.upc ?? null,
      description: p.description ?? null,
      full_description: p.fullDescription ?? null,
      attributes: p.attributes ?? null,
      images: p.images ?? null,
      synced_at: now,
    }))

    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const { error } = await supabase
        .from("products")
        .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: "code" })
      if (error) throw new Error(`Upsert failed: ${error.message}`)
    }

    console.log(`[sync] done — ${rows.length} products saved`)
    return Response.json({ ok: true, count: rows.length, synced_at: now })
  } catch (err) {
    console.error("[sync] error:", err)
    return Response.json({ ok: false, error: String(err) }, { status: 500 })
  }
})
