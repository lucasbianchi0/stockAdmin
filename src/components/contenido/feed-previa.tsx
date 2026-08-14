"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import {
  ArrowLeft,
  Bookmark,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Send,
  ThumbsUp,
  X,
} from "lucide-react"

import { fechaLarga, type Canal, type Slot } from "@/lib/calendario-context"
import { ordenDeLectura } from "@/lib/secuencia"

/**
 * Cómo queda TODO el feed, antes de generarlo.
 *
 * Este es el punto del rediseño. Una publicación se juzga sola; un feed se juzga
 * junto — once placas que por separado están bien pueden ser once fotos con
 * texto encima, y en la grilla eso se ve como una pared. Pero para enterarse
 * había que generar las once, a doce segundos cada una.
 *
 * En el camino 2 no hay miniaturas de template guardadas, así que la celda sin
 * imagen real muestra un placeholder con el nombre del formato que le tocó. El
 * conjunto se sigue pudiendo juzgar por ritmo y por lo que ya tiene imagen.
 *
 * Las imágenes van en `<img>` plano: son data: URL de runtime o URLs firmadas
 * temporales, y next/image no puede optimizar ninguna de las dos.
 */

const PERFIL = {
  instagram: { usuario: "accedra_sa", nombre: "ACCEDRA | Infraestructura IT" },
  linkedin: { nombre: "ACCEDRA S.A.", meta: "526 seguidores" },
}

/** Qué se dibuja en una celda. */
type Celda = {
  slot: Slot
  /** La imagen real de la pieza, si ya se generó. */
  imagen: string | null
  nombreTemplate: string | null
}

export function FeedPrevia({
  canal,
  slots,
  imagenDe,
  nombreTemplate,
  onCerrar,
}: {
  canal: Canal
  slots: Slot[]
  imagenDe: (slot: Slot) => string | null
  /** El nombre del template del feed que le tocó a cada slot. */
  nombreTemplate: (slot: Slot) => string | null
  onCerrar: () => void
}) {
  const [detalle, setDetalle] = useState<Celda | null>(null)

  /**
   * En orden de lectura y no de fecha.
   *
   * Instagram muestra lo último arriba a la izquierda, así que el perfil se lee
   * al revés del calendario. Dibujarlo en orden de fecha mostraría filas de tres
   * que en el perfil real nunca existen — y las filas son justamente lo que se
   * está juzgando.
   */
  const celdas: Celda[] = useMemo(
    () =>
      ordenDeLectura(slots, canal).map((slot) => ({
        slot,
        imagen: imagenDe(slot),
        nombreTemplate: nombreTemplate(slot),
      })),
    [slots, canal, imagenDe, nombreTemplate]
  )

  const reales = celdas.filter((c) => c.imagen).length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      // Escape cierra una capa por vez: primero el detalle, después el modal.
      if (detalle) setDetalle(null)
      else onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [detalle, onCerrar])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-navy-950/75 p-4 backdrop-blur-sm sm:p-8"
      onClick={onCerrar}
    >
      <div className="w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[12.5px] font-semibold text-white">
            {canal === "linkedin" ? "Feed de LinkedIn" : "Perfil de Instagram"}
            <span className="ml-2 font-normal text-white/50">
              {celdas.length} publicaciones · {reales} con imagen real
            </span>
          </p>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-auto w-full max-w-[375px] overflow-hidden rounded-[26px] border-[6px] border-navy-950 bg-black shadow-e4">
          {detalle ? (
            <DetalleInstagram celda={detalle} onVolver={() => setDetalle(null)} />
          ) : canal === "linkedin" ? (
            <FeedLinkedIn celdas={celdas} />
          ) : (
            <GrillaInstagram celdas={celdas} onAbrir={setDetalle} />
          )}
        </div>

        <p className="mx-auto mt-3 max-w-[375px] text-center text-[11px] leading-relaxed text-white/50">
          {canal === "linkedin"
            ? "En orden de publicación. Cada texto está cortado donde lo corta LinkedIn. Las celdas sin imagen todavía no se generaron."
            : "La más nueva arriba a la izquierda, como en el perfil. Las celdas sin imagen todavía no se generaron."}
        </p>
      </div>
    </div>
  )
}

/* ── Instagram ────────────────────────────────────────────────────────────── */

function GrillaInstagram({
  celdas,
  onAbrir,
}: {
  celdas: Celda[]
  onAbrir: (c: Celda) => void
}) {
  return (
    <div className="font-sans text-white">
      <div className="flex items-center gap-4 px-4 pb-3 pt-4">
        <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-white p-3">
          <Image src="/brand/accedra-logo-navy.svg" alt="" width={1073} height={160} className="w-full" unoptimized />
        </div>
        <div className="flex flex-1 justify-around text-center">
          {[
            [String(40 + celdas.length), "publicaciones"],
            ["57", "seguidores"],
            ["90", "seguidos"],
          ].map(([n, l]) => (
            <div key={l}>
              <p className="text-[15px] font-semibold tabular-nums">{n}</p>
              <p className="text-[11px] text-white/70">{l}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pb-3">
        <p className="text-[13px] font-semibold">{PERFIL.instagram.nombre}</p>
        <p className="text-[13px] text-white/60">Producto/servicio</p>
      </div>

      <div className="grid grid-cols-3 gap-[2px] border-t border-white/15 pt-[2px]">
        {celdas.map((c) => (
          <button
            key={c.slot.id}
            type="button"
            onClick={() => onAbrir(c)}
            className="relative aspect-square bg-white/[0.06] transition-opacity hover:opacity-80"
          >
            <Relleno celda={c} />
          </button>
        ))}
        {/* Relleno para que la grilla no quede coja en la última fila. */}
        {Array.from({ length: (3 - (celdas.length % 3)) % 3 }).map((_, i) => (
          <div key={i} className="aspect-square bg-white/[0.03]" />
        ))}
      </div>
    </div>
  )
}

/**
 * El contenido de una celda, en orden de verdad decreciente: la imagen real, la
 * muestra del template, y el nombre del formato.
 *
 * La muestra va SIN atenuar. Antes iba al 60% de opacidad y con borde punteado
 * para que no se confundiera con una pieza terminada, y el efecto fue el
 * contrario del buscado: la grilla entera se veía apagada, y lo que se está
 * juzgando acá es justamente cómo respira el conjunto. Un feed visto a través
 * de un velo gris no se puede juzgar.
 *
 * La advertencia la da una etiqueta, que dice lo mismo sin tocar la imagen.
 */
function Relleno({ celda }: { celda: Celda; detalle?: boolean }) {
  if (celda.imagen) {
    // eslint-disable-next-line @next/next/no-img-element -- data: URL o firma temporal
    return <img src={celda.imagen} alt="" className="absolute inset-0 h-full w-full object-cover" />
  }

  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 border border-dashed border-white/25 px-1 text-center">
      <span className="text-[9px] leading-tight text-white/60">
        {celda.nombreTemplate ?? "Sin formato"}
      </span>
      <span className="text-[8px] leading-tight text-white/30">sin imagen</span>
    </span>
  )
}

function DetalleInstagram({ celda, onVolver }: { celda: Celda; onVolver: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const texto = textoDe(celda.slot)
  const primeraLinea = texto.split("\n")[0]
  const largo = texto.length > primeraLinea.length

  return (
    <div className="font-sans text-white">
      <div className="flex items-center gap-3 border-b border-white/10 px-3 py-2.5">
        <button type="button" onClick={onVolver} aria-label="Volver al perfil">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="text-[13px] font-semibold">Publicación</p>
        <span className="ml-auto text-[11px] text-white/50">{fechaLarga(celda.slot.fecha)}</span>
      </div>

      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white p-1">
          <Image src="/brand/accedra-logo-navy.svg" alt="" width={1073} height={160} className="w-full" unoptimized />
        </div>
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{PERFIL.instagram.usuario}</p>
        <MoreHorizontal className="h-5 w-5 shrink-0" />
      </div>

      <div className="relative aspect-square w-full">
        <Relleno celda={celda} detalle />
      </div>

      <div className="flex items-center gap-4 px-3 pt-2.5">
        <Heart className="h-6 w-6" strokeWidth={1.7} />
        <MessageCircle className="h-6 w-6 -scale-x-100" strokeWidth={1.7} />
        <Send className="h-6 w-6" strokeWidth={1.7} />
        <Bookmark className="ml-auto h-6 w-6" strokeWidth={1.7} />
      </div>

      <p className="whitespace-pre-wrap px-3 pb-4 pt-2 text-[13px] leading-[1.4]">
        <span className="font-semibold">{PERFIL.instagram.usuario}</span>{" "}
        {abierto ? texto : primeraLinea}
        {largo && !abierto && (
          <button type="button" onClick={() => setAbierto(true)} className="text-white/50">
            {" "}… más
          </button>
        )}
      </p>
    </div>
  )
}

/* ── LinkedIn ─────────────────────────────────────────────────────────────── */

/** Donde corta LinkedIn en mobile. */
const CORTE = 140

function FeedLinkedIn({ celdas }: { celdas: Celda[] }) {
  return (
    <div className="divide-y-[8px] divide-[#f3f2ef] bg-[#f3f2ef]">
      {celdas.map((c) => (
        <PostLinkedIn key={c.slot.id} celda={c} />
      ))}
    </div>
  )
}

function PostLinkedIn({ celda }: { celda: Celda }) {
  const [abierto, setAbierto] = useState(false)
  const texto = textoDe(celda.slot)
  const largo = texto.length > CORTE

  return (
    <article className="bg-white font-sans text-[#000000e6]">
      <div className="flex items-start gap-2 px-3 pt-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0D1F3A]">
          <Image src="/brand/accedra-isotipo-blanco.svg" alt="" width={186} height={186} className="h-7 w-7" unoptimized />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[14px] font-semibold">{PERFIL.linkedin.nombre}</p>
          <p className="truncate text-[12px] text-[#00000099]">{PERFIL.linkedin.meta}</p>
          <p className="text-[12px] text-[#00000099]">{fechaLarga(celda.slot.fecha)} · 🌐</p>
        </div>
        <MoreHorizontal className="h-5 w-5 shrink-0 text-[#00000099]" />
      </div>

      <p className="whitespace-pre-wrap px-3 pb-2 pt-2.5 text-[14px] leading-[1.43]">
        {abierto || !largo ? texto : texto.slice(0, CORTE)}
        {largo && !abierto && (
          <button type="button" onClick={() => setAbierto(true)} className="text-[#00000099] hover:underline">
            {" "}…ver más
          </button>
        )}
      </p>

      <div className="relative aspect-square w-full bg-[#f3f2ef]">
        <Relleno celda={celda} detalle />
      </div>

      <div className="flex items-center justify-between border-t border-[#0000001a] px-2 py-1">
        {[ThumbsUp, MessageCircle, Repeat2, Send].map((Icono, i) => (
          <span key={i} className="flex flex-1 justify-center py-2 text-[#00000099]">
            <Icono className="h-4 w-4" strokeWidth={2} />
          </span>
        ))}
      </div>
    </article>
  )
}

/* ── Compartido ───────────────────────────────────────────────────────────── */

/**
 * Qué texto mostrar. Con contenido generado, el de verdad; sin él, el título y
 * el hook de la opción elegida — que es lo que se va a terminar escribiendo.
 * Una celda vacía no dejaría juzgar el ritmo del feed, que es para lo que se
 * abre esta pantalla antes de generar nada.
 */
function textoDe(slot: Slot): string {
  const c = slot.contenido
  if (c) return [c.caption, c.cta, c.hashtags].filter(Boolean).join("\n\n")

  const idea = slot.opciones.find((o) => o.id === slot.elegida) ?? slot.opciones[0]
  if (idea) return [idea.titulo, idea.hook].filter(Boolean).join("\n\n")

  return "Todavía sin contenido"
}
