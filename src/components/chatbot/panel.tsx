"use client"

import * as React from "react"
import Image from "next/image"
import { ArrowUp, Check, ChevronDown, Maximize2, Minimize2, RotateCcw, Square, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { MAX_LARGO } from "@/lib/chatbot/limites"
import type { Agente, AgenteId } from "@/lib/chatbot/agentes"
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
 *    de lectura para que los renglones no crucen el monitor y, en pantallas
 *    anchas, la lista de agentes a la izquierda.
 *
 * El agente se elige desde la cabecera en las tres: el nombre es el selector.
 */

function esMovil() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
}

export function Panel() {
  const {
    acceso,
    agentes,
    agente,
    elegirAgente,
    mensajes,
    escribiendo,
    paso,
    ampliado,
    cerrar,
    setAmpliado,
    enviar,
    detener,
    reiniciar,
  } = useChatbot()

  const [borrador, setBorrador] = React.useState("")
  const [menuAbierto, setMenuAbierto] = React.useState(false)
  const campo = React.useRef<HTMLTextAreaElement>(null)
  const scroll = React.useRef<HTMLDivElement>(null)
  const selector = React.useRef<HTMLDivElement>(null)
  const pegadoAbajo = React.useRef(true)

  const atajos = React.useMemo(
    () => (agente.id === "asistente" ? atajosPara(acceso) : agente.atajos),
    [acceso, agente]
  )
  const vacio = mensajes.length === 0
  const ultimo = mensajes[mensajes.length - 1]
  const esperando = escribiendo && (!ultimo || ultimo.rol !== "assistant" || !ultimo.texto)
  /**
   * La burbuja de "está trabajando".
   *
   * Sale también cuando ya escribió algo —"dejame fijarme"— si en ese momento
   * está usando una herramienta: ese hueco, que es el más largo de todos, era
   * justo el único sin ninguna señal en pantalla.
   */
  const trabajando = escribiendo && (esperando || paso !== null)
  // Con un solo agente habilitado no hay nada que elegir.
  const conSelector = agentes.length > 1

  React.useEffect(() => {
    if (!esMovil()) campo.current?.focus()
  }, [])

  // Escape cierra primero el selector, después sale de pantalla completa y
  // recién ahí cierra.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (menuAbierto) setMenuAbierto(false)
      else if (ampliado) setAmpliado(false)
      else cerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [menuAbierto, ampliado, cerrar, setAmpliado])

  // Un click fuera del selector lo cierra.
  React.useEffect(() => {
    if (!menuAbierto) return
    const onDown = (e: PointerEvent) => {
      if (!selector.current?.contains(e.target as Node)) setMenuAbierto(false)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [menuAbierto])

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

  const elegir = (id: AgenteId) => {
    setMenuAbierto(false)
    elegirAgente(id)
    pegadoAbajo.current = true
    if (!esMovil()) campo.current?.focus()
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
      aria-label={`${agente.nombre} de Accedra`}
      className={cn(
        "fixed inset-0 z-40 flex h-[100dvh] flex-col overflow-hidden bg-surface",
        "animate-in fade-in-0 duration-200",
        ampliado
          ? "md:inset-0"
          : "md:inset-auto md:bottom-6 md:right-6 md:h-[min(680px,calc(100dvh-3rem))] md:w-[420px] md:origin-bottom-right md:rounded-2xl md:border md:border-line md:shadow-e4 md:zoom-in-95"
      )}
    >
      {/* ── Cabecera: el nombre del agente es el selector ── */}
      <header className="relative z-10 flex shrink-0 items-center gap-2 bg-gradient-to-b from-navy-850 to-navy-950 px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <div ref={selector} className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => conSelector && setMenuAbierto((v) => !v)}
            aria-haspopup={conSelector ? "listbox" : undefined}
            aria-expanded={conSelector ? menuAbierto : undefined}
            aria-label={conSelector ? `Agente: ${agente.nombre}. Cambiar de agente` : agente.nombre}
            className={cn(
              "flex w-full min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-1 text-left transition-colors",
              conSelector ? "hover:bg-white/[0.07]" : "cursor-default",
              menuAbierto && "bg-white/[0.07]"
            )}
          >
            <Avatar agente={agente} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-[13.5px] font-semibold tracking-[-0.01em] text-white">
                <span className="truncate">{agente.nombre}</span>
                {conSelector && (
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-white/50 transition-transform duration-200",
                      menuAbierto && "rotate-180"
                    )}
                    strokeWidth={2.4}
                  />
                )}
              </span>
              <span className="block truncate text-[11px] text-white/45">{agente.rol}</span>
            </span>
          </button>

          {menuAbierto && (
            <div
              role="listbox"
              aria-label="Elegí con qué agente hablar"
              className="absolute left-2 right-2 top-full mt-1.5 max-h-[min(70dvh,520px)] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-1.5 shadow-e4 animate-in fade-in-0 zoom-in-95 duration-150 sm:right-auto sm:w-[380px]"
            >
              <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.11em] text-ink-faint">
                Agentes
              </p>
              {agentes.map((a) => (
                <OpcionAgente key={a.id} agente={a} elegido={a.id === agente.id} onElegir={elegir} />
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {!vacio && (
            <BotonCabecera onClick={reiniciar} etiqueta="Empezar una conversación nueva con este agente">
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

      <div className="flex min-h-0 flex-1">
        {/* ── Los agentes a la vista, sólo en pantalla completa y ancha ── */}
        {ampliado && conSelector && (
          <aside className="hidden w-[280px] shrink-0 flex-col overflow-y-auto border-r border-line bg-surface lg:flex">
            <p className="px-5 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.11em] text-ink-faint">
              Agentes
            </p>
            <div className="space-y-0.5 px-2.5 pb-4">
              {agentes.map((a) => (
                <OpcionAgente key={a.id} agente={a} elegido={a.id === agente.id} onElegir={elegir} completa />
              ))}
            </div>
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* ── Conversación ── */}
          <div ref={scroll} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain bg-background">
            <div className={cn(columna, "flex min-h-full flex-col px-4 py-5")}>
              {vacio ? (
                <Bienvenida agente={agente} atajos={atajos} cantidad={ampliado ? 6 : 4} onElegir={mandar} />
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
                  {trabajando && (
                    <Escribiendo
                      etiqueta={paso ?? (agente.id === "asistente" ? null : "Analizando")}
                    />
                  )}
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
                  placeholder={agente.placeholder}
                  aria-label={`Tu mensaje para ${agente.nombre}`}
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
      </div>
    </div>
  )
}

/**
 * La cara del agente. El asistente general lleva el isotipo, como el botón
 * flotante; los especialistas, su emoji sobre el mismo círculo navy, para que
 * se lean como parte de la misma familia y no como stickers sueltos.
 */
function Avatar({ agente, grande }: { agente: Agente; grande?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-navy-800 to-navy-950 ring-1 ring-white/10",
        grande ? "h-11 w-11 text-[21px]" : "h-9 w-9 text-[17px]"
      )}
    >
      {agente.id === "asistente" ? (
        <Image
          src="/brand/accedra-isotipo-blanco.svg"
          alt=""
          width={200}
          height={200}
          className={grande ? "h-[21px] w-[21px]" : "h-[18px] w-[18px]"}
          unoptimized
        />
      ) : (
        <span className="leading-none">{agente.emoji}</span>
      )}
    </span>
  )
}

function OpcionAgente({
  agente,
  elegido,
  onElegir,
  completa,
}: {
  agente: Agente
  elegido: boolean
  onElegir: (id: AgenteId) => void
  /** En la columna de pantalla completa la descripción entra entera. */
  completa?: boolean
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={elegido}
      onClick={() => onElegir(agente.id)}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors",
        elegido ? "bg-brand-50" : "hover:bg-surface-subtle"
      )}
    >
      <Avatar agente={agente} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn("truncate text-[13px] font-semibold", elegido ? "text-brand-700" : "text-ink")}>
            {agente.nombre}
          </span>
          {elegido && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" strokeWidth={2.6} />}
        </span>
        <span className="block truncate text-[11.5px] font-medium text-ink-muted">{agente.rol}</span>
        <span
          className={cn(
            "mt-1 block text-[11.5px] leading-snug text-ink-faint",
            completa ? "line-clamp-3" : "line-clamp-2"
          )}
        >
          {agente.descripcion}
        </span>
      </span>
    </button>
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
 * La pantalla vacía. Una pantalla en blanco no invita a escribir: quién es el
 * agente y cuatro pedidos en grande dicen de qué se puede hablar sin leer un
 * instructivo.
 */
function Bienvenida({
  agente,
  atajos,
  cantidad,
  onElegir,
}: {
  agente: Agente
  atajos: Atajo[]
  cantidad: number
  onElegir: (texto: string) => void
}) {
  return (
    <div className="flex flex-1 flex-col justify-end gap-5 pt-6">
      <div className="flex items-start gap-3">
        <Avatar agente={agente} grande />
        <div className="min-w-0">
          <p className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
            {agente.id === "asistente" ? "¿En qué te ayudo?" : agente.nombre}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{agente.descripcion}</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {atajos.slice(0, cantidad).map((a) => (
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
              <span className="mt-0.5 line-clamp-3 block text-[11.5px] leading-snug text-ink-muted">{a.texto}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Los especialistas razonan antes de escribir: "Analizando" dice que no se colgó. */
function Escribiendo({ etiqueta }: { etiqueta: string | null }) {
  return (
    <div
      className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-3 shadow-e1"
      aria-label={etiqueta ?? "Escribiendo"}
    >
      {etiqueta && <span className="mr-1.5 text-[11.5px] font-medium text-ink-muted">{etiqueta}</span>}
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
