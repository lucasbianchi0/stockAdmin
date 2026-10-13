"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, Copy, ExternalLink, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ListaPlantillas, type PersonaParaEscribir } from "@/components/contactos/escribir-dialog"
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
 * Escribirle a varias personas con la misma plantilla.
 *
 * Se elige la plantilla una vez y se completa lo que es igual para todos (el
 * plazo, la fecha del evento). Lo de cada uno —nombre, empresa, cargo— se pone
 * solo en su mensaje. Después, persona por persona: "Abrir mail" o "Abrir
 * WhatsApp" con su texto listo, y queda tildada.
 *
 * No manda nada por su cuenta: es la forma de escribirle a quince personas sin
 * copiar y pegar quince veces, desde el mail o el WhatsApp de cada uno. El
 * envío masivo de verdad es el de las campañas, que llega después.
 */

export type Destinatario = PersonaParaEscribir & { id: string }

export function EscribirVariosDialog({
  personas,
  yoNombre,
  onCerrar,
  onEnviado,
}: {
  /** `null` cierra el diálogo. */
  personas: Destinatario[] | null
  yoNombre: string | null
  onCerrar: () => void
  /** Cada vez que se abre el mail o WhatsApp de alguien, o se copia su mensaje. */
  onEnviado?: (persona: Destinatario, canal: PlantillaParaEnviar["canal"], plantilla: PlantillaParaEnviar) => void
}) {
  const { montado, saliendo } = usePresencia(personas !== null)
  const [mostradas, setMostradas] = useState(personas)
  if (personas && personas !== mostradas) setMostradas(personas)

  useEffect(() => {
    if (!personas) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCerrar()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [personas, onCerrar])

  if (!montado || !mostradas) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Escribir a varios">
      <div
        className={cn(
          "absolute inset-0 bg-navy-950/50 backdrop-blur-[2px]",
          saliendo ? "animate-out fade-out-0 fill-mode-forwards duration-150" : "animate-in fade-in-0 duration-200"
        )}
        onClick={onCerrar}
      />
      <div
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-e4 sm:max-w-4xl sm:rounded-2xl",
          saliendo
            ? "pointer-events-none animate-out slide-out-to-bottom-4 fade-out-0 fill-mode-forwards duration-150"
            : "animate-in slide-in-from-bottom-4 fade-in-0 duration-200"
        )}
      >
        <Contenido personas={mostradas} yoNombre={yoNombre} onCerrar={onCerrar} onEnviado={onEnviado} />
      </div>
    </div>
  )
}

function Contenido({
  personas,
  yoNombre,
  onCerrar,
  onEnviado,
}: {
  personas: Destinatario[]
  yoNombre: string | null
  onCerrar: () => void
  onEnviado?: (persona: Destinatario, canal: PlantillaParaEnviar["canal"], plantilla: PlantillaParaEnviar) => void
}) {
  const [elegida, setElegida] = useState<PlantillaParaEnviar | null>(null)
  const conMail = personas.filter((p) => p.email).length
  const conTel = personas.filter((p) => p.telefono).length

  return (
    <>
      <header className="flex items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15.5px] font-semibold tracking-[-0.015em] text-ink">
            Escribirle a {personas.length} {personas.length === 1 ? "persona" : "personas"}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            {conMail} con mail · {conTel} con teléfono. Cada una recibe su mensaje con sus datos.
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onCerrar} aria-label="Cerrar">
          <X />
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 sm:grid-cols-[260px_1fr]">
        <ListaPlantillas
          canalInicial={conMail >= conTel ? "email" : "whatsapp"}
          soloCanales={["email", "whatsapp"]}
          elegida={elegida}
          onElegir={setElegida}
          className={cn(elegida && "hidden sm:flex")}
        />
        <section className={cn("min-h-0", !elegida && "hidden sm:block")}>
          {elegida ? (
            <Envios
              key={elegida.id}
              plantilla={elegida}
              personas={personas}
              yoNombre={yoNombre}
              onVolver={() => setElegida(null)}
              onEnviado={(p, c) => {
                onEnviado?.(p, c, elegida)
                void fetch(`/api/contactos/plantillas/${elegida.id}/uso`, { method: "POST" }).catch(() => {})
              }}
            />
          ) : (
            <div className="flex h-full min-h-[240px] items-center justify-center px-8 text-center text-[13px] text-ink-muted">
              Elegí una plantilla de mail o WhatsApp: el nombre, la empresa y el cargo de cada uno se completan solos.
            </div>
          )}
        </section>
      </div>
    </>
  )
}

/** Variables que salen de la persona: no se piden, cada mensaje pone las suyas. */
const DE_LA_PERSONA = new Set(Object.keys(valoresDePersona({ nombre: "", apellido: "", empresa: "", cargo: "" }, "")))

function Envios({
  plantilla,
  personas,
  yoNombre,
  onVolver,
  onEnviado,
}: {
  plantilla: PlantillaParaEnviar
  personas: Destinatario[]
  yoNombre: string | null
  onVolver: () => void
  onEnviado: (p: Destinatario, canal: PlantillaParaEnviar["canal"]) => void
}) {
  // Lo que es igual para todos y no se sabe solo: se completa una vez.
  const comunes = variablesDe(plantilla.asunto, plantilla.cuerpo).filter((v) => !DE_LA_PERSONA.has(v.trim()))
  const [valores, setValores] = useState<Record<string, string>>({})
  const [hechos, setHechos] = useState<Set<string>>(new Set())
  const [abierta, setAbierta] = useState<string | null>(personas[0]?.id ?? null)

  const mensajeDe = useMemo(
    () => (p: Destinatario) => {
      const v = { ...valoresDePersona(p, yoNombre), ...valores }
      return { asunto: aplicarVariables(plantilla.asunto ?? "", v), cuerpo: aplicarVariables(plantilla.cuerpo, v) }
    },
    [plantilla, valores, yoNombre]
  )
  const faltan = comunes.filter((v) => !valores[v]?.trim()).length

  const marcar = (p: Destinatario) => {
    setHechos((s) => new Set(s).add(p.id))
    onEnviado(p, plantilla.canal)
    // Pasa sola a la siguiente que falta.
    const siguiente = personas.find((x) => x.id !== p.id && !hechos.has(x.id))
    if (siguiente) setAbierta(siguiente.id)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:max-h-[60vh]">
        <button onClick={onVolver} className="text-[12px] text-ink-muted hover:text-ink sm:hidden">
          ← Plantillas
        </button>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13.5px] font-medium text-ink">{plantilla.titulo}</p>
          <p className="num shrink-0 text-[12px] text-ink-muted">
            {hechos.size} de {personas.length} {hechos.size === 1 ? "hecho" : "hechos"}
          </p>
        </div>

        {comunes.length > 0 && (
          <div className="rounded-lg border border-line px-3.5 py-3">
            <p className="text-[12px] font-medium text-ink-secondary">Igual para todos</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {comunes.map((v) => (
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
            {faltan > 0 && (
              <p className="mt-2 text-[11.5px] text-warning-text">
                Faltan {faltan} {faltan === 1 ? "dato" : "datos"}: si no, el mensaje sale con el hueco entre {"{{ }}"}.
              </p>
            )}
          </div>
        )}

        <ul className="divide-y divide-line-soft overflow-hidden rounded-lg border border-line">
          {personas.map((p) => {
            const m = mensajeDe(p)
            const hecho = hechos.has(p.id)
            const nombre = [p.nombre, p.apellido].filter(Boolean).join(" ") || p.email || "Sin nombre"
            const link =
              plantilla.canal === "email"
                ? p.email
                  ? linkMail(p.email, m.asunto, m.cuerpo)
                  : null
                : p.telefono
                  ? linkWhatsapp(p.telefono, m.cuerpo)
                  : null
            const verMensaje = abierta === p.id
            return (
              <li key={p.id} className={cn(hecho && "bg-success-soft/40")}>
                <div className="flex items-center gap-3 px-3.5 py-2.5">
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      hecho ? "border-success bg-success text-white" : "border-line-strong"
                    )}
                  >
                    {hecho && <Check className="h-3 w-3" />}
                  </span>
                  <button onClick={() => setAbierta(verMensaje ? null : p.id)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-[13px] font-medium text-ink">{nombre}</p>
                    <p className="truncate text-[11.5px] text-ink-muted">
                      {[p.empresa, plantilla.canal === "email" ? p.email : p.telefono].filter(Boolean).join(" · ") ||
                        "—"}
                    </p>
                  </button>
                  {link ? (
                    <Button size="xs" variant={hecho ? "outline" : "default"} asChild>
                      <a
                        href={link}
                        target={plantilla.canal === "whatsapp" ? "_blank" : undefined}
                        rel="noreferrer"
                        onClick={() => marcar(p)}
                      >
                        <ExternalLink />
                        {plantilla.canal === "email" ? "Abrir mail" : "Abrir WhatsApp"}
                      </a>
                    </Button>
                  ) : (
                    <span className="shrink-0 text-[11.5px] text-ink-faint">
                      Sin {plantilla.canal === "email" ? "mail" : "teléfono"}
                    </span>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Copiar el mensaje"
                    title="Copiar el mensaje"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        plantilla.canal === "email" && m.asunto ? `${m.asunto}\n\n${m.cuerpo}` : m.cuerpo
                      )
                      toast.success(`Mensaje de ${nombre.split(" ")[0]} copiado`)
                      marcar(p)
                    }}
                  >
                    <Copy />
                  </Button>
                </div>
                {verMensaje && (
                  <div className="border-t border-line-soft bg-surface-subtle px-3.5 py-3 animate-in fade-in-0 duration-150">
                    {plantilla.canal === "email" && m.asunto && (
                      <p className="mb-1.5 text-[12px] text-ink-secondary">
                        <span className="text-ink-muted">Asunto:</span> {m.asunto}
                      </p>
                    )}
                    <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-ink">{m.cuerpo}</p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-line bg-surface-subtle px-5 py-3 text-[12px] text-ink-muted">
        <span>Cada mensaje se abre en tu mail o WhatsApp: se manda desde ahí.</span>
      </footer>
    </div>
  )
}
