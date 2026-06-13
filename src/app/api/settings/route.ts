import { supabase } from "@/lib/supabase"

export async function GET() {
  const { data, error } = await supabase.from("settings").select("key, value")
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const settings: Record<string, string> = {}
  ;(data ?? []).forEach((row) => { settings[row.key] = row.value })
  return Response.json(settings)
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const entries = Object.entries(body as Record<string, unknown>).map(([key, value]) => ({
      key,
      value: String(value),
    }))
    for (const entry of entries) {
      const { error } = await supabase
        .from("settings")
        .upsert(entry, { onConflict: "key" })
      if (error) return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ ok: true })
  } catch (err) {
    console.error("[/api/settings PATCH]", err)
    return Response.json({ error: "Error" }, { status: 500 })
  }
}
