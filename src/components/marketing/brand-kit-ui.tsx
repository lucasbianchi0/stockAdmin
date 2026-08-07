"use client"

import * as React from "react"
import Image from "next/image"
import { Check, Copy, Download, FileCode2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { armarPrompt, type LogoAsset, type PromptDisciplina } from "@/lib/brand-kit"

/* ═══════════════════════════════════════════════════════════════════════════
   Piezas interactivas del Brand Kit. Todo lo que se ve acá existe por una
   razón: un kit de marca que no deja copiar ni descargar obliga a pedirle el
   archivo a alguien, y eso es exactamente lo que hace que cada pieza termine
   con un logo distinto sacado de un mail de 2019.
   ═══════════════════════════════════════════════════════════════════════════ */

async function copiar(texto: string, mensaje: string) {
  try {
    await navigator.clipboard.writeText(texto)
    toast.success(mensaje)
  } catch {
    toast.error("El navegador bloqueó el portapapeles")
  }
}

/** Botón de copiar con confirmación en el propio botón, no solo en el toast. */
export function CopyButton({
  texto,
  label = "Copiar",
  mensaje = "Copiado",
  variant = "outline",
  size = "xs",
  className,
}: {
  texto: string
  label?: string
  mensaje?: string
  variant?: "outline" | "ghost" | "secondary" | "default"
  size?: "xs" | "sm"
  className?: string
}) {
  const [hecho, setHecho] = React.useState(false)

  React.useEffect(() => {
    if (!hecho) return
    const t = setTimeout(() => setHecho(false), 1600)
    return () => clearTimeout(t)
  }, [hecho])

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={async () => {
        await copiar(texto, mensaje)
        setHecho(true)
      }}
    >
      {hecho ? <Check className="text-success-text" /> : <Copy />}
      {label}
    </Button>
  )
}

/* ── Prompts ──────────────────────────────────────────────────────────────── */

/**
 * Bloque de prompt. El texto va en mono sobre superficie hundida porque es
 * literal: lo que se ve es exactamente lo que se pega en el modelo.
 */
export function PromptCard({
  nombre,
  cuando,
  texto,
  defaultOpen = false,
}: {
  nombre: string
  cuando: string
  texto: string
  defaultOpen?: boolean
}) {
  const [abierto, setAbierto] = React.useState(defaultOpen)
  const palabras = texto.trim().split(/\s+/).length

  return (
    <div className="rounded-xl border border-line bg-surface shadow-e1">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <p className="text-[13px] font-semibold text-ink">{nombre}</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">{cuando}</p>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="hidden text-[10.5px] tabular-nums text-ink-faint sm:inline">
            {palabras} pal.
          </span>
          <CopyButton texto={texto} mensaje={`Bloque "${nombre}" copiado`} />
        </div>
      </div>

      {abierto && (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-line bg-surface-subtle px-4 py-3.5 font-mono text-[11.5px] leading-[1.7] text-ink-secondary">
          {texto}
        </pre>
      )}

      {!abierto && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="w-full border-t border-line px-4 py-2 text-left text-[11px] font-medium text-ink-faint transition-colors hover:text-ink-muted"
        >
          Ver el texto completo
        </button>
      )}
    </div>
  )
}

/* ── Logos ────────────────────────────────────────────────────────────────── */

/**
 * Descarga el SVG tal cual, y además ofrece PNG: el SVG se dibuja en un canvas
 * a 4× y se exporta. Sin esto, cualquiera que necesite el logo para un PowerPoint
 * termina haciendo una captura de pantalla.
 */
async function descargarPng(archivo: string, nombre: string, ratio: number) {
  const ancho = 1600
  const alto = Math.round(ancho / ratio)

  const svg = await fetch(archivo).then((r) => r.text())
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("no se pudo leer el SVG"))
      el.src = url
    })

    const canvas = document.createElement("canvas")
    canvas.width = ancho
    canvas.height = alto
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("sin canvas")
    ctx.drawImage(img, 0, 0, ancho, alto)

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"))
    if (!blob) throw new Error("sin blob")

    bajarBlob(blob, `${nombre}.png`)
    toast.success("PNG descargado", { description: `${ancho} × ${alto} px, fondo transparente` })
  } catch {
    toast.error("No se pudo generar el PNG")
  } finally {
    URL.revokeObjectURL(url)
  }
}

function bajarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function LogoCard({ logo }: { logo: LogoAsset }) {
  const oscuro = logo.fondo === "oscuro"
  const nombreArchivo = logo.archivo.split("/").pop()!.replace(".svg", "")

  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
      <div
        className={cn(
          "flex h-32 items-center justify-center px-8",
          oscuro ? "bg-[#0A1424]" : "bg-surface-subtle"
        )}
      >
        <Image
          src={logo.archivo}
          alt={logo.nombre}
          width={logo.ratio === 1 ? 200 : 1073}
          height={logo.ratio === 1 ? 200 : 160}
          className={logo.ratio === 1 ? "h-14 w-auto" : "h-7 w-auto max-w-full"}
          unoptimized
        />
      </div>

      <figcaption className="border-t border-line px-4 py-3">
        <p className="text-[13px] font-semibold text-ink">{logo.nombre}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">{logo.uso}</p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Button asChild variant="outline" size="xs">
            <a href={logo.archivo} download={`${nombreArchivo}.svg`}>
              <FileCode2 />
              SVG
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => descargarPng(logo.archivo, nombreArchivo, logo.ratio)}
          >
            <Download />
            PNG
          </Button>
        </div>
      </figcaption>
    </figure>
  )
}

/* ── Color ────────────────────────────────────────────────────────────────── */

export function ColorChip({
  nombre,
  hex,
  textoSobre,
  uso,
  nota,
}: {
  nombre: string
  hex: string
  textoSobre: string
  uso: string
  nota?: string
}) {
  return (
    <button
      type="button"
      onClick={() => copiar(hex, `${hex} copiado`)}
      className="group overflow-hidden rounded-xl border border-line bg-surface text-left shadow-e1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-e2"
    >
      <div
        className="flex h-20 items-end justify-between px-3.5 pb-2.5"
        style={{ background: hex, color: textoSobre }}
      >
        <span className="font-mono text-[11.5px] uppercase tracking-wide">{hex}</span>
        <Copy className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-70" />
      </div>
      <div className="px-3.5 py-3">
        <p className="text-[12.5px] font-semibold text-ink">{nombre}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">{uso}</p>
        {nota && <p className="mt-1.5 text-[11px] italic leading-relaxed text-ink-faint">{nota}</p>}
      </div>
    </button>
  )
}

/* ── Prompt por disciplina ────────────────────────────────────────────────── */

/**
 * Card de prompt. El color es funcional: identifica la disciplina de un vistazo
 * para que nadie copie el equivocado. Va como filete lateral y como tinta del
 * título, nunca como relleno de la card — un bloque pastel entero es
 * exactamente lo que hace que una interfaz se vea barata.
 */
export function PromptDisciplinaCard({
  prompt,
  nombresBloques,
}: {
  prompt: PromptDisciplina
  nombresBloques: Record<string, string>
}) {
  const [abierto, setAbierto] = React.useState(false)
  const texto = armarPrompt(prompt)
  // Aproximación de tokens para español con BPE: ~3,6 caracteres por token.
  // Es lo que se paga en cada llamada, así que es el número que hay que ver.
  const tokens = Math.round(texto.length / 3.6)

  return (
    <div
      className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1"
      style={{ borderLeft: `3px solid ${prompt.color}` }}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div className="min-w-0">
          <p
            className="text-[14px] font-semibold tracking-[-0.015em]"
            style={{ color: prompt.color }}
          >
            {prompt.nombre}
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">{prompt.para}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <CopyButton
            texto={texto}
            label="Copiar"
            mensaje={`Prompt de ${prompt.nombre} copiado`}
            variant="default"
            size="sm"
          />
          <span className="text-[10.5px] tabular-nums text-ink-faint">~{tokens.toLocaleString("es-AR")} tokens</span>
        </div>
      </div>

      <ul className="mt-3 grid gap-x-5 gap-y-1 px-4 sm:grid-cols-2">
        {prompt.incluye.map((i) => (
          <li key={i} className="flex gap-1.5 text-[12px] leading-[1.55] text-ink-secondary">
            <Check
              className="mt-[3px] h-3 w-3 shrink-0"
              style={{ color: prompt.color }}
              strokeWidth={2.6}
            />
            {i}
          </li>
        ))}
      </ul>

      <div className="mt-3.5 flex flex-wrap items-center gap-1 px-4 pb-3">
        <span className="mr-0.5 text-[10.5px] font-medium uppercase tracking-wider text-ink-faint">
          Bloques
        </span>
        {prompt.bloques.map((id) => (
          <span
            key={id}
            className="rounded border border-line bg-surface-muted px-1.5 py-0.5 text-[10.5px] text-ink-muted"
          >
            {nombresBloques[id] ?? id}
          </span>
        ))}
      </div>

      {abierto && (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-line bg-surface-subtle px-4 py-3.5 font-mono text-[11.5px] leading-[1.7] text-ink-secondary">
          {texto}
        </pre>
      )}

      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full border-t border-line px-4 py-2 text-left text-[11px] font-medium text-ink-faint transition-colors hover:text-ink-muted"
      >
        {abierto ? "Ocultar el texto" : "Ver el texto completo"}
      </button>
    </div>
  )
}

/* ── Navegación lateral ───────────────────────────────────────────────────── */

export type NavGrupo = { titulo: string; items: { id: string; label: string }[] }

/**
 * Índice con scrollspy. Sin el resaltado activo, un documento de 17 secciones
 * se convierte en una tirada larga donde nadie sabe dónde está parado.
 */
export function BrandNav({ grupos }: { grupos: NavGrupo[] }) {
  const [activo, setActivo] = React.useState(grupos[0]?.items[0]?.id ?? "")

  React.useEffect(() => {
    const ids = grupos.flatMap((g) => g.items.map((i) => i.id))
    const nodos = ids
      .map((id) => document.getElementById(id))
      .filter((n): n is HTMLElement => n !== null)

    const obs = new IntersectionObserver(
      (entradas) => {
        const visible = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActivo(visible.target.id)
      },
      // La banda alta hace que la sección se marque cuando llega al tercio
      // superior, no cuando toca el borde inferior de la pantalla.
      { rootMargin: "-96px 0px -68% 0px", threshold: 0 }
    )

    nodos.forEach((n) => obs.observe(n))
    return () => obs.disconnect()
  }, [grupos])

  return (
    <nav className="sticky top-24 hidden max-h-[calc(100vh-8rem)] w-52 shrink-0 overflow-y-auto pb-8 lg:block">
      {grupos.map((grupo) => (
        <div key={grupo.titulo} className="mb-5">
          <p className="eyebrow mb-1.5 px-2.5">{grupo.titulo}</p>
          <ul>
            {grupo.items.map((item) => {
              const on = activo === item.id
              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className={cn(
                      "block rounded-md px-2.5 py-1.5 text-[12px] transition-colors",
                      on
                        ? "bg-brand-50 font-medium text-brand-700"
                        : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                    )}
                  >
                    {item.label}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
