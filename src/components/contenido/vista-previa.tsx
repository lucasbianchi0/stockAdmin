"use client"

import { useEffect, useState } from "react"
import NextImage from "next/image"
import {
  Bookmark,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Send,
  ThumbsUp,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { Canal, Contenido } from "@/lib/calendario-context"

/**
 * Cómo se va a ver la pieza publicada, antes de publicarla.
 *
 * No es decoración: un texto que se lee bien en un panel de administración se
 * corta a los 140 caracteres en el feed de LinkedIn, y una imagen que funciona
 * sola desentona apenas cae en la grilla del perfil junto a las otras nueve. Las
 * dos cosas solo se ven mirándolas donde van a vivir.
 *
 * Todo lo que se replica acá está medido contra las apps reales: el corte del
 * caption, el orden de los íconos, el fondo negro del feed de Instagram y el
 * ancho de 375 px del mobile.
 *
 * Las imágenes van en `<img>` plano y no en next/image: son data: URL generadas
 * en runtime, que el optimizador no puede procesar y su parseo de `src` rechaza.
 */

/** Datos públicos de los perfiles. Salen de CANALES en el Brand Kit. */
const PERFIL = {
  linkedin: { nombre: "ACCEDRA S.A.", meta: "526 seguidores", cuando: "Ahora" },
  instagram: { usuario: "accedra_sa", cuando: "Ahora" },
}

type Vista = "linkedin" | "ig-post" | "ig-perfil"

export function VistaPrevia({
  canal,
  contenido,
  imagen,
  onCerrar,
}: {
  canal: Canal
  contenido: Contenido
  imagen: string | null
  onCerrar: () => void
}) {
  const vistas: Vista[] = canal === "linkedin" ? ["linkedin"] : ["ig-post", "ig-perfil"]
  const [vista, setVista] = useState<Vista>(vistas[0])

  // Escape cierra: en un modal a pantalla completa, buscar la X con el mouse es
  // el paso de más que hace que nadie vuelva a abrirlo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCerrar()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar])

  const texto = [contenido.caption, contenido.cta, contenido.hashtags]
    .filter(Boolean)
    .join("\n\n")

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-navy-950/70 p-4 backdrop-blur-sm sm:p-8"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-white/10 p-1">
            {vistas.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                  vista === v ? "bg-white text-ink" : "text-white/60 hover:text-white"
                )}
              >
                {v === "linkedin" ? "Publicación" : v === "ig-post" ? "Publicación" : "Perfil"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar vista previa"
            className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Marco de teléfono: sin un ancho fijo de 375 px la previsualización
            miente, porque el corte del texto depende del ancho. */}
        <div className="mx-auto w-full max-w-[375px] overflow-hidden rounded-[26px] border-[6px] border-navy-950 bg-white shadow-e4">
          {vista === "linkedin" && <PostLinkedIn texto={texto} imagen={imagen} />}
          {vista === "ig-post" && <PostInstagram texto={texto} imagen={imagen} />}
          {vista === "ig-perfil" && <PerfilInstagram imagen={imagen} />}
        </div>

        <p className="mx-auto mt-3 max-w-[375px] text-center text-[11px] leading-relaxed text-white/50">
          {vista === "ig-perfil"
            ? "Las otras celdas son marcadores: sirven para juzgar si la pieza nueva convive con una grilla, no para reproducir tu feed real."
            : "Reproducción aproximada. El corte del texto y las proporciones son los de la app."}
        </p>
      </div>
    </div>
  )
}

/* ── LinkedIn ─────────────────────────────────────────────────────────────── */

/** LinkedIn corta alrededor de los 140 caracteres en mobile. */
const CORTE_LINKEDIN = 140

function PostLinkedIn({ texto, imagen }: { texto: string; imagen: string | null }) {
  const [abierto, setAbierto] = useState(false)
  const largo = texto.length > CORTE_LINKEDIN
  const visible = abierto || !largo ? texto : texto.slice(0, CORTE_LINKEDIN)

  return (
    <div className="bg-white font-sans text-[#000000e6]">
      <div className="flex items-start gap-2 px-3 pt-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0D1F3A]">
          <NextImage
            src="/brand/accedra-isotipo-blanco.svg"
            alt=""
            width={186}
            height={186}
            className="h-7 w-7"
            unoptimized
          />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[14px] font-semibold">{PERFIL.linkedin.nombre}</p>
          <p className="truncate text-[12px] text-[#00000099]">{PERFIL.linkedin.meta}</p>
          <p className="text-[12px] text-[#00000099]">{PERFIL.linkedin.cuando} · 🌐</p>
        </div>
        <MoreHorizontal className="h-5 w-5 shrink-0 text-[#00000099]" />
      </div>

      <p className="whitespace-pre-wrap px-3 pb-2 pt-2.5 text-[14px] leading-[1.43]">
        {visible}
        {largo && !abierto && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="text-[#00000099] hover:text-[#0a66c2] hover:underline"
          >
            {" "}…ver más
          </button>
        )}
      </p>

      {imagen ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL de runtime
        <img src={imagen} alt="" className="w-full" />
      ) : (
        <SinImagen />
      )}

      <div className="flex items-center justify-between border-t border-[#0000001a] px-2 py-1">
        {[
          { Icono: ThumbsUp, label: "Recomendar" },
          { Icono: MessageCircle, label: "Comentar" },
          { Icono: Repeat2, label: "Compartir" },
          { Icono: Send, label: "Enviar" },
        ].map(({ Icono, label }) => (
          <span
            key={label}
            className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[#00000099]"
          >
            <Icono className="h-4 w-4" strokeWidth={2} />
            <span className="text-[10px] font-semibold">{label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── Instagram ────────────────────────────────────────────────────────────── */

function PostInstagram({ texto, imagen }: { texto: string; imagen: string | null }) {
  const [abierto, setAbierto] = useState(false)
  // Instagram muestra sólo la primera línea antes del "… más".
  const primeraLinea = texto.split("\n")[0]
  const largo = texto.length > primeraLinea.length

  return (
    <div className="bg-black font-sans text-white">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white p-1">
          <NextImage
            src="/brand/accedra-logo-navy.svg"
            alt=""
            width={1073}
            height={160}
            className="w-full"
            unoptimized
          />
        </div>
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">
          {PERFIL.instagram.usuario}
        </p>
        <MoreHorizontal className="h-5 w-5 shrink-0" />
      </div>

      {imagen ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL de runtime
        <img src={imagen} alt="" className="w-full" />
      ) : (
        <SinImagen oscuro />
      )}

      <div className="flex items-center gap-4 px-3 pt-2.5">
        <Heart className="h-6 w-6" strokeWidth={1.7} />
        <MessageCircle className="h-6 w-6 -scale-x-100" strokeWidth={1.7} />
        <Send className="h-6 w-6" strokeWidth={1.7} />
        <Bookmark className="ml-auto h-6 w-6" strokeWidth={1.7} />
      </div>

      <p className="whitespace-pre-wrap px-3 pb-3 pt-2 text-[13px] leading-[1.4]">
        <span className="font-semibold">{PERFIL.instagram.usuario}</span>{" "}
        {abierto ? texto : primeraLinea}
        {largo && !abierto && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="text-white/50"
          >
            {" "}… más
          </button>
        )}
      </p>
    </div>
  )
}

/**
 * La grilla del perfil. La pieza nueva entra primera —arriba a la izquierda— y
 * el resto son marcadores: sin acceso al feed real, lo honesto es mostrar la
 * posición, no inventar publicaciones que no existen.
 */
function PerfilInstagram({ imagen }: { imagen: string | null }) {
  return (
    <div className="bg-black font-sans text-white">
      <div className="flex items-center gap-4 px-4 pb-3 pt-4">
        <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-white p-3">
          <NextImage
            src="/brand/accedra-logo-navy.svg"
            alt=""
            width={1073}
            height={160}
            className="w-full"
            unoptimized
          />
        </div>
        <div className="flex flex-1 justify-around text-center">
          {[
            ["41", "publicaciones"],
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
        <p className="text-[13px] font-semibold">ACCEDRA | Infraestructura IT</p>
        <p className="text-[13px] text-white/60">Producto/servicio</p>
      </div>

      <div className="grid grid-cols-3 gap-[2px] border-t border-white/15 pt-[2px]">
        <div className="relative aspect-square bg-white/5">
          {imagen ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URL de runtime
            <img src={imagen} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-white/40">
              sin imagen
            </div>
          )}
          <span className="absolute left-1 top-1 rounded bg-brand-600 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide">
            Nueva
          </span>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-square bg-white/[0.06]" />
        ))}
      </div>
    </div>
  )
}

function SinImagen({ oscuro }: { oscuro?: boolean }) {
  return (
    <div
      className={cn(
        "flex aspect-square items-center justify-center text-[12px]",
        oscuro ? "bg-white/5 text-white/40" : "bg-[#f3f2ef] text-[#00000066]"
      )}
    >
      Generá la imagen para verla acá
    </div>
  )
}
