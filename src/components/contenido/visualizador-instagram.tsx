"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  DetalleInstagram,
  GrillaInstagram,
  type Celda,
  type SlotFeed,
} from "@/components/contenido/feed-previa"
import { ordenDeLectura } from "@/lib/secuencia"

/**
 * Visualizador suelto del perfil de Instagram, para probar.
 *
 * Es la misma maqueta que abre el banco y el calendario, pero sin plan ni pieza
 * detrás: se suben imágenes, se ordenan y se mira cómo respira la grilla. Nada
 * de esto toca la base: lo que se sube vive en el IndexedDB de este navegador,
 * para que una prueba sobreviva a un recargar sin llenar el banco de basura.
 */

type Pieza = { id: string; blob: Blob; caption: string }

/* ── Persistencia local ───────────────────────────────────────────────────── */

const BASE = "visualizador-instagram"
const ALMACEN = "piezas"

function abrirBase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BASE, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(ALMACEN)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Todo el feed se guarda como una sola lista: el orden es parte del dato. */
async function leerPiezas(): Promise<Pieza[]> {
  try {
    const db = await abrirBase()
    return await new Promise((resolve) => {
      const req = db.transaction(ALMACEN).objectStore(ALMACEN).get("feed")
      req.onsuccess = () => resolve((req.result as Pieza[] | undefined) ?? [])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

async function guardarPiezas(piezas: Pieza[]) {
  try {
    const db = await abrirBase()
    db.transaction(ALMACEN, "readwrite").objectStore(ALMACEN).put(piezas, "feed")
  } catch {
    // Sin IndexedDB (ventana privada) la prueba funciona igual, sólo no persiste.
  }
}

/* ── Componente ───────────────────────────────────────────────────────────── */

export function VisualizadorInstagram() {
  const [piezas, setPiezas] = useState<Pieza[]>([])
  const [cargado, setCargado] = useState(false)
  const [abiertaId, setAbiertaId] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [moviendo, setMoviendo] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    leerPiezas().then((p) => {
      setPiezas(p)
      setCargado(true)
    })
  }, [])

  useEffect(() => {
    if (cargado) guardarPiezas(piezas)
  }, [piezas, cargado])

  /** Una URL por blob, revocada cuando la pieza se va. */
  const urls = useRef(new Map<string, string>())
  const urlDe = useCallback((p: Pieza) => {
    let url = urls.current.get(p.id)
    if (!url) {
      url = URL.createObjectURL(p.blob)
      urls.current.set(p.id, url)
    }
    return url
  }, [])
  useEffect(() => {
    const vivas = new Set(piezas.map((p) => p.id))
    for (const [id, url] of urls.current) {
      if (!vivas.has(id)) {
        URL.revokeObjectURL(url)
        urls.current.delete(id)
      }
    }
  }, [piezas])

  const agregar = (archivos: FileList | File[]) => {
    const nuevas = Array.from(archivos)
      .filter((f) => f.type.startsWith("image/"))
      // Ordenadas por nombre: si vienen numeradas, entran en el orden pensado.
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((f) => ({ id: crypto.randomUUID(), blob: f as Blob, caption: "" }))
    if (nuevas.length) setPiezas((p) => [...p, ...nuevas])
  }

  const mover = (id: string, hacia: number) =>
    setPiezas((p) => {
      const i = p.findIndex((x) => x.id === id)
      const j = i + hacia
      if (i < 0 || j < 0 || j >= p.length) return p
      const copia = [...p]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return copia
    })

  const soltarSobre = (destino: string) => {
    if (!moviendo || moviendo === destino) return
    setPiezas((p) => {
      const desde = p.findIndex((x) => x.id === moviendo)
      const hasta = p.findIndex((x) => x.id === destino)
      const copia = [...p]
      const [pieza] = copia.splice(desde, 1)
      copia.splice(hasta, 0, pieza)
      return copia
    })
  }

  /** La lista está en orden de publicación; la grilla, en orden de lectura. */
  const celdas: Celda[] = useMemo(() => {
    const slots = piezas.map(
      (p): SlotFeed & { pieza: Pieza } => ({
        id: p.id,
        fecha: null,
        contenido: p.caption
          ? { caption: p.caption, captionCorto: "", hashtags: "", cta: "", promptImagen: "" }
          : null,
        opciones: [],
        elegida: null,
        pieza: p,
      })
    )
    return ordenDeLectura(slots, "meta").map((s) => ({
      slot: s,
      imagen: urlDe(s.pieza),
      nombreTemplate: null,
    }))
  }, [piezas, urlDe])

  const indice = abiertaId ? celdas.findIndex((c) => c.slot.id === abiertaId) : -1
  const abierta = indice >= 0 ? celdas[indice] : null

  useEffect(() => {
    if (!abierta) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("textarea, input")) return
      if (e.key === "Escape") setAbiertaId(null)
      if (e.key === "ArrowLeft" && indice > 0) setAbiertaId(celdas[indice - 1].slot.id)
      if (e.key === "ArrowRight" && indice < celdas.length - 1) setAbiertaId(celdas[indice + 1].slot.id)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [abierta, indice, celdas])

  return (
    <div
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return
        e.preventDefault()
        setArrastrando(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setArrastrando(false)
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        setArrastrando(false)
        agregar(e.dataTransfer.files)
      }}
    >
      <section className="min-w-0 space-y-4">
        <div
          className={`flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors ${
            arrastrando ? "border-brand-400 bg-brand-50/50" : "border-line-strong bg-surface"
          }`}
        >
          <ImagePlus className="h-6 w-6 text-ink-faint" />
          <p className="text-[13px] text-ink-secondary">
            Arrastrá imágenes acá o{" "}
            <button type="button" onClick={() => input.current?.click()} className="font-medium text-primary hover:underline">
              elegilas del disco
            </button>
          </p>
          <p className="text-[11.5px] text-ink-faint">
            Entran al final, ordenadas por nombre. Quedan sólo en este navegador.
          </p>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) agregar(e.target.files)
              e.target.value = ""
            }}
          />
        </div>

        {piezas.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] text-ink-muted">
              {piezas.length} {piezas.length === 1 ? "pieza" : "piezas"} en orden de publicación · la última es la más nueva
            </p>
            <Button variant="ghost" size="xs" onClick={() => setPiezas([])}>
              <Trash2 /> Vaciar
            </Button>
          </div>
        )}

        <ol className="space-y-2">
          {piezas.map((p, i) => (
            <li
              key={p.id}
              onDragOver={(e) => {
                if (moviendo) e.preventDefault()
              }}
              onDrop={(e) => {
                if (!moviendo) return
                e.preventDefault()
                e.stopPropagation()
                soltarSobre(p.id)
              }}
              className={`flex gap-3 rounded-xl border bg-surface p-2.5 transition-colors ${
                abiertaId === p.id ? "border-brand-400" : "border-line"
              } ${moviendo === p.id ? "opacity-50" : ""}`}
            >
              <span className="w-5 shrink-0 pt-1 text-right text-[11px] tabular-nums text-ink-faint">{i + 1}</span>
              <button
                type="button"
                onClick={() => setAbiertaId(p.id)}
                // Se arrastra desde la miniatura y no desde la fila: con la fila
                // entera arrastrable, seleccionar texto del caption la movía.
                draggable
                onDragStart={() => setMoviendo(p.id)}
                onDragEnd={() => setMoviendo(null)}
                className="h-20 w-20 shrink-0 cursor-grab overflow-hidden rounded-md bg-surface-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL local */}
                <img src={urlDe(p)} alt="" className="h-full w-full object-cover" />
              </button>
              <Textarea
                value={p.caption}
                onChange={(e) =>
                  setPiezas((ps) => ps.map((x) => (x.id === p.id ? { ...x, caption: e.target.value } : x)))
                }
                placeholder="Caption (opcional)"
                className="min-h-20 flex-1 resize-none text-[12.5px]"
              />
              <div className="flex shrink-0 flex-col gap-0.5">
                <Button variant="ghost" size="icon-sm" aria-label="Antes" disabled={i === 0} onClick={() => mover(p.id, -1)}>
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Después"
                  disabled={i === piezas.length - 1}
                  onClick={() => mover(p.id, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Quitar"
                  onClick={() => {
                    if (abiertaId === p.id) setAbiertaId(null)
                    setPiezas((ps) => ps.filter((x) => x.id !== p.id))
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="mx-auto w-full max-w-[375px] overflow-hidden rounded-[26px] border-[6px] border-navy-950 bg-black shadow-e4">
          {abierta ? (
            <DetalleInstagram
              celda={abierta}
              onVolver={() => setAbiertaId(null)}
              onAnterior={indice > 0 ? () => setAbiertaId(celdas[indice - 1].slot.id) : undefined}
              onSiguiente={indice < celdas.length - 1 ? () => setAbiertaId(celdas[indice + 1].slot.id) : undefined}
            />
          ) : (
            <GrillaInstagram celdas={celdas} onAbrir={(c) => setAbiertaId(c.slot.id)} />
          )}
        </div>
        <p className="mx-auto mt-3 max-w-[375px] text-center text-[11px] leading-relaxed text-ink-faint">
          La más nueva arriba a la izquierda, como en el perfil. Tocá una celda para abrirla; con ← → se navega.
        </p>
      </aside>
    </div>
  )
}
