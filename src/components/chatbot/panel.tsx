"use client"

import * as React from "react"
import Image from "next/image"
import { ArrowUp, Maximize2, Minimize2, RotateCcw, Square, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { MODULOS, NOMBRE_MODULO } from "@/lib/permisos"
import { MAX_LARGO } from "@/lib/chatbot/limites"
import { atajosPara, type Atajo } from "./atajos"
import { Formato } from "./formato"
import { useChatbot } from "./provider"

/**
 * La ventana del asistente.
 *
 * Tres formas, la misma pieza:
 *  · Teléfono: pantalla completa. Un panel flotante en 390 px deja un chat de
 *    dos renglones con el teclado abierto.
 *  · Escritorio: flota abajo a la derecha, encima del botón.
 *  · Escritorio ampliado: pantalla completa, con la conversación en una columna
 *    de lectura para que los renglones no crucen el monitor.
 */

function esMovil() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
}

export function Panel() {
  const { acceso, mensajes, escribiendo, ampliado, cerrar, setAmpliado, enviar, detener, reiniciar } =
    useChatbot()

  const [borrador, setBorrador] = React.useState("")
  const campo = React.useRef<HTMLTextAreaElement>(null)
  const scroll = React.useRef<HTMLDivElement>(null)
  const pegadoAbajo = React.useRef(true)

  const atajos = React.useMemo(() => atajosPara(acceso), [acceso])
  const vacio = mensajes.length === 0
  const ultimo = mensajes[mensajes.length - 1]
  const esperando = escribiendo && (!ultimo || ultimo.rol !== "assistant" || !ultimo.texto)

  const modulos = MODULOS.filter((m) => acceso.admin || acceso.modulos.includes(m))

  React.useEffect(() => {
    if (!esMovil()) campo.current?.focus()
  }, [])

  // Escape sale primero de pantalla completa y después cierra.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (ampliado) setAmpliado(false)
      else cerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [ampliado, cerrar, setAmpliado])

  // Sigue la respuesta mientras llega, salvo que la persona haya subido a
  // releer algo: arrastrarla hacia abajo en ese momento es hostil.
  React.useEffect(() => {
    const el = scroll.current
    if (el && pegadoAbajo.current) el.scrollTop = el.scrollHeight
  }, [mensajes])

  const onScroll = () => {
    const el = scroll.current
    if (el) pegadoAbajo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  // El campo crece con el texto hasta seis renglones.
  React.useEffect(() => {
    const el = campo.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`
  }, [borrador])

  const mandar = (texto: string) => {
    if (!texto.trim() || escribiendo) return
    pegadoAbajo.current = true
    enviar(texto)
    setBorrador("")
  }

  // Al seguir un enlace a una pantalla, en el teléfono o en pantalla completa
  // el panel tapa justo lo que se fue a mirar: se cierra. La conversación queda.
  const onNavegar = () => {
    if (esMovil()) cerrar()
    else if (ampliado) setAmpliado(false)
  }

  const columna = cn("w-full", ampliado && "md:mx-auto md:max-w-3xl")

  return (
    <div
      role="dialog"
      aria-label="Asistente de Accedra"
      className={cn(
        "fixed inset-0 z-40 flex h-[100dvh] flex-col overflow-hidden bg-surface",
        "animate-in fade-in-0 duration-200",
        ampliado
          ? "md:inset-0"
          : "md:inset-auto md:bottom-6 md:right-6 md:h-[min(680px,calc(100dvh-3rem))] md:w-[420px] md:origin-bottom-right md:rounded-2xl md:border md:border-line md:shadow-e4 md:zoom-in-95"
      )}
    >
      {/* ── Cabecera ── */}
      <header className="flex shrink-0 items-center gap-3 bg-gradient-to-b from-navy-850 to-navy-950 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] ring-1 ring-white/10">
          <Image src="/brand/accedra-isotipo-blanco.svg" alt="" width={200} height={200} className="h-[18px] w-[18px]" unoptimized />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold tracking-[-0.01em] text-white">Asistente</p>
          <p className="truncate text-[11px] text-white/45">
            {acceso.admin ? "Acceso total" : modulos.map((m) => NOMBRE_MODULO[m]).join(" · ")}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {!vacio && (
            <BotonCabecera onClick={reiniciar} etiqueta="Empezar una conversación nueva">
              <RotateCcw className="h-4 w-4" />
            </BotonCabecera>
          )}
          <BotonCabecera
            onClick={() => setAmpliado(!ampliado)}
            etiqueta={ampliado ? "Achicar" : "Pantalla completa"}
            className="hidden md:flex"
          >
            {ampliado ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </BotonCabecera>
          <BotonCabecera onClick={cerrar} etiqueta="Cerrar el asistente">
            <X className="h-[18px] w-[18px]" />
          </BotonCabecera>
        </div>
      </header>

      {/* ── Conversación ── */}
      <div ref={scroll} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain bg-background">
        <div className={cn(columna, "px-4 py-5")}>
          {vacio ? (
            <Bienvenida atajos={atajos} onElegir={mandar} />
          ) : (
            <div className="space-y-4">
              {mensajes.map((m, i) =>
                m.rol === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-[13px] leading-relaxed text-white shadow-e1">
                      {m.texto}
                    </p>
                  </div>
                ) : m.texto ? (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[95%] rounded-2xl rounded-bl-md border px-3.5 py-2.5 text-[13px] leading-[1.6] shadow-e1",
                      m.error
                        ? "border-danger-line bg-danger-soft text-danger-text"
                        : "border-line bg-surface text-ink-secondary"
                    )}
                  >
                    <Formato
                      texto={m.texto}
                      enCurso={escribiendo && i === mensajes.length - 1}
                      acceso={acceso}
                      onNavegar={onNavegar}
                    />
                  </div>
                ) : null
              )}
              {esperando && <Escribiendo />}
            </div>
          )}
        </div>
      </div>

      {/* ── Atajos y campo ── */}
      <div className="shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className={columna}>
          {/* Siempre a mano después del primer mensaje, que es cuando más se
              usan. Se ocultan mientras escribe: tocar uno a mitad de respuesta
              encola una pregunta que pisa la anterior. */}
          {!vacio && !escribiendo && (
            <div className="flex gap-1.5 overflow-x-auto px-3 pt-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {atajos.map((a) => (
                <button
                  key={a.corto}
                  type="button"
                  onClick={() => mandar(a.texto)}
                  className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface-subtle px-2.5 py-1 text-[11.5px] font-medium text-ink-secondary transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                >
                  <span aria-hidden>{a.emoji}</span>
                  {a.corto}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              mandar(borrador)
            }}
            className="flex items-end gap-2 p-3"
          >
            <textarea
              ref={campo}
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  mandar(borrador)
                }
              }}
              rows={1}
              maxLength={MAX_LARGO}
              placeholder="Preguntá lo que necesites…"
              aria-label="Tu pregunta"
              className="max-h-36 min-h-[40px] flex-1 resize-none rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-[16px] leading-snug text-ink placeholder:text-ink-faint focus:border-brand-400 focus:outline-none md:text-[13px]"
            />
            {escribiendo ? (
              <button
                type="button"
                onClick={detener}
                aria-label="Detener la respuesta"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-surface text-ink-secondary shadow-e1 transition-colors hover:bg-surface-subtle"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!borrador.trim()}
                aria-label="Enviar"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_oklch(1_0_0/0.16),var(--elevation-1)] transition-colors hover:bg-brand-700 disabled:opacity-40"
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2.4} />
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

function BotonCabecera({
  onClick,
  etiqueta,
  className,
  children,
}: {
  onClick: () => void
  etiqueta: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white",
        className
      )}
    >
      {children}
    </button>
  )
}

/**
 * La pantalla vacía. Una pantalla en blanco no invita a escribir: cuatro
 * preguntas en grande dicen de qué se puede hablar sin leer un instructivo.
 */
function Bienvenida({ atajos, onElegir }: { atajos: Atajo[]; onElegir: (texto: string) => void }) {
  return (
    <div className="flex min-h-full flex-col justify-end gap-5 pt-6">
      <div>
        <p className="text-[17px] font-semibold tracking-[-0.02em] text-ink">¿En qué te ayudo?</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
          Preguntame por el backoffice, la marca o los números de tu área. Te respondo con lo que
          tenés habilitado y te dejo el enlace a cada cosa.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {atajos.slice(0, 4).map((a) => (
          <button
            key={a.corto}
            type="button"
            onClick={() => onElegir(a.texto)}
            className="group flex items-start gap-2.5 rounded-xl border border-line bg-surface p-3 text-left shadow-e1 transition-all duration-150 hover:-translate-y-px hover:border-brand-200 hover:shadow-e2"
          >
            <span className="text-[17px] leading-none" aria-hidden>
              {a.emoji}
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold text-ink group-hover:text-brand-700">
                {a.corto}
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-muted">{a.texto}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Escribiendo() {
  return (
    <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-3 shadow-e1" aria-label="Escribiendo">
      {[0, 150, 300].map((d) => (
        <span
          key={d}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint"
          style={{ animationDelay: `${d}ms` }}
        />
      ))}
    </div>
  )
}
