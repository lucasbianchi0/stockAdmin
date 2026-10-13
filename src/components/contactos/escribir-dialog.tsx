"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, Copy, ExternalLink, Loader2, Mail, MessageCircle, Search, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { claveDe, pedirJson } from "@/lib/admin/query"
import { coincide, palabrasDeBusqueda } from "@/lib/busqueda"
import {
  linkMail,
  linkWhatsapp,
  valoresDePersona,
  type PlantillaParaEnviar,
} from "@/lib/contactos-compartido"
import { aplicarVariables, rotuloDeVariable, variablesDe } from "@/lib/marketing/mensajes"
import { usePresencia } from "@/lib/use-presencia"
import { cn } from "@/lib/utils"

/**
 * Escribirle a una persona con una plantilla de Marketing → Plantillas de
 * mensajes.
 *
 * Se elige la plantilla, lo que se sabe de la persona se completa solo
 * (`{{nombre}}`, `{{empresa}}`, `{{cargo}}`, quién firma) y lo que falta se
 * llena acá. Después se abre WhatsApp o el mail con el texto puesto: nada se
 * manda desde la app, se manda desde donde se manda siempre. Queda anotado en
 * el historial si la persona está en un CRM, y la plantilla suma un uso.
 */

export type PersonaParaEscribir = {
  nombre: string | null
  apellido: string | null
  empresa: string
  cargo: string | null
  email: string | null
  telefono: string | null
}

type Canal = PlantillaParaEnviar["canal"]
const CANALES: { id: Canal | "todas"; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "email", rotulo: "Mail" },
  { id: "whatsapp", rotulo: "WhatsApp" },
  { id: "linkedin", rotulo: "LinkedIn" },
]

export { ListaPlantillas }

export function EscribirDialog({
  persona,
  yoNombre,
  onCerrar,
  onEnviado,
}: {
  /** `null` cierra el diálogo. */
  persona: PersonaParaEscribir | null
  yoNombre: string | null
  onCerrar: () => void
  /** Después de abrir WhatsApp o el mail, o de copiar: para anotarlo. */
  onEnviado?: (canal: Canal, plantilla: PlantillaParaEnviar) => void
}) {
  const { montado, saliendo } = usePresencia(persona !== null)
  const [mostrada, setMostrada] = useState(persona)
  if (persona && persona !== mostrada) setMostrada(persona)

  useEffect(() => {
    if (!persona) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCerrar()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [persona, onCerrar])

  if (!montado || !mostrada) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Escribir">
      <div
        className={cn(
          "absolute inset-0 bg-navy-950/50 backdrop-blur-[2px]",
          saliendo ? "animate-out fade-out-0 fill-mode-forwards duration-150" : "animate-in fade-in-0 duration-200"
        )}
        onClick={onCerrar}
      />
      <div
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-e4 sm:max-w-3xl sm:rounded-2xl",
          saliendo
            ? "pointer-events-none animate-out slide-out-to-bottom-4 fade-out-0 fill-mode-forwards duration-150"
            : "animate-in slide-in-from-bottom-4 fade-in-0 duration-200"
        )}
      >
        <Contenido key={`${mostrada.email}-${mostrada.nombre}`} persona={mostrada} yoNombre={yoNombre} onCerrar={onCerrar} onEnviado={onEnviado} />
      </div>
    </div>
  )
}

function Contenido({
  persona,
  yoNombre,
  onCerrar,
  onEnviado,
}: {
  persona: PersonaParaEscribir
  yoNombre: string | null
  onCerrar: () => void
  onEnviado?: (canal: Canal, plantilla: PlantillaParaEnviar) => void
}) {
  const [elegida, setElegida] = useState<PlantillaParaEnviar | null>(null)
  const nombre = [persona.nombre, persona.apellido].filter(Boolean).join(" ") || persona.email || "esta persona"

  return (
    <>
      <header className="flex items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15.5px] font-semibold tracking-[-0.015em] text-ink">Escribirle a {nombre}</h2>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">
            {[persona.cargo, persona.empresa].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onCerrar} aria-label="Cerrar">
          <X />
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 sm:grid-cols-[260px_1fr]">
        <ListaPlantillas
          canalInicial={persona.email ? "todas" : "whatsapp"}
          elegida={elegida}
          onElegir={setElegida}
          className={cn(elegida && "hidden sm:flex")}
        />

        {/* El mensaje */}
        <section className={cn("min-h-0", !elegida && "hidden sm:block")}>
          {elegida ? (
            <Mensaje
              key={elegida.id}
              plantilla={elegida}
              persona={persona}
              yoNombre={yoNombre}
              onVolver={() => setElegida(null)}
              onEnviado={(c) => {
                onEnviado?.(c, elegida)
                void fetch(`/api/contactos/plantillas/${elegida.id}/uso`, { method: "POST" }).catch(() => {})
              }}
            />
          ) : (
            <div className="flex h-full min-h-[240px] items-center justify-center px-8 text-center text-[13px] text-ink-muted">
              Elegí una plantilla: los datos de {persona.nombre ?? "la persona"} se completan solos.
            </div>
          )}
        </section>
      </div>
    </>
  )
}

/** Las plantillas de Marketing, para elegir una: buscador, canal y lista. */
function ListaPlantillas({
  canalInicial,
  soloCanales,
  elegida,
  onElegir,
  className,
}: {
  canalInicial: Canal | "todas"
  /** Para limitar a los canales que se pueden usar (una campaña: mail o WhatsApp). */
  soloCanales?: Canal[]
  elegida: PlantillaParaEnviar | null
  onElegir: (p: PlantillaParaEnviar) => void
  className?: string
}) {
  const q = useQuery({
    queryKey: claveDe("marketing", "/api/contactos/plantillas"),
    queryFn: ({ signal }) =>
      pedirJson<{ plantillas: PlantillaParaEnviar[] }>("/api/contactos/plantillas", { signal }),
    staleTime: 5 * 60_000,
  })
  const [canal, setCanal] = useState<Canal | "todas">(canalInicial)
  const [buscar, setBuscar] = useState("")
  const palabras = palabrasDeBusqueda(buscar)
  const canales = CANALES.filter((c) => c.id === "todas" || !soloCanales || soloCanales.includes(c.id as Canal))
  const plantillas = (q.data?.plantillas ?? []).filter(
    (p) =>
      (!soloCanales || soloCanales.includes(p.canal)) &&
      (canal === "todas" || p.canal === canal) &&
      coincide(palabras, [p.titulo, p.cuandoUsar, p.cuerpo])
  )

  return (
    <aside className={cn("flex min-h-0 flex-col border-line sm:border-r", className)}>
      <div className="space-y-2 border-b border-line-soft px-3 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar plantilla…"
            className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-2 text-[13px] outline-none placeholder:text-ink-faint focus:border-brand-300"
          />
        </div>
        <div className="flex gap-1">
          {canales.map((c) => (
            <button
              key={c.id}
              onClick={() => setCanal(c.id)}
              className={cn(
                "rounded-md px-2 py-1 text-[12px] transition-colors",
                canal === c.id ? "bg-ink text-n-25" : "text-ink-muted hover:bg-surface-muted hover:text-ink"
              )}
            >
              {c.rotulo}
            </button>
          ))}
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5 sm:max-h-[56vh]">
        {q.isPending ? (
          <li className="flex justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />
          </li>
        ) : plantillas.length === 0 ? (
          <li className="px-3 py-6 text-center text-[12.5px] text-ink-muted">
            No hay plantillas para esto. Se cargan en Marketing → Plantillas de mensajes.
          </li>
        ) : (
          plantillas.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onElegir(p)}
                className={cn(
                  "w-full rounded-lg px-2.5 py-2 text-left transition-colors",
                  elegida?.id === p.id ? "bg-brand-50" : "hover:bg-surface-subtle"
                )}
              >
                <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                  {p.canal === "email" ? <Mail className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
                  {p.canal === "email" ? "Mail" : p.canal === "whatsapp" ? "WhatsApp" : "LinkedIn"}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-[13px] leading-snug",
                    elegida?.id === p.id ? "font-medium text-brand-700" : "text-ink"
                  )}
                >
                  {p.titulo}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </aside>
  )
}

function Mensaje({
  plantilla,
  persona,
  yoNombre,
  onVolver,
  onEnviado,
}: {
  plantilla: PlantillaParaEnviar
  persona: PersonaParaEscribir
  yoNombre: string | null
  onVolver: () => void
  onEnviado: (canal: Canal) => void
}) {
  const automaticos = useMemo(() => valoresDePersona(persona, yoNombre), [persona, yoNombre])
  const variables = variablesDe(plantilla.asunto, plantilla.cuerpo)
  const faltan = variables.filter((v) => !automaticos[v.trim()]?.trim())
  const [valores, setValores] = useState<Record<string, string>>({})
  const todos = { ...automaticos, ...valores }

  // El texto final es editable: la plantilla es un punto de partida.
  const [cuerpo, setCuerpo] = useState<string | null>(null)
  const [asunto, setAsunto] = useState<string | null>(null)
  const cuerpoFinal = cuerpo ?? aplicarVariables(plantilla.cuerpo, todos)
  const asuntoFinal = asunto ?? aplicarVariables(plantilla.asunto ?? "", todos)
  const quedanHuecos = variablesDe(cuerpoFinal, asuntoFinal).length > 0
  const [copiado, setCopiado] = useState(false)

  const wa = persona.telefono ? linkWhatsapp(persona.telefono, cuerpoFinal) : null
  const mail = persona.email ? linkMail(persona.email, asuntoFinal, cuerpoFinal) : null

  const copiar = async () => {
    await navigator.clipboard.writeText(plantilla.canal === "email" && asuntoFinal ? `${asuntoFinal}\n\n${cuerpoFinal}` : cuerpoFinal)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1600)
    toast.success("Mensaje copiado")
    onEnviado(plantilla.canal)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:max-h-[56vh]">
        <button onClick={onVolver} className="text-[12px] text-ink-muted hover:text-ink sm:hidden">
          ← Plantillas
        </button>
        <div>
          <p className="text-[13.5px] font-medium text-ink">{plantilla.titulo}</p>
          {plantilla.cuandoUsar && <p className="mt-0.5 text-[12px] text-ink-muted">{plantilla.cuandoUsar}</p>}
        </div>

        {faltan.length > 0 && cuerpo === null && (
          <div className="grid gap-2 sm:grid-cols-2">
            {faltan.map((v) => (
              <label key={v} className="block">
                <span className="text-[11.5px] text-ink-muted">{rotuloDeVariable(v)}</span>
                <input
                  value={valores[v] ?? ""}
                  onChange={(e) => setValores((x) => ({ ...x, [v]: e.target.value }))}
                  className="mt-1 h-8 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-brand-300"
                />
              </label>
            ))}
          </div>
        )}

        {plantilla.canal === "email" && (
          <label className="block">
            <span className="text-[11.5px] text-ink-muted">Asunto</span>
            <input
              value={asuntoFinal}
              onChange={(e) => setAsunto(e.target.value)}
              className="mt-1 h-8 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-brand-300"
            />
          </label>
        )}
        <label className="block">
          <span className="text-[11.5px] text-ink-muted">Mensaje</span>
          <textarea
            value={cuerpoFinal}
            onChange={(e) => setCuerpo(e.target.value)}
            rows={9}
            className="mt-1 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-ink outline-none focus:border-brand-300"
          />
        </label>
        {quedanHuecos && (
          <p className="text-[12px] text-warning-text">Quedan datos por completar (los que siguen entre {"{{ }}"}).</p>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3">
        <Button variant="outline" onClick={copiar}>
          {copiado ? <Check /> : <Copy />}
          Copiar
        </Button>
        {plantilla.canal === "whatsapp" &&
          (wa ? (
            <Button asChild>
              <a href={wa} target="_blank" rel="noreferrer" onClick={() => onEnviado("whatsapp")}>
                <ExternalLink />
                Abrir WhatsApp
              </a>
            </Button>
          ) : (
            <span className="text-[12px] text-ink-muted">Sin teléfono cargado</span>
          ))}
        {plantilla.canal === "email" &&
          (mail ? (
            <Button asChild>
              <a href={mail} onClick={() => onEnviado("email")}>
                <ExternalLink />
                Abrir en el mail
              </a>
            </Button>
          ) : (
            <span className="text-[12px] text-ink-muted">Sin mail cargado</span>
          ))}
      </footer>
    </div>
  )
}
