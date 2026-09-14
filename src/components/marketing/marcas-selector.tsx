"use client"

import { useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Search, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LIMITES, type Marca } from "@/lib/marketing/eventos"
import { cn } from "@/lib/utils"

/**
 * Elegir las tecnologías de un evento o de un certificado, desde la biblioteca
 * de logos, y subir a la biblioteca las que falten sin salir de la pantalla.
 *
 * La selección tiene ORDEN y se ve arriba, separada de la biblioteca: el primer
 * logo es el protagonista del evento ("Workshop de Copilot" → Copilot primero,
 * Microsoft 365 después), y ese orden es el que sale en la card y en el papel.
 */
export function MarcasSelector({
  marcas,
  seleccion,
  onChange,
  onMarcaCreada,
  onMarcaBorrada,
}: {
  marcas: Marca[]
  seleccion: string[]
  onChange: (ids: string[]) => void
  onMarcaCreada: (m: Marca) => void
  onMarcaBorrada: (id: string) => void
}) {
  const [busqueda, setBusqueda] = useState("")
  const [archivo, setArchivo] = useState<File | null>(null)
  const [nombre, setNombre] = useState("")
  const [subiendo, setSubiendo] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const porId = useMemo(() => new Map(marcas.map((m) => [m.id, m])), [marcas])
  const elegidas = seleccion.map((id) => porId.get(id)).filter((m): m is Marca => Boolean(m))
  const lleno = elegidas.length >= LIMITES.marcas

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return q ? marcas.filter((m) => m.nombre.toLowerCase().includes(q)) : marcas
  }, [marcas, busqueda])

  function alternar(id: string) {
    if (seleccion.includes(id)) onChange(seleccion.filter((x) => x !== id))
    else if (!lleno) onChange([...seleccion.filter((x) => porId.has(x)), id])
  }

  function mover(i: number, delta: number) {
    const ids = elegidas.map((m) => m.id)
    const j = i + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    onChange(ids)
  }

  function elegirArchivo(f: File | null) {
    if (!f) return
    setArchivo(f)
    // El nombre sugerido sale del archivo: "microsoft-copilot-logo.png" →
    // "Microsoft Copilot". Casi siempre hay que tocarlo poco o nada.
    if (!nombre) {
      const sugerido = f.name
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[-_]+/g, " ")
        .replace(/\b(logo|icon|isotipo|png|svg|color|full|horizontal|\d{3,4}(px)?)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\p{L}/gu, (l) => l.toUpperCase())
      setNombre(sugerido.slice(0, LIMITES.marcaNombre))
    }
  }

  async function subir() {
    if (!archivo || !nombre.trim()) return
    setSubiendo(true)
    try {
      const cuerpo = new FormData()
      cuerpo.set("nombre", nombre.trim())
      cuerpo.set("logo", archivo)
      const r = await fetch("/api/marketing/marcas", { method: "POST", body: cuerpo })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudo subir el logo")
      const marca = d.marca as Marca
      onMarcaCreada(marca)
      if (!lleno) onChange([...seleccion, marca.id])
      setArchivo(null)
      setNombre("")
      if (input.current) input.current.value = ""
      toast.success(`${marca.nombre} quedó en la biblioteca`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir el logo")
    } finally {
      setSubiendo(false)
    }
  }

  async function borrar(m: Marca) {
    if (!confirm(`¿Borrar “${m.nombre}” de la biblioteca?\n\nLos eventos y certificados que lo usan dejan de mostrar ese logo.`)) return
    try {
      const r = await fetch(`/api/marketing/marcas/${m.id}`, { method: "DELETE" })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "No se pudo borrar")
      onMarcaBorrada(m.id)
      onChange(seleccion.filter((x) => x !== m.id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo borrar")
    }
  }

  return (
    <div className="space-y-3">
      {/* ── Elegidas, en orden ── */}
      <div className="rounded-xl border border-line bg-surface-subtle p-2.5">
        {elegidas.length === 0 ? (
          <p className="px-1 py-2 text-[12px] text-ink-muted">Ninguna todavía. Elegilas de la biblioteca de abajo.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {elegidas.map((m, i) => (
              <div key={m.id} className="group flex items-center gap-1 rounded-lg border border-line bg-surface py-1 pl-1 pr-1.5 shadow-e1">
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="grid h-6 w-4 place-items-center text-ink-faint hover:text-ink disabled:opacity-0" title="Antes">
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <span className="grid h-8 w-14 place-items-center rounded-md bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.logoUrl} alt="" className="max-h-5 max-w-12 object-contain" />
                </span>
                <span className="max-w-28 truncate text-[11.5px] font-medium text-ink">{m.nombre}</span>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === elegidas.length - 1} className="grid h-6 w-4 place-items-center text-ink-faint hover:text-ink disabled:opacity-0" title="Después">
                  <ChevronRight className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => alternar(m.id)} className="grid h-6 w-5 place-items-center text-ink-faint hover:text-destructive" title="Sacar">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 px-1 font-mono text-[10.5px] text-ink-faint">
          {elegidas.length}/{LIMITES.marcas} · la primera es la protagonista
        </p>
      </div>

      {/* ── Biblioteca ── */}
      {marcas.length > 6 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en la biblioteca" className="pl-8" />
        </div>
      )}

      {filtradas.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {filtradas.map((m) => {
            const activa = seleccion.includes(m.id)
            return (
              <div key={m.id} className="group relative">
                <button
                  type="button"
                  onClick={() => alternar(m.id)}
                  disabled={!activa && lleno}
                  className={cn(
                    "flex w-full flex-col items-center gap-1.5 rounded-xl border p-2 transition-colors disabled:opacity-40",
                    activa ? "border-brand-400 bg-brand-50 shadow-e1" : "border-line bg-surface hover:border-line-strong"
                  )}
                >
                  <span className="grid h-10 w-full place-items-center rounded-md bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.logoUrl} alt="" className="max-h-6 max-w-[80%] object-contain" />
                  </span>
                  <span className={cn("w-full truncate text-center text-[11px]", activa ? "font-semibold text-brand-700" : "text-ink-secondary")}>
                    {m.nombre}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => borrar(m)}
                  className="absolute right-1 top-1 hidden h-6 w-6 place-items-center rounded-md bg-surface text-ink-faint shadow-e1 hover:text-destructive group-hover:grid"
                  title="Borrar de la biblioteca"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Subir una marca ── */}
      <input
        ref={input}
        type="file"
        accept="image/png,image/svg+xml,image/webp,image/jpeg"
        className="hidden"
        onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
      />
      {archivo ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/60 p-2.5">
          <span className="truncate text-[11.5px] text-ink-muted">{archivo.name}</span>
          <Input
            value={nombre}
            maxLength={LIMITES.marcaNombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de la marca"
            className="h-8 min-w-40 flex-1"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && subir()}
          />
          <Button type="button" size="sm" onClick={subir} disabled={subiendo || !nombre.trim()}>
            {subiendo && <Loader2 className="animate-spin" />}
            Agregar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setArchivo(null); setNombre("") }}>
            Cancelar
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-subtle p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-ink-muted shadow-e1">
            <ImagePlus className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[12.5px] font-medium text-ink">Subir un logo a la biblioteca</span>
            <span className="mt-0.5 block text-[11.5px] text-ink-muted">
              PNG con fondo transparente o SVG. Se recorta solo al borde del dibujo.
            </span>
          </span>
        </button>
      )}
    </div>
  )
}
