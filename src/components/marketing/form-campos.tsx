"use client"

import type React from "react"

import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/**
 * El andamiaje de los formularios de marketing: sección numerada, campo con
 * etiqueta y pista, contador de caracteres, interruptor, tarjetas y control
 * segmentado. Es el mismo lenguaje del editor de popups, para que cargar un
 * evento se sienta como cargar un popup.
 */

/** A partir de qué porcentaje del tope el contador se pone naranja. */
const AVISO_DESDE = 0.8

export function Seccion({
  num,
  titulo,
  bajada,
  accion,
  children,
}: {
  num: string
  titulo: string
  bajada?: string
  accion?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-e1">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-[11px] tabular-nums text-ink-faint">{num}</span>
            <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{titulo}</h2>
          </div>
          {bajada && <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{bajada}</p>}
        </div>
        {accion}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

export function Campo({
  label,
  pista,
  contador,
  children,
}: {
  label: string
  pista?: string
  contador?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label className="text-[12px] font-medium text-ink-secondary">{label}</label>
        {contador}
      </div>
      {children}
      {pista && <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-muted">{pista}</p>}
    </div>
  )
}

export function Contador({ largo, max }: { largo: number; max: number }) {
  const cerca = largo >= max * AVISO_DESDE
  return (
    <span className={cn("font-mono text-[10.5px] tabular-nums transition-colors", cerca ? "text-warning" : "text-ink-faint")}>
      {largo}/{max}
    </span>
  )
}

export function CampoTexto({
  label,
  valor,
  onChange,
  max,
  placeholder,
  pista,
  obligatorio,
  mono,
}: {
  label: string
  valor: string
  onChange: (v: string) => void
  max: number
  placeholder?: string
  pista?: string
  obligatorio?: boolean
  mono?: boolean
}) {
  return (
    <Campo label={obligatorio ? `${label} *` : label} pista={pista} contador={<Contador largo={valor.length} max={max} />}>
      <Input
        value={valor}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={mono ? "font-mono text-[12px]" : undefined}
      />
    </Campo>
  )
}

export function CampoArea({
  label,
  valor,
  onChange,
  max,
  placeholder,
  pista,
  filas = 3,
}: {
  label: string
  valor: string
  onChange: (v: string) => void
  max: number
  placeholder?: string
  pista?: string
  filas?: number
}) {
  return (
    <Campo label={label} pista={pista} contador={<Contador largo={valor.length} max={max} />}>
      <Textarea rows={filas} value={valor} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Campo>
  )
}

export function Interruptor({
  label,
  pista,
  valor,
  onChange,
}: {
  label: string
  pista?: string
  valor: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-ink">{label}</p>
        {pista && <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">{pista}</p>}
      </div>
      <Switch checked={valor} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </div>
  )
}

export function Tarjeta({
  activo,
  titulo,
  pista,
  onClick,
  children,
}: {
  activo: boolean
  titulo: string
  pista?: string
  onClick: () => void
  children?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3 text-left transition-colors duration-150",
        activo ? "border-brand-400 bg-brand-50 shadow-e1" : "border-line bg-surface hover:border-line-strong hover:bg-surface-subtle"
      )}
    >
      {children}
      <p className={cn("text-[12.5px] font-semibold", activo ? "text-brand-700" : "text-ink")}>{titulo}</p>
      {pista && <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">{pista}</p>}
    </button>
  )
}

export function Segmentado<T extends string>({
  opciones,
  valor,
  onChange,
}: {
  opciones: { v: T; label: string }[]
  valor: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-surface-muted p-0.5">
      {opciones.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "h-7 rounded-md px-2.5 text-[11.5px] font-medium transition-colors duration-150",
            valor === o.v ? "bg-surface text-ink shadow-e1" : "text-ink-muted hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
