"use client"

import { useCallback, useEffect, useState } from "react"
import { Download, Image as ImageIcon, Loader2, RotateCcw, Sparkles, Wand2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Plantilla } from "@/lib/plantillas"
import { SISTEMA_LABEL, type SistemaVisual } from "@/lib/sistema-visual"

/**
 * El prompt de imagen deja de ser texto para llevarse a otro lado.
 *
 * Antes este bloque decía "pegalo en DALL·E o Midjourney": la pieza quedaba a
 * medias y el paso que faltaba pasaba por una herramienta donde el sistema
 * visual de la marca ya no aplica. Ahora se genera acá, con el mismo bloque de
 * estilo que usan todas las demás piezas, y lo que sale es descargable.
 *
 * La imagen NO se guarda en la base: son ~1 MB en base64 por pieza y la tabla
 * de slots guarda texto. Vive en la sesión hasta que se descarga.
 */

type Proporcion = "square" | "portrait" | "landscape"

const PROPORCIONES: { id: Proporcion; label: string; nota: string; alto: string }[] = [
  { id: "square", label: "1:1", nota: "Feed", alto: "aspect-square" },
  { id: "portrait", label: "4:5", nota: "Vertical", alto: "aspect-[4/5]" },
  { id: "landscape", label: "16:9", nota: "Apaisada", alto: "aspect-video" },
]

export function ImagenGenerada({
  prompt,
  imagen,
  onImagen,
  sistema = "accedra",
  proporcionFija,
}: {
  prompt: string
  /** La imagen vive en el panel, no acá: la vista previa también la necesita. */
  imagen: string | null
  onImagen: (dataUrl: string) => void
  /**
   * La medida que impone el canal. Cuando viene, el selector desaparece.
   *
   * La proporción de una pieza no es una preferencia de quien la genera: es la
   * medida del feed donde se publica. Dejarla a mano era la forma de terminar
   * con una pieza de LinkedIn en 4:5.
   */
  proporcionFija?: Proporcion
  /**
   * Con qué sistema visual se genera. En "feed" el prompt ya viene entero y
   * autosuficiente: no hay plantilla de referencia que elegir ni bloque de
   * estilo que pegarle atrás, así que el selector directamente no aparece.
   */
  sistema?: SistemaVisual
}) {
  const [elegidaPorMano, setElegidaPorMano] = useState<Proporcion>("square")
  const proporcion = proporcionFija ?? elegidaPorMano
  const [generando, setGenerando] = useState(false)
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [elegida, setElegida] = useState<string | null>(null)
  const [porQue, setPorQue] = useState<string | null>(null)
  const [recomendando, setRecomendando] = useState(false)

  /**
   * Antes de generar, el sistema elige la plantilla. Es una llamada de texto
   * corta contra el "cuándo usar" de cada una; el usuario puede cambiarla, pero
   * arranca con una propuesta en vez de con una grilla y ninguna pista.
   */
  const recomendar = useCallback(async () => {
    setRecomendando(true)
    try {
      const r = await fetch("/api/contenido/plantillas?activas=1")
      const d = await r.json()
      const lista: Plantilla[] = d.plantillas ?? []
      setPlantillas(lista)
      if (lista.length === 0) return

      const rec = await fetch("/api/contenido/plantillas/recomendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pieza: prompt }),
      })
      const datos = await rec.json()
      setElegida(datos.plantillaId ?? lista[0].id)
      setPorQue(datos.porQue ?? null)
    } catch {
      // Sin recomendación se genera igual, sin referencia. Que falle la
      // sugerencia no puede bloquear la producción de la pieza.
    } finally {
      setRecomendando(false)
    }
  }, [prompt])

  useEffect(() => {
    if (!imagen && sistema === "accedra") recomendar()
  }, [imagen, recomendar, sistema])

  const forma = PROPORCIONES.find((p) => p.id === proporcion)!

  async function generar() {
    setGenerando(true)
    try {
      const res = await fetch("/api/contenido/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          sistema === "feed"
            ? { prompt, size: proporcion, sistema: "feed" }
            : { prompt, size: proporcion, plantillaId: elegida ?? undefined }
        ),
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
          {/* Cuál de los dos sistemas está generando. Sin esto, dos piezas que
              salieron distintas no se pueden atribuir a nada. */}
          <span className="shrink-0 rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
            {SISTEMA_LABEL[sistema]}
          </span>
        </div>

        {/* La proporción se elige antes de gastar una generación, no después —
            salvo que la imponga el canal, y entonces no se elige. */}
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

          {sistema === "accedra" && (
            <SelectorPlantilla
              plantillas={plantillas}
              elegida={elegida}
              porQue={porQue}
              cargando={recomendando}
              onElegir={(id) => {
                setElegida(id)
                setPorQue(null)
              }}
            />
          )}

          <Button size="sm" className="mt-3" onClick={generar} disabled={generando}>
            {generando ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {generando ? "Generando…" : "Generar imagen"}
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Qué plantilla va a copiar la imagen.
 *
 * La recomendada viene marcada con su motivo. Se puede cambiar de un click: una
 * recomendación que no se puede desoír es una imposición, y el que produce la
 * pieza suele saber algo que el modelo no.
 */
function SelectorPlantilla({
  plantillas,
  elegida,
  porQue,
  cargando,
  onElegir,
}: {
  plantillas: Plantilla[]
  elegida: string | null
  porQue: string | null
  cargando: boolean
  onElegir: (id: string) => void
}) {
  if (cargando) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-muted">
        <Loader2 className="h-3 w-3 animate-spin" />
        Eligiendo la plantilla…
      </p>
    )
  }

  if (plantillas.length === 0) {
    return (
      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-muted">
        No hay plantillas cargadas. La imagen se va a generar sin referencia visual —{" "}
        <a href="/contenido/plantillas" className="font-medium text-brand-600 hover:underline">
          subí algunas
        </a>{" "}
        y las piezas van a parecer de la misma marca.
      </p>
    )
  }

  return (
    <div className="mt-3">
      <p className="eyebrow mb-2 flex items-center gap-1.5">
        <Wand2 className="h-3 w-3" />
        Plantilla
      </p>

      <div className="flex flex-wrap gap-2">
        {plantillas.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onElegir(p.id)}
            title={p.cuandoUsar ?? p.nombre}
            className={cn(
              "relative h-16 w-16 overflow-hidden rounded-lg border-2 transition-all",
              elegida === p.id
                ? "border-brand-600 shadow-e1"
                : "border-line opacity-70 hover:opacity-100"
            )}
          >
            {p.url && (
              // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal
              <img src={p.url} alt={p.nombre} className="h-full w-full object-cover" />
            )}
          </button>
        ))}
      </div>

      {porQue && (
        <p className="mt-2 rounded-lg bg-brand-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-brand-700">
          {porQue}
        </p>
      )}
    </div>
  )
}
