"use client"

import { useState } from "react"
import { Download, Image as ImageIcon, Loader2, RotateCcw, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * La imagen de una pieza del feed (camino 2).
 *
 * Se genera acá con el mismo prompt del template que arma el servidor, y lo que
 * sale es descargable. NO se guarda en la base desde este componente: son ~1 MB
 * en base64 por pieza; la persistencia la maneja el calendario. Vive en la sesión
 * hasta que se descarga o se guarda desde arriba.
 */

type Proporcion = "square" | "portrait" | "landscape"

const PROPORCIONES: { id: Proporcion; label: string; nota: string; alto: string }[] = [
  { id: "square", label: "1:1", nota: "Feed", alto: "aspect-square" },
  { id: "portrait", label: "4:5", nota: "Vertical", alto: "aspect-[4/5]" },
  { id: "landscape", label: "16:9", nota: "Apaisada", alto: "aspect-video" },
]

/**
 * Los dos motores del camino 2. ChatGPT (gpt-image-2) arranca elegido por el
 * bake-off del 14/8: tipografía más fina, texto literal y ~6× más barato.
 */
type ModeloFeed = "chatgpt" | "gemini"

const MODELOS_FEED: { id: ModeloFeed; label: string; nota: string }[] = [
  { id: "chatgpt", label: "ChatGPT", nota: "gpt-image-2 · texto más fino y más barato" },
  { id: "gemini", label: "Gemini", nota: "Nano Banana Pro · directo a Google" },
]

export function ImagenGenerada({
  prompt,
  imagen,
  onImagen,
  proporcionFija,
}: {
  prompt: string
  /** La imagen vive en el panel, no acá: la vista previa también la necesita. */
  imagen: string | null
  onImagen: (dataUrl: string) => void
  /**
   * La medida que impone el canal. Cuando viene, el selector desaparece: la
   * proporción de una pieza no es una preferencia, es la medida del feed donde se
   * publica.
   */
  proporcionFija?: Proporcion
}) {
  const [elegidaPorMano, setElegidaPorMano] = useState<Proporcion>("square")
  const proporcion = proporcionFija ?? elegidaPorMano
  const [modeloFeed, setModeloFeed] = useState<ModeloFeed>("chatgpt")
  const [generando, setGenerando] = useState(false)

  const forma = PROPORCIONES.find((p) => p.id === proporcion)!

  async function generar() {
    setGenerando(true)
    try {
      const res = await fetch("/api/contenido/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, size: proporcion, sistema: "feed", modelo: modeloFeed }),
      })
      const data = (await res.json()) as { image?: string; error?: string }
      if (!res.ok || !data.image) throw new Error(data.error ?? "No se pudo generar")
      onImagen(data.image)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar la imagen")
    } finally {
      setGenerando(false)
    }
  }

  function descargar() {
    if (!imagen) return
    const a = document.createElement("a")
    a.href = imagen
    a.download = `accedra-${proporcion}-${Date.now()}.jpg`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-subtle px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <ImageIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint" strokeWidth={2} />
          <p className="truncate text-[11.5px] font-semibold text-ink-secondary">Imagen</p>
          <span className="shrink-0 rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
            Feed 1080
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Con qué motor se genera. Vive en el header para que valga también
              al pedir "Otra versión", no solo en la primera generación. */}
          <div className="flex items-center gap-1" title="Modelo de imagen">
            {MODELOS_FEED.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModeloFeed(m.id)}
                disabled={generando}
                title={m.nota}
                className={cn(
                  "rounded-md px-2 py-1 text-[10.5px] font-semibold transition-colors",
                  modeloFeed === m.id
                    ? "bg-brand-600 text-white"
                    : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* La proporción se elige antes de gastar una generación — salvo que la
              imponga el canal, y entonces no se elige. */}
          {proporcionFija ? (
            <span
              className="shrink-0 rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-ink-muted"
              title={`${forma.nota} — lo fija el canal`}
            >
              {forma.label}
            </span>
          ) : (
            <div className="flex items-center gap-1">
              {PROPORCIONES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setElegidaPorMano(p.id)}
                  disabled={generando}
                  title={p.nota}
                  className={cn(
                    "rounded-md px-2 py-1 text-[10.5px] font-semibold tabular-nums transition-colors",
                    proporcion === p.id
                      ? "bg-brand-600 text-white"
                      : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {imagen ? (
        <div className="p-4">
          <div className={cn("relative w-full overflow-hidden rounded-lg border border-line", forma.alto)}>
            {/* eslint-disable-next-line @next/next/no-img-element --
              La imagen es un data: URL generado en runtime. next/image no puede
              optimizar un base64 y su parseo de src rechaza estos casos: acá el
              <img> plano no es un atajo, es lo correcto. */}
            <img
              src={imagen}
              alt="Imagen generada para la publicación"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={descargar}>
              <Download />
              Descargar
            </Button>
            <Button size="sm" variant="outline" onClick={generar} disabled={generando}>
              {generando ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Otra versión
            </Button>
            <span className="text-[11px] text-ink-faint">
              No se guarda: descargala antes de cerrar.
            </span>
          </div>
        </div>
      ) : (
        <div className="p-4">
          <p className="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-ink-secondary">
            {prompt}
          </p>

          <Button size="sm" className="mt-3" onClick={generar} disabled={generando}>
            {generando ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {generando ? "Generando…" : "Generar imagen"}
          </Button>
        </div>
      )}
    </div>
  )
}
