"use client"

import { useEffect, useState } from "react"
import { Loader2, X } from "lucide-react"

import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { CIERRE_INICIAL, CampoProyecto, EtapaYCierre, type Cierre } from "@/components/comercial/proyecto-dialog"
import type { Usuario } from "@/lib/tickets"
import { usePresencia } from "@/lib/use-presencia"
import { cn } from "@/lib/utils"

/**
 * "Enviar al CRM" desde Contactos: a quién, con qué proyecto y en qué punto.
 *
 * El proyecto es opcional. Con nombre, cada persona elegida suma ese proyecto
 * aunque ya tenga otros (así se abre el segundo, el tercero…). Sin nombre,
 * entra solo quien todavía no estaba: no se crean filas vacías repetidas.
 */
export type EnvioCrm = { proyecto: string; estado: Cierre["estado"]; probabilidad: number }

export function EnviarCrmDialog({
  owner,
  esYo,
  cantidad,
  onCerrar,
  onEnviar,
}: {
  /** A qué CRM va; `null` cierra el diálogo. */
  owner: Usuario | null
  esYo: boolean
  cantidad: number
  onCerrar: () => void
  onEnviar: (e: EnvioCrm) => Promise<void>
}) {
  const { montado, saliendo } = usePresencia(owner !== null)
  const [mostrado, setMostrado] = useState(owner)
  if (owner && owner !== mostrado) setMostrado(owner)

  const [proyecto, setProyecto] = useState("")
  const [cierre, setCierre] = useState<Cierre>(CIERRE_INICIAL)
  const [enviando, setEnviando] = useState(false)

  const [previo, setPrevio] = useState(owner)
  if (owner !== previo) {
    setPrevio(owner)
    if (owner) {
      setProyecto("")
      setCierre(CIERRE_INICIAL)
    }
  }

  useEffect(() => {
    if (!owner) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !enviando && onCerrar()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [owner, enviando, onCerrar])

  if (!montado || !mostrado) return null
  const destino = esYo ? "tu CRM" : `el CRM de ${mostrado.nombre.split(" ")[0]}`
  const quienes = `${cantidad.toLocaleString("es-AR")} ${cantidad === 1 ? "persona" : "personas"}`

  async function enviar() {
    if (enviando) return
    setEnviando(true)
    try {
      await onEnviar({ proyecto: proyecto.trim(), ...cierre })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Enviar al CRM">
      <div
        className={cn(
          "absolute inset-0 bg-navy-950/45 backdrop-blur-[2px]",
          saliendo ? "animate-out fade-out-0 fill-mode-forwards duration-150" : "animate-in fade-in-0 duration-200"
        )}
        onClick={() => !enviando && onCerrar()}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void enviar()
        }}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-e4 sm:max-w-lg sm:rounded-2xl",
          saliendo
            ? "pointer-events-none animate-out slide-out-to-bottom-4 fade-out-0 fill-mode-forwards duration-150"
            : "animate-in slide-in-from-bottom-4 fade-in-0 duration-200"
        )}
      >
        <header className="flex items-start gap-3 px-5 pt-5">
          <Avatar id={mostrado.id} nombre={mostrado.nombre} size="sm" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[15.5px] font-semibold tracking-[-0.015em] text-ink">Enviar a {destino}</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">{quienes}</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onCerrar} disabled={enviando} aria-label="Cerrar">
            <X />
          </Button>
        </header>

        <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-4">
          <div>
            <CampoProyecto valor={proyecto} onCambio={setProyecto} sugerencias={[]} opcional autoFocus />
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">
              {proyecto.trim()
                ? `Cada persona suma “${proyecto.trim()}” como un proyecto aparte, aunque ya tenga otros en ${destino}.`
                : `Sin nombre, entra solo quien todavía no está en ${destino}. Para abrirle otro proyecto a alguien, ponele nombre.`}
            </p>
          </div>
          <EtapaYCierre valor={cierre} onCambio={setCierre} />
        </div>

        <footer className="flex justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3">
          <Button type="button" variant="outline" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando && <Loader2 className="animate-spin" />}
            Enviar
          </Button>
        </footer>
      </form>
    </div>
  )
}
