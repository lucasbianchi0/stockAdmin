import { Agent, fetch as undiciFetch } from "undici"

const API_URL = process.env.API_URL!
const API_KEY = process.env.API_KEY ?? ""

const agent = new Agent({ connect: { rejectUnauthorized: false } })

export async function GET() {
  if (!API_URL || !API_KEY) {
    return Response.json({ error: "Missing API configuration" }, { status: 500 })
  }
  try {
    const res = await undiciFetch(API_URL, {
      dispatcher: agent,
      headers: { "x-apikey": API_KEY },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return Response.json(data)
  } catch (err) {
    console.error("[/api/products/basic]", err)
    return Response.json({ error: "Error loading products" }, { status: 500 })
  }
}
