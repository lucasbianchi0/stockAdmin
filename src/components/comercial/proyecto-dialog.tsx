"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Building2, ChevronDown, Loader2, Search, UserPlus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { claveDe, mensajeError, pedirJson } from "@/lib/admin/query"
import { coincide, palabrasDeBusqueda } from "@/lib/busqueda"
import {
  ESTADOS_CRM,
  ESTADO_CRM_ESTILO,
  ESTADO_CRM_LABEL,
  PORCENTAJES,
  PROYECTOS_SUGERIDOS,
  reglaDeCierre,
  type EstadoCrm,
  type OpcionesContacto,
  type Oportunidad,
} from "@/lib/comercial/crm"
import type { FichaEmpresa } from "@/lib/contactos-compartido"
import { usePresencia } from "@/lib/use-presencia"
import { cn } from "@/lib/utils"

/**
 * "+ Proyecto": otro proyecto en una empresa, con una de sus personas.
 *
 * La lista sale de Contactos (toda la gente de la empresa, esté o no en el
 * CRM). Si es alguien que todavía no está cargado, "Otra persona" abre el
 * alta de contacto con el proyecto ya puesto. Se abre desde el CRM y desde la
 * ficha de la persona en Contactos: cambia solo la `url` a la que pega.
 */

/** `empresa: ""` arranca eligiendo la empresa (el "Nuevo proyecto" del CRM). */
export type BaseProyecto = { empresa: string; contactoId?: string }

/** Cómo arranca un proyecto: etapa y %, atados por `reglaDeCierre`. */
export type Cierre = { estado: EstadoCrm; probabilidad: number }
export const CIERRE_INICIAL: Cierre = { estado: "nuevo", probabilidad: 0 }

export function ProyectoDialog({
  base,
  ownerId,
  destino,
  url = "/api/comercial/crm/proyectos",
  sugerencias = [],
  onCerrar,
  onCreado,
  onPersonaNueva,
}: {
  /** `null` cierra el diálogo. */
  base: BaseProyecto | null
  ownerId: string
  /** "tu CRM", "el CRM de Sofía". */
  destino: string
  url?: string
  /** Además de los de la empresa, que el diálogo ya conoce. */
  sugerencias?: string[]
  onCerrar: () => void
  onCreado: (o: Oportunidad) => void
  /** Sin esto, no se ofrece cargar a otra persona. */
  onPersonaNueva?: (empresa: string, proyecto: string) => void
}) {
  const { montado, saliendo } = usePresencia(base !== null)
  const [mostrada, setMostrada] = useState(base)
  if (base && base !== mostrada) setMostrada(base)

  const [proyecto, setProyecto] = useState("")
  const [empresa, setEmpresa] = useState(base?.empresa ?? "")
  const [buscaEmpresa, setBuscaEmpresa] = useState("")
  const [contactoId, setContactoId] = useState(base?.contactoId ?? "")
  const [cierre, setCierre] = useState<Cierre>(CIERRE_INICIAL)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [previa, setPrevia] = useState(base)
  if (base !== previa) {
    setPrevia(base)
    if (base) {
      setProyecto("")
      setEmpresa(base.empresa)
      setBuscaEmpresa("")
      setContactoId(base.contactoId ?? "")
      setCierre(CIERRE_INICIAL)
      setError(null)
    }
  }

  const eligeEmpresa = mostrada?.empresa === ""
  const opcionesQ = useQuery({
    queryKey: claveDe("comercial", "/api/comercial/crm/opciones"),
    queryFn: ({ signal }) => pedirJson<OpcionesContacto>("/api/comercial/crm/opciones", { signal }),
    enabled: eligeEmpresa,
    staleTime: 5 * 60_000,
  })
  const urlEmpresa = `/api/contactos/empresa?nombre=${encodeURIComponent(empresa)}`
  const q = useQuery({
    queryKey: claveDe("marketing", urlEmpresa),
    queryFn: ({ signal }) => pedirJson<FichaEmpresa>(urlEmpresa, { signal }),
    enabled: !!mostrada && empresa !== "",
    staleTime: 60_000,
  })
  const personas = q.data?.personas ?? []
  const elegido = contactoId || (personas.length === 1 ? personas[0].id : "")
  // Los que ya tiene la empresa van primero: suelen repetirse con otra persona.
  const deLaEmpresa = personas.flatMap((p) => p.crm.map((o) => o.proyecto)).filter((p): p is string => !!p)

  useEffect(() => {
    if (!base) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !guardando && onCerrar()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [base, guardando, onCerrar])

  if (!montado || !mostrada) return null

  const listo = proyecto.trim() !== "" && elegido !== ""

  async function crear() {
    if (!listo || guardando) return
    setGuardando(true)
    setError(null)
    try {
      const r = await pedirJson<{ oportunidad: Oportunidad }>(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactoId: elegido, proyecto: proyecto.trim(), ownerId, ...cierre }),
      })
      onCreado(r.oportunidad)
    } catch (e) {
      setError(mensajeError(e, "No se pudo crear el proyecto"))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Nuevo proyecto">
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
          void crear()
        }}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-e4 sm:max-w-lg sm:rounded-2xl",
          saliendo
            ? "pointer-events-none animate-out slide-out-to-bottom-4 fade-out-0 fill-mode-forwards duration-150"
            : "animate-in slide-in-from-bottom-4 fade-in-0 duration-200"
        )}
      >
        <header className="flex items-start gap-3 px-5 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15.5px] font-semibold tracking-[-0.015em] text-ink">
              {empresa ? `Nuevo proyecto en ${empresa}` : "Nuevo proyecto"}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              Entra a {destino} y se sigue aparte.
              {eligeEmpresa && empresa && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => {
                      setEmpresa("")
                      setContactoId("")
                    }}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    Cambiar empresa
                  </button>
                </>
              )}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onCerrar} disabled={guardando} aria-label="Cerrar">
            <X />
          </Button>
        </header>

        {!empresa ? (
          <ElegirEmpresa
            busqueda={buscaEmpresa}
            onBusqueda={setBuscaEmpresa}
            empresas={opcionesQ.data?.empresas ?? []}
            cargando={opcionesQ.isPending}
            onElegir={setEmpresa}
            onNueva={onPersonaNueva ? (nombre) => onPersonaNueva(nombre, proyecto.trim()) : undefined}
          />
        ) : (
        <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-4">
          <CampoProyecto valor={proyecto} onCambio={setProyecto} sugerencias={[...deLaEmpresa, ...sugerencias]} autoFocus />

          <div>
            <span className="text-[12px] font-medium text-ink-secondary">Con quién</span>
            {q.isPending ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />
              </div>
            ) : (
              <ul className="mt-1.5 max-h-[220px] space-y-0.5 overflow-y-auto">
                {personas.map((p) => (
                  <li key={p.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                        elegido === p.id ? "bg-brand-50 text-brand-700" : "hover:bg-surface-subtle"
                      )}
                    >
                      <input
                        type="radio"
                        name="contacto"
                        className="sr-only"
                        checked={elegido === p.id}
                        onChange={() => setContactoId(p.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{p.nombre}</span>
                        {p.cargo && <span className="block truncate text-[11.5px] text-ink-muted">{p.cargo}</span>}
                      </span>
                      {p.crm.length > 0 && (
                        <span className="shrink-0 text-[11.5px] text-ink-faint">
                          {p.crm.length} {p.crm.length === 1 ? "proyecto" : "proyectos"}
                        </span>
                      )}
                    </label>
                  </li>
                ))}
                {onPersonaNueva && (
                  <li>
                    <button
                      type="button"
                      onClick={() => onPersonaNueva(empresa, proyecto.trim())}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-secondary transition-colors hover:bg-surface-subtle hover:text-ink"
                    >
                      <UserPlus className="h-3.5 w-3.5 text-ink-faint" />
                      Otra persona de {empresa}…
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>

          <EtapaYCierre valor={cierre} onCambio={setCierre} />
        </div>
        )}

        {error && <p className="border-t border-danger-line bg-danger-soft px-5 py-2.5 text-[12.5px] text-danger-text">{error}</p>}

        <footer className="flex justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3">
          <Button type="button" variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!listo || guardando}>
            {guardando && <Loader2 className="animate-spin" />}
            Crear proyecto
          </Button>
        </footer>
      </form>
    </div>
  )
}

/**
 * El primer paso del "Nuevo proyecto" del CRM: con qué empresa. Las de
 * Contactos, buscando; si no está, se carga con su primera persona.
 */
function ElegirEmpresa({
  busqueda,
  onBusqueda,
  empresas,
  cargando,
  onElegir,
  onNueva,
}: {
  busqueda: string
  onBusqueda: (v: string) => void
  empresas: string[]
  cargando: boolean
  onElegir: (empresa: string) => void
  onNueva?: (nombre: string) => void
}) {
  const palabras = palabrasDeBusqueda(busqueda)
  const lista = empresas.filter((e) => coincide(palabras, [e])).slice(0, 50)
  const escrita = busqueda.trim()
  const existe = empresas.some((e) => e.toLowerCase() === escrita.toLowerCase())
  return (
    <div className="flex min-h-0 flex-col px-5 py-4">
      <span className="text-[12px] font-medium text-ink-secondary">Empresa</span>
      <div className="relative mt-1.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
        <Input
          autoFocus
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
          onKeyDown={(e) => {
            // Enter elige la primera, en vez de mandar el formulario.
            if (e.key === "Enter") {
              e.preventDefault()
              if (lista[0]) onElegir(lista[0])
            }
          }}
          placeholder="Buscar en Contactos…"
          className="pl-8"
        />
      </div>
      <ul className="mt-2 h-[260px] space-y-0.5 overflow-y-auto">
        {cargando ? (
          <li className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />
          </li>
        ) : (
          lista.map((e) => (
            <li key={e}>
              <button
                type="button"
                onClick={() => onElegir(e)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink transition-colors hover:bg-surface-subtle"
              >
                <Building2 className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                <span className="truncate">{e}</span>
              </button>
            </li>
          ))
        )}
        {!cargando && lista.length === 0 && !escrita && (
          <li className="py-6 text-center text-[12.5px] text-ink-muted">Todavía no hay empresas en Contactos.</li>
        )}
        {onNueva && escrita && !existe && (
          <li>
            <button
              type="button"
              onClick={() => onNueva(escrita)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-secondary transition-colors hover:bg-surface-subtle hover:text-ink"
            >
              <UserPlus className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
              <span className="truncate">
                Empresa nueva: <span className="font-medium text-ink">{escrita}</span> — cargar a la persona…
              </span>
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}

/**
 * El nombre del proyecto, con sugerencias a la vista: los de esa empresa y lo
 * que más se vende. Un click las pone; escribir las filtra.
 */
export function CampoProyecto({
  valor,
  onCambio,
  sugerencias,
  opcional,
  autoFocus,
}: {
  valor: string
  onCambio: (v: string) => void
  sugerencias: string[]
  opcional?: boolean
  autoFocus?: boolean
}) {
  const todas = [...new Set([...sugerencias, ...PROYECTOS_SUGERIDOS])]
  const exacta = todas.find((s) => s.toLowerCase() === valor.trim().toLowerCase())
  // Elegida una, siguen todas a la vista (con esa marcada): si se fueran, el
  // diálogo se achicaría y el botón se movería bajo el mouse. Escribir otra
  // cosa sí las filtra.
  const palabras = exacta ? [] : palabrasDeBusqueda(valor)
  const opciones = todas.filter((s) => coincide(palabras, [s])).slice(0, 8)
  return (
    <div>
      <label className="block">
        <span className="flex items-baseline justify-between text-[12px] font-medium text-ink-secondary">
          Proyecto
          {opcional && <span className="text-[11px] font-normal text-ink-faint">opcional</span>}
        </span>
        <Input
          autoFocus={autoFocus}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          placeholder="Firma biométrica en sucursales"
          maxLength={120}
          className="mt-1.5"
        />
      </label>
      {opciones.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {opciones.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onCambio(s === exacta ? "" : s)}
              aria-pressed={s === exacta}
              className={cn(
                "max-w-full truncate rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                s === exacta
                  ? "border-ink bg-ink text-n-25"
                  : "border-line bg-surface text-ink-secondary hover:border-line-strong hover:text-ink"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** En qué etapa y con qué % entra. Se mueven juntos, como en el CRM. */
export function EtapaYCierre({ valor, onCambio }: { valor: Cierre; onCambio: (c: Cierre) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
      <label className="block">
        <span className="text-[12px] font-medium text-ink-secondary">Etapa</span>
        <span className="relative mt-1.5 flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 transition-colors hover:border-line-strong focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-100">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ESTADO_CRM_ESTILO[valor.estado].punto)} />
          <span className="flex-1 truncate text-[13px] text-ink">{ESTADO_CRM_LABEL[valor.estado]}</span>
          <ChevronDown className="h-3.5 w-3.5 text-ink-muted" />
          <select
            value={valor.estado}
            onChange={(e) => onCambio(reglaDeCierre(valor, { estado: e.target.value as EstadoCrm }))}
            className="absolute inset-0 cursor-pointer appearance-none opacity-0"
            aria-label="Etapa"
          >
            {ESTADOS_CRM.map((e) => (
              <option key={e} value={e}>
                {ESTADO_CRM_LABEL[e]}
              </option>
            ))}
          </select>
        </span>
      </label>
      <div>
        <span className="text-[12px] font-medium text-ink-secondary">% de cierre</span>
        <div className="mt-1.5 grid h-9 grid-cols-5 overflow-hidden rounded-lg border border-line">
          {PORCENTAJES.map((p, i) => (
            <button
              key={p}
              type="button"
              onClick={() => onCambio(reglaDeCierre(valor, { probabilidad: p }))}
              className={cn(
                "num px-2 text-[12px] transition-colors",
                i > 0 && "border-l border-line",
                valor.probabilidad === p
                  ? p === 100
                    ? "bg-success-soft font-medium text-success-text"
                    : "bg-surface-muted font-medium text-ink"
                  : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
              )}
            >
              {p}%
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
