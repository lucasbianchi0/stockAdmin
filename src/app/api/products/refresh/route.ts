import { resetEnrichment } from "@/lib/products-cache"

export async function POST() {
  resetEnrichment()
  return Response.json({ ok: true, message: "sync triggered" })
}
