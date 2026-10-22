"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useQuery } from "@tanstack/react-query"
import { Building2, ChevronDown, Loader2, Mail, Network, Phone, Quote, Users, X } from "lucide-react"

import { Avatar } from "@/components/ui/avatar"
import { claveDe, mensajeError, pedirJson } from "@/lib/admin/query"
import { ESTADO_CRM_ESTILO, ESTADO_CRM_LABEL, ESTA_ABIERTA } from "@/lib/comercial/crm"
import type { FichaEmpresa } from "@/lib/contactos-compartido"
import { usePresencia } from "@/lib/use-presencia"
import { cn } from "@/lib/utils"

/**
 * Las personas de una empresa como un diagrama: la empresa arriba, sus áreas
 * abajo y en cada área quiénes tenemos.
 *
 * No es un organigrama de jerarquía —no sabemos quién reporta a quién y no se
 * inventa—: responde a "¿con quién hablo de qué en esta empresa?". Se entra por
 * un ejecutivo y te derivan a alguien de finanzas o de sistemas; acá se ve de
 * un vistazo quién es cada uno, por qué lo tenemos (la observación) y en qué
 * quedó en el CRM.
 *
 * Usa la misma ficha que el panel de la empresa (misma clave de caché): si el
 * panel ya la trajo, el diagrama abre al instante.
 */

type Persona = FichaEmpresa["personas"][number]

const SIN_AREA = "Sin área"

const claveArea = (area: string) =>
  area
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()

export function urlFichaEmpresa(empresa: string) {
  return `/api/contactos/empresa?nombre=${encodeURIComponent(empresa)}`
}

export function OrganigramaEmpresa({
  empresa,
  destacado,
  onCerrar,
}: {
  /** `null` lo cierra. */
  empresa: string | null
  /** La persona desde la que se abrió: se marca y viene abierta. */
  destacado?: string | null
  onCerrar: () => void
}) {
  const { montado, saliendo } = usePresencia(empresa !== null, 160)
  const [mostrada, setMostrada] = useState(empresa)
  if (empresa && empresa !== mostrada) setMostrada(empresa)

  const url = urlFichaEmpresa(mostrada ?? "")
  const q = useQuery({
    queryKey: claveDe("marketing", url),
    queryFn: ({ signal }) => pedirJson<FichaEmpresa>(url, { signal }),
    enabled: !!mostrada,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!empresa) return
    // En captura y sin propagar: si se abrió desde una ficha, Escape cierra el
    // organigrama y deja la ficha abierta, en vez de cerrar las dos.
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      onCerrar()
    }
    window.addEventListener("keydown", tecla, true)
    // Mientras está abierto, la página de atrás no scrollea.
    const antes = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", tecla, true)
      document.body.style.overflow = antes
    }
  }, [empresa, onCerrar])

  if (!montado || !mostrada) return null
  const f = q.data

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={`Organigrama de ${f?.nombre ?? mostrada}`}>
      <div
        onClick={onCerrar}
        className={cn(
          "absolute inset-0 bg-navy-950/45 backdrop-blur-[3px] transition-opacity duration-150",
          saliendo ? "opacity-0" : "opacity-100 animate-in fade-in-0"
        )}
      />
      <div
        className={cn(
          "absolute inset-2 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-e4 sm:inset-5",
          saliendo
            ? "pointer-events-none opacity-0 transition-opacity duration-150"
            : "animate-in fade-in-0 zoom-in-[0.985] [animation-duration:180ms]"
        )}
      >
        <header className="flex items-center gap-3 border-b border-line bg-surface px-5 py-3.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <Network className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold tracking-[-0.015em] text-ink">
              Organigrama · {f?.nombre ?? mostrada}
            </h2>
            <p className="truncate text-[12px] text-ink-muted">
              Quiénes tenemos en la empresa y para qué es cada uno. Agrupado por área, sin jerarquía.
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div
          className={cn(
            "relative flex-1 overflow-auto",
            // Una grilla de puntos tenue: se lee como lienzo, no como formulario.
            "bg-surface-subtle bg-[radial-gradient(circle,var(--color-line)_1px,transparent_1.2px)] [background-size:22px_22px]"
          )}
        >
          {q.isPending ? (
            <div className="flex h-full items-center justify-center gap-2 text-[12.5px] text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Armando el organigrama…
            </div>
          ) : q.isError || !f ? (
            <div className="flex h-full items-center justify-center text-[12.5px] text-danger-text">
              {mensajeError(q.error, "No se pudo cargar la empresa")}
            </div>
          ) : (
            <Diagrama ficha={f} destacado={destacado ?? null} />
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ── El diagrama ─────────────────────────────────────────────────────────── */

function Diagrama({ ficha, destacado }: { ficha: FichaEmpresa; destacado: string | null }) {
  // Por área, la más poblada primero y "Sin área" al final: el ojo arranca por
  // donde más gente hay.
  const areas = useMemo(() => {
    // El área es texto libre: "Finanzas", "finanzas" y "Finanzas " son la
    // misma. Se agrupa por la forma sin mayúsculas, acentos ni espacios de más,
    // y se muestra la forma en que más veces está escrita.
    const m = new Map<string, { personas: Persona[]; formas: Map<string, number> }>()
    for (const p of ficha.personas) {
      const forma = p.departamento?.trim().replace(/\s+/g, " ") || SIN_AREA
      const k = claveArea(forma)
      const grupo = m.get(k) ?? { personas: [] as Persona[], formas: new Map<string, number>() }
      grupo.personas.push(p)
      grupo.formas.set(forma, (grupo.formas.get(forma) ?? 0) + 1)
      m.set(k, grupo)
    }
    return [...m.values()]
      .map(({ personas, formas }) => ({
        nombre: [...formas.entries()].sort((x, y) => y[1] - x[1])[0][0],
        personas: personas.sort((x, y) => x.nombre.localeCompare(y.nombre, "es")),
      }))
      .sort(
        (a, b) =>
          Number(a.nombre === SIN_AREA) - Number(b.nombre === SIN_AREA) ||
          b.personas.length - a.personas.length ||
          a.nombre.localeCompare(b.nombre, "es")
      )
  }, [ficha.personas])

  const enCrm = ficha.personas.filter((p) => p.crm.length > 0).length
  // Con una sola área (o ninguna cargada) el escalón del área no dice nada:
  // las personas cuelgan directo de la empresa.
  const conAreas = !(areas.length === 1 && areas[0].nombre === SIN_AREA)

  return (
    <div className="mx-auto flex min-w-max flex-col items-center px-10 pb-16 pt-10">
      <NodoEmpresa
        nombre={ficha.nombre}
        vertical={ficha.vertical}
        personas={ficha.personas.length}
        areas={conAreas ? areas.length : 0}
        enCrm={enCrm}
        cliente={ficha.cliente?.razonSocial ?? null}
      />
      <Tallo />

      <Ramas>
        {conAreas
          ? areas.map((a) => (
              <div key={a.nombre} className="flex flex-col items-center">
                <NodoArea nombre={a.nombre} cantidad={a.personas.length} />
                <Tallo corto />
                <Columna personas={a.personas} destacado={destacado} />
              </div>
            ))
          : areas[0].personas.map((p) => <Tarjeta key={p.id} persona={p} destacada={p.id === destacado} />)}
      </Ramas>
    </div>
  )
}

/** La línea que baja de un nodo. */
function Tallo({ corto }: { corto?: boolean }) {
  return <span aria-hidden className={cn("block w-px bg-line-strong", corto ? "h-5" : "h-8")} />
}

/**
 * Los hijos en fila, cada uno colgando de una barra horizontal: la barra va del
 * centro del primero al centro del último, y de ella baja un tramo a cada uno.
 */
function Ramas({ children }: { children: React.ReactNode }) {
  const hijos = Array.isArray(children) ? children : [children]
  return (
    <div className="flex items-start justify-center">
      {hijos.map((hijo, i) => (
        <div key={i} className="relative flex flex-col items-center px-4 pt-8">
          {hijos.length > 1 && (
            <span
              aria-hidden
              className="absolute top-0 h-px bg-line-strong"
              style={{ left: i === 0 ? "50%" : 0, right: i === hijos.length - 1 ? "50%" : 0 }}
            />
          )}
          <span aria-hidden className="absolute left-1/2 top-0 h-8 w-px bg-line-strong" />
          {hijo}
        </div>
      ))}
    </div>
  )
}

/** Las personas de un área, una abajo de la otra, unidas por el mismo tallo. */
function Columna({ personas, destacado }: { personas: Persona[]; destacado: string | null }) {
  return (
    <div className="flex flex-col items-center">
      {personas.map((p, i) => (
        <div key={p.id} className="flex flex-col items-center">
          {i > 0 && <Tallo corto />}
          <Tarjeta persona={p} destacada={p.id === destacado} />
        </div>
      ))}
    </div>
  )
}

/* ── Los nodos ───────────────────────────────────────────────────────────── */

function iniciales(texto: string) {
  const palabras = texto.replace(/\b(S\.?A\.?|S\.?R\.?L\.?|SAS|Argentina)\b/gi, "").trim().split(/\s+/)
  return (palabras.length > 1 ? palabras[0][0] + palabras[1][0] : (palabras[0] ?? "?").slice(0, 2)).toUpperCase()
}

function NodoEmpresa({
  nombre,
  vertical,
  personas,
  areas,
  enCrm,
  cliente,
}: {
  nombre: string
  vertical: string | null
  personas: number
  areas: number
  enCrm: number
  cliente: string | null
}) {
  return (
    <div className="relative w-[340px] overflow-hidden rounded-2xl border border-navy-800 bg-navy-900 px-5 py-4 text-white shadow-e3">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-brand-500/25 blur-2xl"
      />
      <div className="relative flex items-center gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-[15px] font-bold tracking-[0.02em] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
          {iniciales(nombre)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold tracking-[-0.015em]">{nombre}</p>
          <p className="truncate text-[12px] text-white/60">{vertical ?? "Sin vertical"}</p>
        </div>
      </div>
      <div className="relative mt-3.5 flex flex-wrap items-center gap-1.5 text-[11px]">
        <Pastilla icono={<Users className="h-3 w-3" />}>
          {personas} {personas === 1 ? "persona" : "personas"}
        </Pastilla>
        {areas > 1 && <Pastilla icono={<Network className="h-3 w-3" />}>{areas} áreas</Pastilla>}
        {enCrm > 0 && <Pastilla>{enCrm} en el CRM</Pastilla>}
        {cliente && (
          <span className="rounded-full bg-success/20 px-2 py-0.5 font-medium text-emerald-200 ring-1 ring-inset ring-emerald-300/30">
            Es cliente
          </span>
        )}
      </div>
    </div>
  )
}

function Pastilla({ icono, children }: { icono?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-white/85 ring-1 ring-inset ring-white/10">
      {icono}
      {children}
    </span>
  )
}

function NodoArea({ nombre, cantidad }: { nombre: string; cantidad: number }) {
  const sinArea = nombre === SIN_AREA
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold shadow-e1",
        sinArea ? "border-dashed border-line-strong bg-surface text-ink-muted" : "border-line bg-surface text-ink"
      )}
    >
      <Building2 className={cn("h-3.5 w-3.5", sinArea ? "text-ink-faint" : "text-brand-600")} />
      {nombre}
      <span className="num rounded-full bg-surface-muted px-1.5 text-[10.5px] font-medium text-ink-muted">{cantidad}</span>
    </span>
  )
}

/**
 * Una persona. Cerrada muestra lo que distingue a cada una —cargo, para qué la
 * tenemos y en qué quedó—; abierta, la observación entera y cómo contactarla.
 */
function Tarjeta({ persona: p, destacada }: { persona: Persona; destacada: boolean }) {
  const [abierta, setAbierta] = useState(destacada)
  const proyecto = p.crm.find((o) => ESTA_ABIERTA(o.estado)) ?? p.crm[0]
  const otros = p.crm.length - (proyecto ? 1 : 0)
  const tieneMas = Boolean(p.email || p.telefono || p.crm.length > 1 || (p.observaciones?.length ?? 0) > 110)

  return (
    <div
      className={cn(
        "group relative w-[272px] rounded-xl border bg-surface text-left shadow-e1 transition-[box-shadow,border-color,transform] duration-150",
        destacada
          ? "border-brand-300 ring-4 ring-brand-100"
          : "border-line hover:-translate-y-px hover:border-line-strong hover:shadow-e2"
      )}
    >
      {destacada && (
        <span className="absolute -top-2.5 left-3 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-e1">
          Estás acá
        </span>
      )}

      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="block w-full rounded-xl px-3.5 pb-3 pt-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        <div className="flex items-start gap-2.5">
          <Avatar id={p.id} nombre={p.nombre} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{p.nombre}</p>
            <p className="line-clamp-2 text-[12px] leading-snug text-ink-muted" title={p.cargo ?? undefined}>
              {p.cargo || "Sin cargo cargado"}
            </p>
          </div>
          {tieneMas && (
            <ChevronDown
              className={cn("mt-1 h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform", abierta && "rotate-180")}
            />
          )}
        </div>

        {p.observaciones && (
          <p
            className={cn(
              "mt-2.5 flex gap-1.5 rounded-lg bg-surface-subtle px-2.5 py-2 text-[12px] leading-snug text-ink-secondary"
            )}
          >
            <Quote className="mt-0.5 h-3 w-3 shrink-0 rotate-180 text-ink-faint" />
            <span className={cn(!abierta && "line-clamp-3")}>{p.observaciones}</span>
          </p>
        )}

        {proyecto && (
          <div className="mt-2.5 flex items-center gap-1.5 text-[11.5px]">
            <span
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium",
                ESTADO_CRM_ESTILO[proyecto.estado].chip
              )}
            >
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ESTADO_CRM_ESTILO[proyecto.estado].punto)} />
              <span className="truncate">{proyecto.proyecto || ESTADO_CRM_LABEL[proyecto.estado]}</span>
              <span className="num shrink-0 opacity-70">{proyecto.probabilidad}%</span>
            </span>
            {otros > 0 && !abierta && <span className="shrink-0 text-ink-faint">+{otros}</span>}
          </div>
        )}

        <div className="mt-2.5 flex items-center gap-1.5 border-t border-line-soft pt-2 text-[11px] text-ink-muted">
          <Avatar id={p.amId} nombre={p.amNombre} size="xs" />
          <span className="truncate">{p.amNombre ? `AM: ${p.amNombre}` : "Sin AM asignado"}</span>
        </div>
      </button>

      {abierta && (
        <div className="space-y-2 border-t border-line-soft px-3.5 py-3 text-[12px] animate-in fade-in-0 [animation-duration:120ms]">
          {p.email && (
            <a href={`mailto:${p.email}`} className="flex items-center gap-2 text-ink-secondary hover:text-brand-700">
              <Mail className="h-3.5 w-3.5 text-ink-faint" />
              <span className="truncate">{p.email}</span>
            </a>
          )}
          {p.telefono && (
            <a
              href={`tel:${p.telefono.replace(/[^\d+]/g, "")}`}
              className="num flex items-center gap-2 text-ink-secondary hover:text-ink"
            >
              <Phone className="h-3.5 w-3.5 text-ink-faint" />
              {p.telefono}
            </a>
          )}
          {p.crm.length > 0 && (
            <div className="pt-0.5">
              <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
                En el CRM
              </p>
              <ul className="space-y-1.5">
                {p.crm.map((o) => (
                  <li key={o.id} className="flex gap-2">
                    <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", ESTADO_CRM_ESTILO[o.estado].punto)} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{o.proyecto || "Sin proyecto"}</span>
                      <span className="block truncate text-[11.5px] text-ink-muted">
                        {ESTADO_CRM_LABEL[o.estado]} · <span className="num">{o.probabilidad}%</span> · lo sigue{" "}
                        {o.ownerNombre}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!p.email && !p.telefono && p.crm.length === 0 && (
            <p className="text-ink-muted">No tiene mail ni teléfono cargados.</p>
          )}
        </div>
      )}
    </div>
  )
}
