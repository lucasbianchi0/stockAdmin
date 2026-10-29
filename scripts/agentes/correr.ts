/**
 * Corre un agente, guarda lo que entrega y lo anota en el Calendario.
 *
 *   npm run agente -- blog        (o informe, redes, ads)
 *
 * En local lee `.env.local`; en GitHub Actions (agentes.yml) las mismas
 * variables llegan como secretos. Escribe directo en la base con la service
 * role: no pasa por Vercel, así que no le aplica el techo de 60 segundos de
 * las funciones.
 *
 * Bien o mal, la corrida queda en `calendario_corridas`. La primera que sale
 * bien pasa la entrada de `planificado` a `activo`: desde ahí, el Calendario
 * marca "no corrió" los días que falte.
 */
import { randomUUID } from "node:crypto"

import { supabase } from "@/lib/supabase"
import type { ClaveAgente } from "@/lib/agentes"
import type { Entrega } from "./comun"
import { ads } from "./ads"
import { blog } from "./blog"
import { informe } from "./informe"
import { redes } from "./redes"

const AGENTES: Record<string, { clave: ClaveAgente; correr: () => Promise<Entrega> }> = {
  blog: { clave: "agente-blog", correr: blog },
  informe: { clave: "agente-informe", correr: informe },
  redes: { clave: "agente-redes", correr: redes },
  ads: { clave: "agente-ads", correr: ads },
}

async function anotar(clave: string, inicio: string, ok: boolean, detalle: string) {
  const { error } = await supabase.from("calendario_corridas").insert({
    clave,
    ok,
    detalle: detalle.slice(0, 500),
    inicio,
    fin: new Date().toISOString(),
    origen: process.env.GITHUB_ACTIONS ? "cron" : "manual",
  })
  if (error) console.error("[agente] no se pudo anotar la corrida:", error.message)
}

async function main() {
  const nombre = process.argv[2]
  const agente = AGENTES[nombre ?? ""]
  if (!agente) {
    console.error(`Uso: npm run agente -- <${Object.keys(AGENTES).join("|")}>`)
    process.exit(2)
  }

  const inicio = new Date().toISOString()
  console.log(`[${agente.clave}] arranca`)

  try {
    const entrega = await agente.correr()

    const { data, error } = await supabase
      .from("agentes_trabajos")
      .insert({
        clave: agente.clave,
        titulo: entrega.titulo,
        resumen: entrega.resumen,
        propuestas: entrega.propuestas.map((p) => ({ ...p, id: randomUUID(), estado: "pendiente" })),
        fuentes: entrega.fuentes,
      })
      .select("id")
      .single()
    if (error || !data) throw new Error(`No se pudo guardar el trabajo: ${error?.message}`)

    await anotar(agente.clave, inicio, true, entrega.detalle)
    await supabase
      .from("calendario_entradas")
      .update({ estado: "activo" })
      .eq("clave", agente.clave)
      .eq("estado", "planificado")

    console.log(`[${agente.clave}] listo: ${entrega.detalle} (trabajo ${data.id})`)
    for (const [fuente, estado] of Object.entries(entrega.fuentes)) console.log(`  · ${fuente}: ${estado}`)
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    console.error(`[${agente.clave}] falló: ${mensaje}`)
    await anotar(agente.clave, inicio, false, mensaje)
    // En rojo en GitHub: un agente que falla en silencio es peor que uno que no existe.
    process.exit(1)
  }
}

main()
