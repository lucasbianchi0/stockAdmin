"use client"

import { useEffect, useRef, useState } from "react"
import type React from "react"
import { createPortal } from "react-dom"
import { ImagePlus, X } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

/** Piezas chicas que comparten los dos generadores. */

export const CLASE_SELECT =
  "h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink hover:border-n-400 focus-visible:border-brand-400 focus-visible:outline-none"

export function Campo({
  etiqueta,
  ayuda,
  children,
  className,
}: {
  etiqueta: string
  ayuda?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-ink-secondary">{etiqueta}</span>
        {ayuda && <span className="text-[11px] text-ink-faint">{ayuda}</span>}
      </div>
      {children}
    </div>
  )
}

/** Control segmentado de pocas opciones, con el mismo look que las tabs. */
export function Segmentado<T extends string | number>({
  opciones,
  valor,
  onCambio,
  className,
}: {
  opciones: Array<{ id: T; nombre: string; titulo?: string }>
  valor: T
  onCambio: (v: T) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "inline-flex h-9 w-full items-center gap-0.5 rounded-lg border border-line bg-surface-muted p-[3px]",
        className
      )}
    >
      {opciones.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          title={o.titulo}
          onClick={() => onCambio(o.id)}
          className={cn(
            "h-full flex-1 rounded-md px-2 text-[12.5px] font-medium text-ink-muted transition-[background-color,color,box-shadow] duration-150 hover:text-ink-secondary",
            valor === o.id && "bg-surface font-semibold text-ink shadow-e1"
          )}
        >
          {o.nombre}
        </button>
      ))}
    </div>
  )
}

/** Baja un archivo al disco. La URL firmada es de otro origen: `download` solo no alcanza. */
export async function descargar(fuente: string | Blob, nombre: string) {
  const blob = typeof fuente === "string" ? await (await fetch(fuente)).blob() : fuente
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Lee el `{ error }` de una respuesta fallida, o un mensaje genérico. */
export async function errorDe(res: Response, fallback: string): Promise<string> {
  try {
    const cuerpo = (await res.json()) as { error?: string }
    return cuerpo.error ?? fallback
  } catch {
    return fallback
  }
}

/** Diálogo centrado, con el mismo velo que el resto de Contenido. */
export function Modal({
  abierto,
  titulo,
  descripcion,
  onCerrar,
  children,
  pie,
  ancho = "max-w-3xl",
}: {
  abierto: boolean
  titulo: string
  descripcion?: string
  onCerrar: () => void
  children: React.ReactNode
  pie?: React.ReactNode
  ancho?: string
}) {
  if (!abierto) return null
  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onKeyDown={(e) => e.key === "Escape" && onCerrar()}
      >
        <div
          className="absolute inset-0 bg-navy-950/45 backdrop-blur-[2px] animate-in fade-in-0 duration-200"
          onClick={onCerrar}
        />
        <div
          className={cn(
            "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-e3 animate-in fade-in-0 zoom-in-95 duration-200 sm:rounded-2xl",
            ancho
          )}
        >
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">{titulo}</h2>
            {descripcion && <p className="mt-0.5 text-[12.5px] text-ink-muted">{descripcion}</p>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
          {pie && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{pie}</div>}
        </div>
      </div>
    </Portal>
  )
}

/**
 * Monta a los hijos directamente en el <body>.
 *
 * Los diálogos se abren desde el panel del pedido, que es `sticky`, y un
 * elemento sticky arma su propia capa: adentro de ella, ningún z-index alcanza
 * para quedar arriba de lo que viene después en la página. Pasó: las miniaturas
 * de "recientes" se dibujaban encima del diálogo de guardar template.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  return montado ? createPortal(children, document.body) : null
}

/**
 * Achica una imagen en el navegador antes de subirla.
 *
 * Una foto de celular pesa 4–8 MB y el cuerpo de una función de Vercel corta en
 * 4,5. A 1536 px de lado el modelo ve todo lo que necesita y cuatro referencias
 * entran holgadas en un pedido.
 */
export async function achicar(archivo: Blob, lado = 1536): Promise<string> {
  const bitmap = await createImageBitmap(archivo)
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL("image/jpeg", 0.88)
}

/** Una imagen de referencia: la que ya está guardada lleva su ruta; la nueva, solo el data URL. */
export type RefItem = { src: string; ruta?: string }

/** Grilla de miniaturas con botón de subir y arrastrar. */
export function SubidorReferencias({
  items,
  onCambio,
  maximo,
}: {
  items: RefItem[]
  onCambio: (items: RefItem[]) => void
  maximo: number
}) {
  const input = useRef<HTMLInputElement>(null)

  async function agregar(archivos: FileList | null) {
    if (!archivos?.length) return
    const lugar = maximo - items.length
    if (lugar <= 0) return toast.error(`Hasta ${maximo} imágenes`)
    try {
      const nuevas = await Promise.all(
        Array.from(archivos)
          .filter((a) => a.type.startsWith("image/"))
          .slice(0, lugar)
          .map((a) => achicar(a))
      )
      onCambio([...items, ...nuevas.map((src) => ({ src }))])
    } catch {
      toast.error("No se pudo leer una de las imágenes")
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((r, i) => (
        <div key={r.ruta ?? r.src.slice(-40) + i} className="group relative h-16 w-16 overflow-hidden rounded-lg border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.src} alt={`Referencia ${i + 1}`} className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onCambio(items.filter((_, j) => j !== i))}
            className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Quitar imagen"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      {items.length < maximo && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            agregar(e.dataTransfer.files)
          }}
          className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong text-ink-faint transition-colors hover:border-brand-400 hover:text-brand-600"
        >
          <ImagePlus className="h-4 w-4" />
          <span className="text-[10px] font-medium">Subir</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          agregar(e.target.files)
          e.target.value = ""
        }}
      />
    </div>
  )
}
