import type React from "react"
import {
  ArrowRight,
  BarChart3,
  CircleDot,
  Coins,
  Gauge,
  KeyRound,
  Megaphone,
  MapPin,
  Power,
  ShieldMinus,
  Target,
  type LucideIcon,
} from "lucide-react"

import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import type { Cambio, EstadoVersion, TipoCambio, Version } from "@/lib/marketing/ads-versiones"
import { cn } from "@/lib/utils"

/**
 * La línea de tiempo de Versiones de Ads.
 *
 * Se lee de arriba hacia abajo, de lo último a lo primero, colgado de una sola
 * línea vertical que arranca en "Hoy": la continuidad es el punto. Cada versión
 * dice qué esperábamos ver, y cada cambio, por qué se hizo y con qué dato —
 * porque el historial de Google ya cuenta el qué y lo que se pierde es el
 * porqué.
 */

const TIPOS: Record<TipoCambio, { label: string; plural: string; icon: LucideIcon; tono: string }> = {
  presupuesto: { label: "Presupuesto", plural: "Presupuestos", icon: Coins, tono: "bg-brand-50 text-brand-700 ring-brand-200" },
  puja: { label: "Puja", plural: "Pujas", icon: Gauge, tono: "bg-brand-50 text-brand-700 ring-brand-200" },
  keywords: { label: "Palabras clave", plural: "Palabras clave", icon: KeyRound, tono: "bg-success-soft text-success-text ring-success-line" },
  negativas: { label: "Negativas", plural: "Negativas", icon: ShieldMinus, tono: "bg-danger-soft text-danger-text ring-danger-line" },
  anuncio: { label: "Anuncio", plural: "Anuncios", icon: Megaphone, tono: "bg-warning-soft text-warning-text ring-warning-line" },
  segmentacion: { label: "Segmentación", plural: "Segmentación", icon: MapPin, tono: "bg-surface-muted text-ink-secondary ring-line" },
  medicion: { label: "Medición", plural: "Medición", icon: Target, tono: "bg-success-soft text-success-text ring-success-line" },
  estado: { label: "Estado", plural: "Estados", icon: Power, tono: "bg-surface-muted text-ink-secondary ring-line" },
}

const ESTADOS: Record<EstadoVersion, { label: string; tone: "brand" | "success" | "neutral" }> = {
  en_curso: { label: "En observación", tone: "brand" },
  verificada: { label: "Verificada", tone: "success" },
  revertida: { label: "Revertida", tone: "neutral" },
}

const fecha = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })

export function VersionesAds({ versiones }: { versiones: Version[] }) {
  const actual = versiones[0]
  const cambios = versiones.reduce((n, v) => n + v.cambios.length, 0)
  const enCurso = versiones.filter((v) => v.estado === "en_curso").length

  return (
    <div className="mx-auto w-full max-w-[880px] space-y-10 px-5 py-8 sm:px-8">
      <Portada actual={actual} versiones={versiones.length} cambios={cambios} enCurso={enCurso} />

      <ol className="relative">
        {/* La línea: arranca fuerte en "Hoy" y se apaga hacia la primera versión. */}
        <span
          aria-hidden
          className="absolute bottom-0 left-[15px] top-2 w-[2px] rounded-full bg-gradient-to-b from-brand-500 via-brand-200 to-line"
        />

        <li className="relative flex items-center gap-4 pb-8">
          <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center">
            <span className="absolute h-8 w-8 animate-ping rounded-full bg-brand-400/25" />
            <span className="h-3.5 w-3.5 rounded-full bg-brand-500 ring-4 ring-brand-100" />
          </span>
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-700">
            Hoy · cuenta en {actual ? `v${actual.numero}` : "—"}
          </p>
        </li>

        {versiones.map((v, i) => (
          <VersionItem key={v.id} v={v} actual={i === 0} />
        ))}

        <li className="relative flex items-center gap-4 pt-2">
          <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-line-strong bg-surface" />
          </span>
          <p className="text-[11.5px] text-ink-faint">
            Antes de la v1.0: un año de cuenta con concordancia amplia, 712.276 ARS y 0 leads del sitio.
          </p>
        </li>
      </ol>
    </div>
  )
}

function Portada({
  actual,
  versiones,
  cambios,
  enCurso,
}: {
  actual?: Version
  versiones: number
  cambios: number
  enCurso: number
}) {
  return (
    <div className="rounded-2xl border border-line bg-gradient-to-br from-brand-50/80 via-surface to-surface p-6 shadow-e1 sm:p-7">
      <p className="eyebrow">Changelog de Google Ads · cuenta 300-886-7811</p>
      <h2 className="mt-2 max-w-2xl text-[20px] font-semibold leading-snug tracking-[-0.025em] text-ink">
        Cada cambio en las campañas, con su porqué y el dato que lo respalda.
      </h2>
      <p className="mt-2 max-w-2xl text-[13px] leading-[1.7] text-ink-secondary">
        El historial de Google dice qué cambió; acá queda por qué. Cada versión además anota qué esperábamos ver y
        cuándo mirarlo, para poder decir después si funcionó.
      </p>
      <div className="mt-5 grid grid-cols-3 gap-3">
        <Cifra valor={actual ? `v${actual.numero}` : "—"} label={actual ? `Actual · ${fecha(actual.fecha)}` : "Actual"} />
        <Cifra valor={String(versiones)} label={`Versiones · ${cambios} cambios`} />
        <Cifra valor={String(enCurso)} label="En observación" />
      </div>
    </div>
  )
}

function Cifra({ valor, label }: { valor: string; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-e1">
      <p className="num text-[22px] font-bold leading-none text-ink">{valor}</p>
      <p className="mt-1.5 text-[11px] leading-tight text-ink-muted">{label}</p>
    </div>
  )
}

function VersionItem({ v, actual }: { v: Version; actual: boolean }) {
  const estado = ESTADOS[v.estado]
  return (
    <li className="relative flex gap-4 pb-5">
      <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full border-2 font-mono text-[9.5px] font-bold",
            actual
              ? "border-brand-500 bg-brand-500 text-white shadow-e1"
              : "border-brand-200 bg-surface text-brand-700"
          )}
        >
          {v.numero}
        </span>
      </span>

      {/* La tarjeta es el resumen; el detalle vive en su propia página, con
          link para compartir una versión puntual. */}
      <Link
        href={`/marketing/versiones/v${v.numero}`}
        className={cn(
          "group min-w-0 flex-1 rounded-xl border bg-surface p-4 shadow-e1 transition-all hover:-translate-y-px hover:shadow-e2 sm:px-5",
          actual ? "border-brand-200" : "border-line hover:border-brand-200"
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="font-mono text-[12px] font-semibold text-ink">v{v.numero}</span>
          <span className="text-ink-faint">·</span>
          <time className="text-[12px] text-ink-muted">{fecha(v.fecha)}</time>
          <Badge tone={estado.tone} size="sm" className="ml-auto">
            {estado.label}
          </Badge>
        </div>
        <h3 className="mt-1.5 text-[15px] font-semibold leading-snug tracking-[-0.02em] text-ink">{v.titulo}</h3>
        <Resumen v={v} />
        <span className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-700">
          Ver detalle
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </Link>
    </li>
  )
}

/** La página de una versión: todo lo que la tarjeta resume. */
export function VersionDetalle({ v }: { v: Version }) {
  const estado = ESTADOS[v.estado]
  return (
    <div className="mx-auto w-full max-w-[880px] space-y-5 px-5 py-8 sm:px-8">
      <div className="rounded-2xl border border-line bg-gradient-to-br from-brand-50/80 via-surface to-surface p-6 shadow-e1 sm:p-7">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="rounded-md bg-brand-500 px-2 py-1 font-mono text-[12px] font-bold text-white">v{v.numero}</span>
          <time className="text-[12.5px] text-ink-muted">{fecha(v.fecha)}</time>
          <span className="text-ink-faint">·</span>
          <span className="text-[12.5px] text-ink-muted">{v.autor}</span>
          <Badge tone={estado.tone} size="md" className="ml-auto">
            {estado.label}
          </Badge>
        </div>
        <h2 className="mt-3 text-[21px] font-semibold leading-snug tracking-[-0.025em] text-ink">{v.titulo}</h2>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-[1.7] text-ink-secondary">{v.resumen}</p>
        <Resumen v={v} />
      </div>

      {(v.esperado || v.resultado) && (
        <div className={cn("grid gap-3 [&>*]:mt-0", v.esperado && v.resultado && "sm:grid-cols-2")}>
          {v.esperado && (
            <Nota icon={CircleDot} titulo="Qué esperamos ver" tono="brand">
              {v.esperado}
              {v.revisar_el && (
                <span className="mt-1 block text-[11.5px] font-medium text-brand-700">Revisar el {fecha(v.revisar_el)}</span>
              )}
            </Nota>
          )}
          {v.resultado && (
            <Nota icon={BarChart3} titulo="Qué pasó" tono="success">
              {v.resultado}
            </Nota>
          )}
        </div>
      )}

      <section className="rounded-xl border border-line bg-surface px-5 pb-2 pt-4 shadow-e1">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
          {v.cambios.length} {v.cambios.length === 1 ? "cambio" : "cambios"}
        </h3>
        <ul className="mt-2 divide-y divide-line-soft">
          {v.cambios.map((c, i) => (
            <CambioFila key={i} c={c} />
          ))}
        </ul>
      </section>
    </div>
  )
}

/**
 * Lo que se ve con la versión cerrada: qué tipo de cambios tuvo, a qué
 * campañas tocó y, según dónde esté, cuándo se mira o qué pasó. Sale todo de
 * los cambios cargados, así una versión nueva no necesita un campo más.
 */
function Resumen({ v }: { v: Version }) {
  const porTipo = new Map<TipoCambio, number>()
  for (const c of v.cambios) porTipo.set(c.tipo, (porTipo.get(c.tipo) ?? 0) + 1)
  const campanas = [...new Set(v.cambios.map((c) => c.campana))]

  return (
    <div className="mt-2.5 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {[...porTipo].map(([tipo, n]) => {
          const t = TIPOS[tipo] ?? TIPOS.estado
          const Icon = t.icon
          return (
            <span
              key={tipo}
              className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-[3px] text-[10.5px] font-semibold ring-1 ring-inset", t.tono)}
            >
              <Icon className="h-3 w-3" />
              {n} {(n === 1 ? t.label : t.plural).toLowerCase()}
            </span>
          )
        })}
      </div>
      <p className="text-[11.5px] leading-relaxed text-ink-muted">
        {campanas.join(" · ")}
        {v.estado === "en_curso" && v.revisar_el && (
          <span className="text-brand-700"> — se revisa el {fecha(v.revisar_el)}</span>
        )}
        {v.estado !== "en_curso" && v.resultado && (
          <span className="mt-1 block text-success-text">✓ {v.resultado.split(/(?<=\.)\s/)[0]}</span>
        )}
      </p>
    </div>
  )
}

function CambioFila({ c }: { c: Cambio }) {
  const t = TIPOS[c.tipo] ?? TIPOS.estado
  const Icon = t.icon
  return (
    <li className="flex gap-3 py-3.5">
      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset", t.tono)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-faint">{t.label}</span>
          <span className="rounded-md bg-surface-muted px-1.5 py-[2px] text-[10.5px] font-medium text-ink-secondary">
            {c.campana}
          </span>
        </div>
        <p className="mt-1 text-[13.5px] font-medium leading-snug text-ink">{c.que}</p>
        {(c.antes || c.despues) && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[11.5px]">
            {c.antes && <span className="rounded bg-danger-soft/60 px-1.5 py-0.5 text-ink-muted line-through">{c.antes}</span>}
            {c.antes && c.despues && <ArrowRight className="h-3 w-3 text-ink-faint" />}
            {c.despues && <span className="rounded bg-success-soft px-1.5 py-0.5 text-success-text">{c.despues}</span>}
          </p>
        )}
        <p className="mt-1.5 text-[12.5px] leading-[1.65] text-ink-secondary">
          <span className="font-semibold text-ink">Por qué: </span>
          {c.porque}
        </p>
        {c.dato && (
          <p className="mt-1.5 flex gap-1.5 rounded-lg bg-surface-subtle px-2.5 py-1.5 text-[11.5px] leading-[1.6] text-ink-muted">
            <BarChart3 className="mt-[3px] h-3 w-3 shrink-0 text-ink-faint" />
            <span>{c.dato}</span>
          </p>
        )}
      </div>
    </li>
  )
}

function Nota({
  icon: Icon,
  titulo,
  tono,
  children,
}: {
  icon: LucideIcon
  titulo: string
  tono: "brand" | "success"
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "mt-4 flex gap-2.5 rounded-lg border px-3.5 py-3",
        tono === "brand" ? "border-brand-200 bg-brand-50/60" : "border-success-line bg-success-soft"
      )}
    >
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", tono === "brand" ? "text-brand-600" : "text-success-text")} />
      <div className="text-[12.5px] leading-[1.6] text-ink-secondary">
        <p className={cn("mb-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]", tono === "brand" ? "text-brand-700" : "text-success-text")}>
          {titulo}
        </p>
        {children}
      </div>
    </div>
  )
}
