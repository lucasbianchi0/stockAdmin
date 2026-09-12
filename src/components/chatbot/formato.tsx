"use client"

import type React from "react"
import Link from "next/link"
import { ExternalLink } from "lucide-react"

import { ColorChip, LogoCard } from "@/components/marketing/brand-kit-ui"
import { COLORES_SOLUCION, LOGOS, PALETA } from "@/lib/brand-kit"
import { destinoPermitido } from "@/lib/chatbot/enlaces"
import { puede, type Acceso } from "@/lib/permisos"

/**
 * Lo que escribe el modelo, dibujado.
 *
 * Formateador propio y no una librería de markdown: un parser genérico
 * interpreta HTML, imágenes y enlaces a cualquier dominio, y acá el texto lo
 * genera un modelo que se puede equivocar. Este reconoce negrita, código,
 * enlace permitido, viñeta, numeral y las dos tarjetas de marca, y no sabe
 * hacer nada más. Eso es una virtud. Nada de `dangerouslySetInnerHTML`.
 */

type Ctx = { acceso: Acceso; onNavegar: () => void }

/* ── En línea ─────────────────────────────────────────────────────────────── */

const EN_LINEA = /\*\*(.+?)\*\*|`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)/g

const claseEnlace =
  "font-medium text-brand-600 underline decoration-brand-300 underline-offset-2 transition-colors hover:text-brand-700 hover:decoration-brand-600"

function Enlace({ href, ctx, children }: { href: string; ctx: Ctx; children: React.ReactNode }) {
  const destino = destinoPermitido(href, ctx.acceso)
  if (!destino) return <>{children}</>

  if (destino.tipo === "interno") {
    return (
      <Link href={destino.href} onClick={ctx.onNavegar} className={claseEnlace}>
        {children}
      </Link>
    )
  }

  return (
    <a href={destino.href} target="_blank" rel="noopener noreferrer" className={claseEnlace}>
      {children}
      <ExternalLink className="ml-0.5 inline h-3 w-3 -translate-y-px" aria-hidden />
    </a>
  )
}

function enLinea(texto: string, ctx: Ctx, clave = "l"): React.ReactNode[] {
  const nodos: React.ReactNode[] = []
  let desde = 0
  let n = 0

  for (const m of texto.matchAll(EN_LINEA)) {
    const i = m.index ?? 0
    if (i > desde) nodos.push(texto.slice(desde, i))
    const k = `${clave}-${n++}`

    if (m[1] !== undefined) {
      // El modelo escribe **[Documento](/ruta)** con la misma naturalidad que
      // un enlace suelto: el contenido de la negrita vuelve a pasar por acá.
      nodos.push(
        <strong key={k} className="font-semibold text-ink">
          {enLinea(m[1], ctx, k)}
        </strong>
      )
    } else if (m[2] !== undefined) {
      const codigo = m[2].trim()
      const chip = (
        <code className="rounded bg-surface-muted px-1 py-px font-mono text-[0.92em] text-ink-secondary">
          {codigo}
        </code>
      )
      // Una ruta entre backticks es el nombre de una pantalla: si la puede
      // abrir, se vuelve enlace.
      nodos.push(
        codigo.startsWith("/") && destinoPermitido(codigo, ctx.acceso) ? (
          <Enlace key={k} href={codigo} ctx={ctx}>
            {chip}
          </Enlace>
        ) : (
          <span key={k}>{chip}</span>
        )
      )
    } else {
      nodos.push(
        <Enlace key={k} href={m[4]} ctx={ctx}>
          {enLinea(m[3], ctx, k)}
        </Enlace>
      )
    }

    desde = i + m[0].length
  }

  if (desde < texto.length) nodos.push(texto.slice(desde))
  return nodos
}

/* ── Tarjetas ─────────────────────────────────────────────────────────────── */

const TARJETA = /^::(logo|color)\s+(\S+)$/

/** Una clave que no existe no dibuja nada: una tarjeta vacía —o el marcador
 *  crudo— es más feo que no mostrarla. */
function Tarjeta({ tipo, clave, ctx }: { tipo: string; clave: string; ctx: Ctx }) {
  if (!puede(ctx.acceso, "/marketing/brand")) return null

  if (tipo === "logo") {
    const logo = LOGOS.find((l) => l.id === clave)
    return logo ? <LogoCard logo={logo} /> : null
  }

  const hex = clave.toUpperCase()
  const color = PALETA.find((c) => c.hex.toUpperCase() === hex)
  if (color) {
    return (
      <ColorChip nombre={color.nombre} hex={color.hex} textoSobre={color.textoSobre} uso={color.uso} />
    )
  }
  const solucion = COLORES_SOLUCION.find((c) => c.hex.toUpperCase() === hex)
  return solucion ? (
    <ColorChip
      nombre={solucion.nombre}
      hex={solucion.hex}
      textoSobre="#FFFFFF"
      uso={`Color de la solución. ${solucion.nota}`}
    />
  ) : null
}

/* ── Bloques ──────────────────────────────────────────────────────────────── */

export function Formato({
  texto,
  enCurso,
  acceso,
  onNavegar,
}: {
  texto: string
  /** Mientras llega, la última línea puede ser un marcador a medio escribir. */
  enCurso: boolean
  acceso: Acceso
  onNavegar: () => void
}) {
  const ctx: Ctx = { acceso, onNavegar }
  const lineas = texto.split("\n")
  const bloques: React.ReactNode[] = []
  let lista: { tipo: "ul" | "ol"; items: string[] } | null = null

  const cerrarLista = () => {
    if (!lista) return
    const k = `b-${bloques.length}`
    const items = lista.items.map((it, i) => (
      <li key={i} className="pl-1">
        {enLinea(it, ctx, `${k}-${i}`)}
      </li>
    ))
    bloques.push(
      lista.tipo === "ul" ? (
        <ul key={k} className="list-disc space-y-1 pl-5 marker:text-ink-faint">
          {items}
        </ul>
      ) : (
        <ol key={k} className="list-decimal space-y-1 pl-5 marker:text-ink-subtle">
          {items}
        </ol>
      )
    )
    lista = null
  }

  lineas.forEach((cruda, i) => {
    const linea = cruda.trim()
    const ultima = i === lineas.length - 1

    if (linea.startsWith("::")) {
      cerrarLista()
      if (enCurso && ultima) return
      const m = TARJETA.exec(linea)
      if (m) {
        bloques.push(
          <div key={`b-${bloques.length}`} className="py-0.5">
            <Tarjeta tipo={m[1]} clave={m[2]} ctx={ctx} />
          </div>
        )
      }
      return
    }

    const vineta = /^[-*•]\s+(.*)$/.exec(linea)
    const numeral = /^\d+[.)]\s+(.*)$/.exec(linea)
    if (vineta || numeral) {
      const tipo = vineta ? "ul" : "ol"
      if (lista && lista.tipo !== tipo) cerrarLista()
      if (!lista) lista = { tipo, items: [] }
      lista.items.push((vineta ?? numeral)![1])
      return
    }

    cerrarLista()
    if (!linea) return

    // Un título con # se lee como una negrita: el prompt pide no usarlos,
    // pero si aparece no tiene que verse el numeral.
    const titulo = /^#{1,6}\s+(.*)$/.exec(linea)
    bloques.push(
      <p key={`b-${bloques.length}`} className={titulo ? "font-semibold text-ink" : undefined}>
        {enLinea(titulo ? titulo[1] : linea, ctx, `b-${bloques.length}`)}
      </p>
    )
  })
  cerrarLista()

  return <div className="space-y-2 break-words">{bloques}</div>
}
