"use client"

import { useEffect, useState } from "react"
import {
  Check,
  ChevronDown,
  Copy,
  Cpu,
  Loader2,
  Plus,
  Trash2,
  User,
  Wand2,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { LoadingState } from "@/components/ui/states"
import { cn } from "@/lib/utils"
import { PROMPTS_SISTEMA } from "@/lib/prompts-sistema"

type PromptPropio = {
  id: string
  nombre: string
  descripcion: string
  cuerpo: string
  autor: string | null
  createdAt: string
}

export function PromptsClient() {
  const [propios, setPropios] = useState<PromptPropio[] | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState({ nombre: "", descripcion: "", cuerpo: "" })
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    fetch("/api/contenido/prompts")
      .then((r) => r.json())
      .then((d) => setPropios(d.prompts ?? []))
      .catch(() => setPropios([]))
  }, [])

  async function crear() {
    if (!form.nombre.trim() || !form.cuerpo.trim()) {
      toast.error("Completá el nombre y el prompt")
      return
    }
    setGuardando(true)
    try {
      const res = await fetch("/api/contenido/prompts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar")
      setPropios((prev) => [data.prompt, ...(prev ?? [])])
      setForm({ nombre: "", descripcion: "", cuerpo: "" })
      setCreando(false)
      toast.success("Prompt creado")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(id: string) {
    const anterior = propios
    setPropios((prev) => (prev ?? []).filter((p) => p.id !== id))
    try {
      const res = await fetch(`/api/contenido/prompts/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
    } catch {
      setPropios(anterior ?? null)
      toast.error("No se pudo borrar")
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Prompts del sistema ───────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-ink-muted" strokeWidth={2} />
          <h2 className="text-[14px] font-semibold text-ink">Prompts del sistema</h2>
          <Badge tone="neutral" size="sm">
            {PROMPTS_SISTEMA.length}
          </Badge>
        </div>
        <p className="mb-3 max-w-2xl text-[12px] leading-relaxed text-ink-muted">
          Lo que la app le manda a los modelos en cada paso de la generación. En modo lectura:
          las <code className="rounded bg-surface-muted px-1">{"{variables}"}</code> se
          reemplazan en runtime por los datos reales del plan y de la pieza.
        </p>
        <div className="space-y-2.5">
          {PROMPTS_SISTEMA.map((p) => (
            <PromptCard
              key={p.id}
              nombre={p.nombre}
              descripcion={p.descripcion}
              cuerpo={p.cuerpo}
              meta={
                <>
                  <Badge tone="brand" size="sm">
                    {p.modelo}
                  </Badge>
                  <span className="font-mono text-[10.5px] text-ink-faint">{p.donde}</span>
                </>
              }
            />
          ))}
        </div>
      </section>

      {/* ── Mis prompts ───────────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <User className="h-4 w-4 text-ink-muted" strokeWidth={2} />
          <h2 className="text-[14px] font-semibold text-ink">Prompts del equipo</h2>
          {propios && (
            <Badge tone="neutral" size="sm">
              {propios.length}
            </Badge>
          )}
          <Button size="sm" className="ml-auto" onClick={() => setCreando((v) => !v)}>
            <Plus />
            Nuevo prompt
          </Button>
        </div>

        {creando && (
          <div className="mb-3 rounded-xl border border-line bg-surface-subtle p-4">
            <div className="space-y-3">
              <Input
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre (ej: Tono para bancos)"
                disabled={guardando}
              />
              <Input
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                placeholder="Descripción corta (opcional)"
                disabled={guardando}
              />
              <Textarea
                value={form.cuerpo}
                onChange={(e) => setForm((f) => ({ ...f, cuerpo: e.target.value }))}
                placeholder="El prompt…"
                className="min-h-[140px] font-mono text-[12px]"
                disabled={guardando}
              />
              <div className="flex items-center gap-2">
                <Button onClick={crear} disabled={guardando}>
                  {guardando ? <Loader2 className="animate-spin" /> : <Wand2 />}
                  {guardando ? "Guardando…" : "Guardar prompt"}
                </Button>
                <Button variant="outline" onClick={() => setCreando(false)} disabled={guardando}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        )}

        {propios === null ? (
          <LoadingState label="Cargando los prompts…" />
        ) : propios.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface-subtle px-6 py-8 text-center">
            <p className="text-[12.5px] font-medium text-ink">Todavía no hay prompts propios</p>
            <p className="mt-1 text-[11.5px] text-ink-muted">
              Creá uno y va a quedar a tu nombre, listo para reusar.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {propios.map((p) => (
              <PromptCard
                key={p.id}
                nombre={p.nombre}
                descripcion={p.descripcion}
                cuerpo={p.cuerpo}
                meta={
                  <>
                    <span className="flex items-center gap-1 text-[10.5px] text-ink-muted">
                      <User className="h-3 w-3" strokeWidth={2} />
                      {p.autor ?? "Sin autor"}
                    </span>
                    <span className="text-[10.5px] text-ink-faint">{fecha(p.createdAt)}</span>
                  </>
                }
                onBorrar={() => borrar(p.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/* ── Card de prompt (sistema o propio) ────────────────────────────────────── */

function PromptCard({
  nombre,
  descripcion,
  cuerpo,
  meta,
  onBorrar,
}: {
  nombre: string
  descripcion: string
  cuerpo: string
  meta: React.ReactNode
  onBorrar?: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(cuerpo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="mt-0.5 shrink-0 text-ink-muted transition-transform hover:text-ink"
          aria-label={abierto ? "Colapsar" : "Expandir"}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", abierto && "rotate-180")} />
        </button>

        <button type="button" onClick={() => setAbierto((v) => !v)} className="min-w-0 flex-1 text-left">
          <p className="text-[13px] font-semibold text-ink">{nombre}</p>
          {descripcion && (
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">{descripcion}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">{meta}</div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <Button size="xs" variant="ghost" onClick={copiar}>
            {copiado ? <Check /> : <Copy />}
            {copiado ? "Copiado" : "Copiar"}
          </Button>
          {onBorrar && (
            <Button size="icon-sm" variant="ghost" onClick={onBorrar} aria-label="Borrar">
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      {abierto && (
        <pre className="max-h-[420px] overflow-auto border-t border-line bg-surface-subtle px-4 py-3 text-[11.5px] leading-relaxed text-ink-secondary">
          {cuerpo}
        </pre>
      )}
    </div>
  )
}

function fecha(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })
}
