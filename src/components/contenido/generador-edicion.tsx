"use client"

import { useEffect, useRef, useState } from "react"
import { Brush, Eraser, Loader2, Undo2, Wand2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Campo, Modal, Segmentado } from "@/components/contenido/generador-ui"
import {
  FAMILIAS_LOGO,
  POSICIONES_LOGO,
  TAMANOS_LOGO,
  TONOS_LOGO,
  archivoLogo,
  cajaLogo,
  type ConfigLogo,
  type ImagenGenerada,
} from "@/lib/generador"
import { cn } from "@/lib/utils"

/* ── Logo ─────────────────────────────────────────────────────────────────── */

type TonoVisible = "navy" | "blanco"

/** El fondo sobre el que se muestra cada tono en las tarjetas, como se usaría de verdad. */
const FONDO_TONO: Record<string, string> = {
  navy: "bg-white",
  blanco: "bg-navy-950",
  "placa-navy": "bg-surface-muted",
  "placa-azul": "bg-surface-muted",
}

/**
 * El tono que va a elegir el servidor con "Automático", calculado acá con la
 * misma regla: brillo medio de la zona donde cae el logo. Sin imagen (al
 * generar todavía no hay una) o si no se deja leer, se asume fondo oscuro.
 */
function useTonoAuto(url: string | null | undefined, ancho: number, alto: number, config: ConfigLogo): TonoVisible {
  const [tono, setTono] = useState<TonoVisible>("blanco")
  useEffect(() => {
    if (!url || config.tono !== "auto") return
    const el = new Image()
    el.crossOrigin = "anonymous"
    el.onload = () => {
      try {
        const caja = cajaLogo(ancho, alto, config)
        const canvas = document.createElement("canvas")
        canvas.width = 32
        canvas.height = 32
        const ctx = canvas.getContext("2d")!
        const k = el.naturalWidth / ancho
        ctx.drawImage(el, caja.left * k, caja.top * k, caja.w * k, caja.h * k, 0, 0, 32, 32)
        const d = ctx.getImageData(0, 0, 32, 32).data
        let suma = 0
        for (let i = 0; i < d.length; i += 4) suma += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
        setTono(suma / (d.length / 4) > 150 ? "navy" : "blanco")
      } catch {
        setTono("blanco")
      }
    }
    el.src = url
  }, [url, ancho, alto, config])
  return tono
}

/**
 * El lienzo del logo: la imagen (o un fondo neutro con la proporción del
 * formato) con las seis posiciones posibles marcadas. La elegida muestra el
 * logo tal como va a salir; las otras se ven punteadas y al pasar el mouse
 * muestran cómo quedaría ahí. Un click la elige.
 */
export function LienzoLogo({
  ancho,
  alto,
  fondoUrl,
  config,
  onCambio,
  altoMax,
  className,
}: {
  ancho: number
  alto: number
  fondoUrl?: string | null
  config: ConfigLogo
  onCambio: (c: ConfigLogo) => void
  /**
   * Alto máximo, como largo CSS ("62vh", "224px"). El ancho se calcula desde acá:
   * un `max-height` suelto achicaba el alto pero dejaba el ancho al 100%, y la
   * imagen se recortaba con otra proporción que la real.
   */
  altoMax?: string
  className?: string
}) {
  const auto = useTonoAuto(fondoUrl, ancho, alto, config)
  const tono = config.tono === "auto" ? (fondoUrl ? auto : "blanco") : config.tono
  const archivo = archivoLogo(config.familia, tono)
  const pct = (n: number, total: number) => `${(n / total) * 100}%`

  return (
    <div
      className={cn(
        "relative mx-auto overflow-hidden rounded-lg border border-line",
        !fondoUrl && "bg-gradient-to-br from-navy-950 via-navy-900 to-n-600",
        className
      )}
      style={{
        aspectRatio: `${ancho} / ${alto}`,
        width: altoMax ? `min(100%, calc(${altoMax} * ${ancho / alto}))` : "100%",
      }}
    >
      {fondoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fondoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {POSICIONES_LOGO.map((p) => {
        const caja = cajaLogo(ancho, alto, { ...config, posicion: p.id })
        const elegida = config.posicion === p.id
        return (
          <button
            key={p.id}
            type="button"
            title={p.nombre}
            aria-label={`Logo ${p.nombre}`}
            aria-pressed={elegida}
            onClick={() => onCambio({ ...config, posicion: p.id })}
            className={cn(
              "group absolute flex items-center justify-center rounded-[3px] transition-[outline-color,background-color]",
              elegida
                ? "outline outline-2 outline-offset-2 outline-brand-400"
                : "outline outline-1 outline-dashed outline-white/60 hover:bg-white/10 hover:outline-white"
            )}
            style={{
              left: pct(caja.left, ancho),
              top: pct(caja.top, alto),
              width: pct(caja.w, ancho),
              height: pct(caja.h, alto),
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={archivo}
              alt=""
              className={cn(
                "h-full w-full object-contain transition-opacity",
                elegida ? "opacity-100" : "opacity-0 group-hover:opacity-50"
              )}
            />
          </button>
        )
      })}
    </div>
  )
}

/**
 * Los controles del logo, todos visuales: la versión y el color se eligen
 * mirando el logo real, y la posición tocándola en el lienzo.
 */
export function CamposLogo({
  valor,
  onCambio,
  ancho,
  alto,
  conLienzo = true,
}: {
  valor: ConfigLogo
  onCambio: (c: ConfigLogo) => void
  ancho: number
  alto: number
  conLienzo?: boolean
}) {
  // Las tarjetas de versión muestran el logo en el color elegido (navy si es automático).
  const tonoMuestra = valor.tono === "auto" ? "navy" : valor.tono

  return (
    <div className="space-y-4">
      {conLienzo && (
        <Campo etiqueta="Posición" ayuda="Tocá dónde va">
          <LienzoLogo ancho={ancho} alto={alto} config={valor} onCambio={onCambio} altoMax="224px" />
        </Campo>
      )}

      <Campo etiqueta="Versión">
        <div className="grid grid-cols-2 gap-1.5">
          {FAMILIAS_LOGO.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onCambio({ ...valor, familia: f.id })}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors",
                valor.familia === f.id
                  ? "border-brand-400 ring-2 ring-brand-200"
                  : "border-line hover:border-line-strong"
              )}
            >
              <span
                className={cn("flex h-12 w-full items-center justify-center rounded-md px-2", FONDO_TONO[tonoMuestra])}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={archivoLogo(f.id, tonoMuestra)} alt="" className="max-h-9 max-w-full object-contain" />
              </span>
              <span className="text-[11px] font-medium text-ink-secondary">{f.nombre}</span>
            </button>
          ))}
        </div>
      </Campo>

      <Campo etiqueta="Color">
        <div className="grid grid-cols-5 gap-1.5">
          {TONOS_LOGO.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.nombre}
              onClick={() => onCambio({ ...valor, tono: t.id })}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border p-1 transition-colors",
                valor.tono === t.id ? "border-brand-400 ring-2 ring-brand-200" : "border-line hover:border-line-strong"
              )}
            >
              {t.id === "auto" ? (
                <span className="flex h-9 w-full overflow-hidden rounded-md">
                  <span className="flex flex-1 items-center justify-center bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={archivoLogo("isotipo", "navy")} alt="" className="h-5 w-5" />
                  </span>
                  <span className="flex flex-1 items-center justify-center bg-navy-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={archivoLogo("isotipo", "blanco")} alt="" className="h-5 w-5" />
                  </span>
                </span>
              ) : (
                <span className={cn("flex h-9 w-full items-center justify-center rounded-md p-1", FONDO_TONO[t.id])}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={archivoLogo("isotipo", t.id)} alt="" className="max-h-7 max-w-full object-contain" />
                </span>
              )}
              <span className="text-center text-[10px] leading-tight text-ink-muted">{t.nombre}</span>
            </button>
          ))}
        </div>
      </Campo>

      <Campo etiqueta="Tamaño">
        <Segmentado
          opciones={TAMANOS_LOGO.map((t) => ({ id: t.id, nombre: t.nombre }))}
          valor={valor.tamano}
          onCambio={(tamano) => onCambio({ ...valor, tamano })}
        />
      </Campo>
    </div>
  )
}

export function DialogoLogo({
  img,
  config,
  onConfig,
  trabajando,
  onCerrar,
  onAplicar,
}: {
  img: ImagenGenerada | null
  config: ConfigLogo
  onConfig: (c: ConfigLogo) => void
  trabajando: boolean
  onCerrar: () => void
  onAplicar: () => void
}) {
  return (
    <Modal
      abierto={img !== null}
      titulo="Agregar logo"
      descripcion="Tocá en la imagen dónde va. Se compone el archivo oficial del Brand Kit, sin IA: sale al instante y la original no cambia."
      onCerrar={onCerrar}
      ancho="max-w-5xl"
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={onAplicar} disabled={trabajando}>
            {trabajando && <Loader2 className="animate-spin" />} Aplicar logo
          </Button>
        </>
      }
    >
      {img && (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex items-start justify-center">
            <LienzoLogo
              ancho={img.ancho}
              alto={img.alto}
              fondoUrl={img.url}
              config={config}
              onCambio={onConfig}
              altoMax="62vh"
            />
          </div>
          <CamposLogo valor={config} onCambio={onConfig} ancho={img.ancho} alto={img.alto} conLienzo={false} />
        </div>
      )}
    </Modal>
  )
}

/* ── Editar una zona ──────────────────────────────────────────────────────── */

/** Lado mayor de la máscara. Más no aporta: el servidor la escala y la difumina. */
const LADO_MASCARA = 1024

/**
 * Editor de zona: se pinta sobre la imagen lo que hay que cambiar.
 *
 * El trazo se dibuja en un canvas a la resolución de la máscara, apoyado encima
 * de la imagen. Al aplicar, cualquier píxel pintado pasa a blanco y el resto a
 * negro: esa es la máscara que viaja al servidor.
 */
export function DialogoZona({
  img,
  trabajando,
  onCerrar,
  onAplicar,
}: {
  img: ImagenGenerada | null
  trabajando: boolean
  onCerrar: () => void
  onAplicar: (instruccion: string, mascara: string) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const historial = useRef<ImageData[]>([])
  const pintando = useRef(false)
  const ultimo = useRef<{ x: number; y: number } | null>(null)
  const [pincel, setPincel] = useState(6) // % del lado menor
  const [borrador, setBorrador] = useState(false)
  const [instruccion, setInstruccion] = useState("")
  const [hayTrazo, setHayTrazo] = useState(false)

  const escala = img ? Math.min(1, LADO_MASCARA / Math.max(img.ancho, img.alto)) : 1
  const W = img ? Math.round(img.ancho * escala) : 0
  const H = img ? Math.round(img.alto * escala) : 0

  useEffect(() => {
    if (!img) return
    historial.current = []
    setInstruccion("")
    setHayTrazo(false)
    setBorrador(false)
  }, [img])

  function punto(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }

  function trazo(a: { x: number; y: number }, b: { x: number; y: number }) {
    const ctx = canvas.current!.getContext("2d")!
    ctx.globalCompositeOperation = borrador ? "destination-out" : "source-over"
    ctx.strokeStyle = "rgba(255, 40, 40, 1)"
    ctx.lineWidth = (Math.min(W, H) * pincel) / 100
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }

  function empezar(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvas.current!.getContext("2d")!
    historial.current.push(ctx.getImageData(0, 0, W, H))
    if (historial.current.length > 30) historial.current.shift()
    pintando.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = punto(e)
    ultimo.current = p
    trazo(p, p)
    if (!borrador) setHayTrazo(true)
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!pintando.current || !ultimo.current) return
    const p = punto(e)
    trazo(ultimo.current, p)
    ultimo.current = p
  }

  function terminar() {
    pintando.current = false
    ultimo.current = null
  }

  function deshacer() {
    const previo = historial.current.pop()
    if (previo) canvas.current!.getContext("2d")!.putImageData(previo, 0, 0)
  }

  function limpiar() {
    const ctx = canvas.current!.getContext("2d")!
    historial.current.push(ctx.getImageData(0, 0, W, H))
    ctx.clearRect(0, 0, W, H)
    setHayTrazo(false)
  }

  function aplicar() {
    const datos = canvas.current!.getContext("2d")!.getImageData(0, 0, W, H)
    const salida = document.createElement("canvas")
    salida.width = W
    salida.height = H
    const ctx = salida.getContext("2d")!
    const mascara = ctx.createImageData(W, H)
    let pintados = 0
    for (let i = 0; i < datos.data.length; i += 4) {
      const v = datos.data[i + 3] > 20 ? 255 : 0
      if (v) pintados++
      mascara.data[i] = mascara.data[i + 1] = mascara.data[i + 2] = v
      mascara.data[i + 3] = 255
    }
    if (pintados === 0) return
    ctx.putImageData(mascara, 0, 0)
    onAplicar(instruccion.trim(), salida.toDataURL("image/png"))
  }

  return (
    <Modal
      abierto={img !== null}
      titulo="Editar una zona"
      descripcion="Pintá lo que querés cambiar y decí qué poner. Lo que no pintes queda exactamente igual."
      onCerrar={onCerrar}
      ancho="max-w-5xl"
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={aplicar} disabled={trabajando || !hayTrazo || !instruccion.trim()}>
            {trabajando ? <Loader2 className="animate-spin" /> : <Wand2 />} Aplicar a la zona
          </Button>
        </>
      }
    >
      {img && (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
          <div
            className="relative mx-auto select-none overflow-hidden rounded-lg border border-line"
            // El ancho sale del alto máximo: con `maxHeight` suelto la caja perdía la
            // proporción y el trazo caía corrido respecto de la imagen.
            style={{
              aspectRatio: `${img.ancho} / ${img.alto}`,
              width: `min(100%, calc(65vh * ${img.ancho / img.alto}))`,
            }}
          >
            {img.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img.url}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />
            )}
            <canvas
              ref={canvas}
              width={W}
              height={H}
              onPointerDown={empezar}
              onPointerMove={mover}
              onPointerUp={terminar}
              onPointerCancel={terminar}
              className="absolute inset-0 h-full w-full cursor-crosshair touch-none opacity-50"
            />
          </div>

          <div className="space-y-4">
            <Campo etiqueta="Herramienta">
              <Segmentado
                opciones={[
                  { id: "pincel", nombre: "Pincel" },
                  { id: "borrador", nombre: "Borrador" },
                ]}
                valor={borrador ? "borrador" : "pincel"}
                onCambio={(v) => setBorrador(v === "borrador")}
              />
            </Campo>
            <Campo etiqueta="Grosor" ayuda={`${pincel}%`}>
              <input
                type="range"
                min={1}
                max={20}
                value={pincel}
                onChange={(e) => setPincel(Number(e.target.value))}
                className="w-full accent-[var(--color-primary)]"
              />
            </Campo>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={deshacer}>
                <Undo2 /> Deshacer
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={limpiar}>
                {borrador ? <Brush /> : <Eraser />} Limpiar
              </Button>
            </div>
            <Campo etiqueta="¿Qué va en esa zona?">
              <Textarea
                value={instruccion}
                onChange={(e) => setInstruccion(e.target.value)}
                rows={4}
                placeholder="Ej.: reemplazá la taza por una notebook cerrada"
              />
            </Campo>
          </div>
        </div>
      )}
    </Modal>
  )
}
