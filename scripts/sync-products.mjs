import { Agent, fetch as undiciFetch } from "undici"
import { createClient } from "@supabase/supabase-js"

const API_URL = process.env.API_URL
const API_KEY = process.env.API_KEY ?? ""
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!API_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables")
  process.exit(1)
}

const BATCH_SIZE = 35
const UPSERT_CHUNK = 500

const agent = new Agent({ connect: { rejectUnauthorized: false } })
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function apiFetch(url) {
  return undiciFetch(url, {
    dispatcher: agent,
    headers: { "x-apikey": API_KEY },
  })
}

async function main() {
  console.log("[sync] fetching product list...")
  const listRes = await apiFetch(API_URL)
  if (!listRes.ok) throw new Error(`List fetch failed: HTTP ${listRes.status}`)

  const listData = await listRes.json()
  const products = listData.products ?? []
  console.log(`[sync] ${products.length} products to enrich`)

  const enriched = []

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE)
    const details = await Promise.all(
      batch.map(async (p) => {
        try {
          const res = await apiFetch(`${API_URL}/${p.code}`)
          if (!res.ok) return {}
          return await res.json()
        } catch {
          return {}
        }
      })
    )
    batch.forEach((p, j) => enriched.push({ ...p, ...details[j] }))
    console.log(`[sync] enriched ${Math.min(i + BATCH_SIZE, products.length)}/${products.length}`)
  }

  const now = new Date().toISOString()
  // deduplicate by code — the API occasionally returns duplicate entries
  const unique = [...new Map(enriched.map((p) => [p.code, p])).values()]
  console.log(`[sync] ${enriched.length} enriched → ${unique.length} unique`)

  const rows = unique.map((p) => ({
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
    console.log(`[sync] saved chunk ${i / UPSERT_CHUNK + 1}`)
  }

  console.log(`[sync] done — ${rows.length} products saved at ${now}`)
}

main().catch((err) => {
  console.error("[sync] fatal error:", err)
  process.exit(1)
})
