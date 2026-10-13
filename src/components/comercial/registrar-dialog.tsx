"use client"

import { useEffect, useState } from "react"
import { Loader2, Mail, MessageSquare, PhoneCall, Users, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Oportunidad, TipoActividad } from "@/lib/comercial/crm"
import { usePresencia } from "@/lib/use-presencia"
import { cn } from "@/lib/utils"

/**
 * Anotar una llamada, una reunión o un mail sin abrir el panel: qué pasó y
 * cuál es el próximo paso, en un solo diálogo.
 *
 * Es lo que se hace diez veces por día en un CRM. Anotar el contacto y no el
 * paso siguiente deja la oportunidad sin fecha, y una oportunidad sin fecha es
 * una que se olvida: por eso los dos van juntos.
 */

export type Registro = {
  tipo: TipoActividad
  texto: string
  proximaAccion: string
  fechaProxima: string
}

const TIPOS: { id: TipoActividad; rotulo: string; icono: typeof PhoneCall }[] = [
  { id: "llamada", rotulo: "Llamada", icono: PhoneCall },
  { id: "reunion", rotulo: "Reunión", icono: Users },
  { id: "email", rotulo: "Mail", icono: Mail },
  { id: "nota", rotulo: "Nota", icono: MessageSquare },
]

/** Hoy + n días, en la fecha local de Argentina (YYYY-MM-DD). */
const enDias = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString("en-CA")
}

export function RegistrarDialog({
  oportunidad,
  tipoInicial,
  onCerrar,
  onGuardar,
}: {
  /** `null` cierra el diálogo. */
  oportunidad: Oportunidad | null
  tipoInicial: TipoActividad
  onCerrar: () => void
  onGuardar: (o: Oportunidad, r: Registro) => Promise<void>
}) {
  const { montado, saliendo } = usePresencia(oportunidad !== null)
  const [mostrada, setMostrada] = useState(oportunidad)
  if (oportunidad && oportunidad !== mostrada) setMostrada(oportunidad)

  const [tipo, setTipo] = useState<TipoActividad>(tipoInicial)
  const [texto, setTexto] = useState("")
  const [proxima, setProxima] = useState("")
  const [fecha, setFecha] = useState("")
  const [guardando, setGuardando] = useState(false)

  // Cada apertura arranca con el próximo paso que ya tenía la oportunidad.
  const [previa, setPrevia] = useState(oportunidad)
  if (oportunidad !== previa) {
    setPrevia(oportunidad)
    if (oportunidad) {
      setTipo(tipoInicial)
      setTexto("")
      setProxima(oportunidad.proximaAccion ?? "")
      setFecha(oportunidad.fechaProxima ?? "")
    }
  }

  useEffect(() => {
    if (!oportunidad) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !guardando && onCerrar()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [oportunidad, guardando, onCerrar])

  if (!montado || !mostrada) return null
  const c = mostrada.contacto
  const persona = [c.nombre, c.apellido].filter(Boolean).join(" ") || c.email || "Sin nombre"

  const guardar = async () => {
    if (!texto.trim() || guardando) return
    setGuardando(true)
    try {
      await onGuardar(mostrada, { tipo, texto: texto.trim(), proximaAccion: proxima.trim(), fechaProxima: fecha })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Registrar">
      <div
        className={cn(
          "absolute inset-0 bg-navy-950/45 backdrop-blur-[2px]",
          saliendo ? "animate-out fade-out-0 fill-mode-forwards duration-150" : "animate-in fade-in-0 duration-200"
        )}
        onClick={() => !guardando && onCerrar()}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void guardar()
        }}
        className={cn(
          "relative w-full overflow-hidden rounded-t-2xl border border-line bg-surface shadow-e4 sm:max-w-lg sm:rounded-2xl",
          saliendo
            ? "pointer-events-none animate-out slide-out-to-bottom-4 fade-out-0 fill-mode-forwards duration-150"
            : "animate-in slide-in-from-bottom-4 fade-in-0 duration-200"
        )}
      >
        <header className="flex items-start gap-3 px-5 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15.5px] font-semibold tracking-[-0.015em] text-ink">Registrar con {persona}</h2>
            <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">{[c.cargo, c.empresa].filter(Boolean).join(" · ")}</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onCerrar} aria-label="Cerrar">
            <X />
          </Button>
        </header>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-line">
            {TIPOS.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTipo(t.id)}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2 text-[12.5px] transition-colors",
                  i > 0 && "border-l border-line",
                  tipo === t.id ? "bg-surface-muted font-medium text-ink" : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
                )}
              >
                <t.icono className="h-3.5 w-3.5" />
                {t.rotulo}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="text-[12px] font-medium text-ink-secondary">¿Qué pasó?</span>
            <Textarea
              autoFocus
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void guardar()
              }}
              placeholder={tipo === "reunion" ? "Demo con IT y Compras. Piden propuesta para fin de mes." : "Atendió, le interesa, quedamos en…"}
              className="mt-1.5"
            />
          </label>

          <div className="space-y-2 rounded-lg border border-line px-3.5 py-3">
            <p className="text-[12px] font-medium text-ink-secondary">Próximo paso</p>
            <Input value={proxima} onChange={(e) => setProxima(e.target.value)} placeholder="Enviar propuesta" />
            <div className="flex flex-wrap items-center gap-1.5">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-8 w-auto text-[13px]" />
              {[
                ["Mañana", 1],
                ["En 3 días", 3],
                ["En 1 semana", 7],
                ["En 2 semanas", 14],
              ].map(([rotulo, n]) => (
                <button
                  key={rotulo}
                  type="button"
                  onClick={() => setFecha(enDias(n as number))}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                    fecha === enDias(n as number)
                      ? "border-ink bg-ink text-n-25"
                      : "border-line text-ink-secondary hover:border-line-strong hover:text-ink"
                  )}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-line bg-surface-subtle px-5 py-3">
          <span className="hidden text-[11.5px] text-ink-faint sm:inline">⌘ + Enter para guardar</span>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!texto.trim() || guardando}>
              {guardando && <Loader2 className="animate-spin" />}
              Guardar
            </Button>
          </div>
        </footer>
      </form>
    </div>
  )
}
