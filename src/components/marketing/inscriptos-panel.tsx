"use client"

import { useCallback, useEffect, useState } from "react"
import { Copy, Inbox, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

type Inscripcion = { id: string; email: string; creado: string }

/**
 * Los que se anotaron desde el sitio (el popup del evento en accedra.com.ar).
 *
 * Son mails, no asistentes: anotarse no es haber ido. Por eso esta lista está
 * separada de la de certificados, y lo que se ofrece es copiar los mails —para
 * el recordatorio o para cruzarlos con la planilla de presentes—.
 */
export function InscriptosPanel({ eventoId }: { eventoId: string }) {
  const [lista, setLista] = useState<Inscripcion[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const r = await fetch(`/api/marketing/eventos/${eventoId}/inscripciones`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudieron cargar las inscripciones")
      setLista(d.inscripciones ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las inscripciones")
    }
  }, [eventoId])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function copiar() {
    if (!lista?.length) return
    try {
      await navigator.clipboard.writeText(lista.map((i) => i.email).join("\n"))
      toast.success(`${lista.length} mail${lista.length === 1 ? "" : "s"} copiado${lista.length === 1 ? "" : "s"}`)
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-e1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-ink-muted" />
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
            Inscriptos desde el sitio{lista ? ` · ${lista.length}` : ""}
          </h2>
        </div>
        {lista && lista.length > 0 && (
          <Button variant="outline" size="xs" onClick={copiar}>
            <Copy />
            Copiar mails
          </Button>
        )}
      </div>

      {error ? (
        <p className="mt-3 text-[12px] text-destructive">{error}</p>
      ) : lista === null ? (
        <p className="mt-3 flex items-center gap-2 text-[12px] text-ink-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Cargando…
        </p>
      ) : lista.length === 0 ? (
        <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
          Todavía nadie se anotó. Cuando alguien deje su mail en el evento del sitio, aparece acá y le llega la confirmación.
        </p>
      ) : (
        <ul className="mt-3 max-h-64 divide-y divide-line overflow-auto rounded-lg border border-line">
          {lista.map((i) => (
            <li key={i.id} className="flex items-baseline justify-between gap-3 px-3 py-2 text-[12.5px]">
              <span className="truncate font-medium text-ink">{i.email}</span>
              <span className="flex-shrink-0 font-mono text-[11px] text-ink-faint">
                {new Date(i.creado).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
