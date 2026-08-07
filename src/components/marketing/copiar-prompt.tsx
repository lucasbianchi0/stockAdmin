"use client"

import { useState } from "react"
import { Copy, Check, Loader2 } from "lucide-react"
import { construirPromptMaestro, RUTA_PLANTILLA, PROMPT_VERSION } from "@/lib/marketing-context"

/**
 * Copia el prompt maestro completo — criterio, rúbrica y plantilla HTML — listo
 * para pegar en un chat junto con los CSV del mes.
 *
 * La plantilla se baja en el momento en vez de estar embebida en el bundle: son
 * ~15 KB que sólo hacen falta cuando alguien aprieta el botón, y así el HTML que
 * se copia es siempre el mismo archivo que sirve de referencia.
 */
export function CopiarPrompt({ periodo }: { periodo: string }) {
  const [estado, setEstado] = useState<"listo" | "cargando" | "copiado" | "error">("listo")

  async function copiar() {
    setEstado("cargando")
    try {
      const res = await fetch(RUTA_PLANTILLA)
      if (!res.ok) throw new Error(`plantilla ${res.status}`)
      await navigator.clipboard.writeText(construirPromptMaestro(await res.text(), periodo))
      setEstado("copiado")
      setTimeout(() => setEstado("listo"), 2500)
    } catch {
      setEstado("error")
      setTimeout(() => setEstado("listo"), 3000)
    }
  }

  const { Icono, texto } = {
    listo: { Icono: Copy, texto: "Copiar prompt maestro" },
    cargando: { Icono: Loader2, texto: "Preparando…" },
    copiado: { Icono: Check, texto: "Copiado" },
    error: { Icono: Copy, texto: "No se pudo copiar" },
  }[estado]

  return (
    <button
      onClick={copiar}
      disabled={estado === "cargando"}
      title={`Prompt + plantilla para generar el informe de ${periodo}. Rúbrica v${PROMPT_VERSION}`}
      className={
        "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-[12.5px] font-medium shadow-e1 transition-colors duration-150 disabled:opacity-60 " +
        (estado === "copiado"
          ? "border-success-line bg-success-soft text-success-text"
          : estado === "error"
            ? "border-danger-line bg-danger-soft text-danger-text"
            : "border-line-strong bg-surface text-ink-secondary hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700")
      }
    >
      <Icono className={"h-3.5 w-3.5" + (estado === "cargando" ? " animate-spin" : "")} />
      {texto}
    </button>
  )
}
