"use client"

import { useRef, useState } from "react"
import { Check, Loader2, Sparkles, Upload, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Plantilla } from "@/lib/plantillas"

/**
 * Crear un template a partir de una pieza que te gusta.
 *
 * subir → leer la estructura → probarla con contenido de Accedra → guardar
 *
 * Lo que se toma de la pieza ajena es SOLO cómo está armada: proporciones,
 * distribución, tipo de fondo. Nunca el color, el logo ni el contenido — eso es
 * de la marca original, y copiarlo sería publicar su pieza repintada.
 *
 * La receta queda editable a propósito: la lectura automática acierta al 80% y
 * el 20% que falla se corrige en dos líneas, en vez de descartar la plantilla.
 */

type Paso = "vacio" | "leyendo" | "receta" | "probando"

const TITULAR_PRUEBA = "Las caídas de red pasaron de 5 por semana a 1 por mes"
const SUJETO_PRUEBA = "un rack de red ordenado en una sala técnica real, luz natural, sin personas"

export function CrearTemplate({ onGuardada }: { onGuardada: (p: Plantilla) => void }) {
  const [paso, setPaso] = useState<Paso>("vacio")
  const [archivo, setArchivo] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const [nombre, setNombre] = useState("")
  const [cuandoUsar, setCuandoUsar] = useState("")
  const [composicion, setComposicion] = useState("")

  const [titular, setTitular] = useState(TITULAR_PRUEBA)
  const [sujeto, setSujeto] = useState(SUJETO_PRUEBA)
  const [prueba, setPrueba] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const input = useRef<HTMLInputElement>(null)

  function reiniciar() {
    setPaso("vacio")
    setArchivo(null)
    setPreview(null)
    setNombre("")
    setCuandoUsar("")
    setComposicion("")
    setPrueba(null)
    if (input.current) input.current.value = ""
  }

  async function analizar(f: File) {
    setArchivo(f)
    setPreview(URL.createObjectURL(f))
    setPaso("leyendo")
    try {
      const form = new FormData()
      form.append("archivo", f)
      const r = await fetch("/api/contenido/templates/analizar", { method: "POST", body: form })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudo leer")

      setNombre(d.nombre)
      setCuandoUsar(d.cuandoUsar)
      setComposicion(d.composicion)
      setPaso("receta")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer la estructura")
      reiniciar()
    }
  }

  async function probar() {
    setPaso("probando")
    setPrueba(null)
    try {
      const r = await fetch("/api/contenido/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ composicion, titular, sujeto, prompt: titular, size: "portrait" }),
      })
      const d = await r.json()
      if (!r.ok || !d.image) throw new Error(d.error ?? "No se pudo generar")
      setPrueba(d.image)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar la prueba")
    } finally {
      setPaso("receta")
    }
  }

  async function guardar() {
    if (!archivo) return
    setGuardando(true)
    try {
      const form = new FormData()
      form.append("archivo", archivo)
      form.append("nombre", nombre)
      form.append("cuandoUsar", cuandoUsar)
      form.append("composicion", composicion)
      const r = await fetch("/api/contenido/plantillas", { method: "POST", body: form })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar")
      onGuardada(d.plantilla)
      toast.success("Template guardado")
      reiniciar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Crear un template desde una pieza</p>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-ink-muted">
            Subí una pieza cuya estructura te guste. Se lee cómo está armada —proporciones,
            distribución, tipo de fondo— y se descarta todo lo demás: color, logos y contenido son
            de esa marca, no de Accedra.
          </p>
        </div>
        {paso !== "vacio" && (
          <Button variant="ghost" size="icon-sm" onClick={reiniciar}>
            <X />
            <span className="sr-only">Empezar de nuevo</span>
          </Button>
        )}
      </div>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) analizar(f)
        }}
      />

      {paso === "vacio" && (
        <Button className="mt-4" onClick={() => input.current?.click()}>
          <Upload />
          Elegir una pieza
        </Button>
      )}

      {paso === "leyendo" && (
        <p className="mt-4 flex items-center gap-2 text-[12.5px] text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Leyendo la estructura…
        </p>
      )}

      {(paso === "receta" || paso === "probando") && (
        <div className="mt-4 grid gap-5 lg:grid-cols-[200px_1fr]">
          <div className="space-y-3">
            {preview && (
              <figure>
                <p className="eyebrow mb-1.5">La pieza</p>
                {/* eslint-disable-next-line @next/next/no-img-element -- blob local */}
                <img src={preview} alt="" className="w-full rounded-lg border border-line" />
              </figure>
            )}
            {prueba && (
              <figure>
                <p className="eyebrow mb-1.5 text-brand-700">Con la estructura</p>
                {/* eslint-disable-next-line @next/next/no-img-element -- data: URL de runtime */}
                <img src={prueba} alt="" className="w-full rounded-lg border-2 border-brand-300" />
              </figure>
            )}
          </div>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-ink-secondary">Nombre</span>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-ink-secondary">
                  Cuándo usarla
                </span>
                <Textarea
                  value={cuandoUsar}
                  onChange={(e) => setCuandoUsar(e.target.value)}
                  rows={2}
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-secondary">
                Estructura leída{" "}
                <span className="font-normal text-ink-faint">— editala si algo no cierra</span>
              </span>
              <Textarea
                value={composicion}
                onChange={(e) => setComposicion(e.target.value)}
                rows={9}
                className="font-mono text-[11.5px]"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-ink-secondary">
                  Titular de prueba
                </span>
                <Input value={titular} onChange={(e) => setTitular(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-ink-secondary">
                  Qué muestra la foto
                </span>
                <Input value={sujeto} onChange={(e) => setSujeto(e.target.value)} />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Button variant="outline" size="sm" onClick={probar} disabled={paso === "probando"}>
                {paso === "probando" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {prueba ? "Probar otra vez" : "Probar la estructura"}
              </Button>

              <Button size="sm" onClick={guardar} disabled={guardando || !prueba}>
                {guardando ? <Loader2 className="animate-spin" /> : <Check />}
                Guardar como template
              </Button>

              {!prueba && (
                <span className="text-[11.5px] text-ink-muted">
                  Probala antes de guardar: es el punto de la pantalla.
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
