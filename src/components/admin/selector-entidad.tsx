"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Loader2, Plus, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { errorDeCuit, esCuitValido, formatearCuit } from "@/lib/admin/cuit"
import type { Cliente } from "@/lib/admin/entidades"
import { cn } from "@/lib/utils"

/**
 * Elegir el cliente o el proveedor de un documento.
 *
 * Estaba copiado en el formulario de comprobantes y en el de recibos, y la
 * tercera copia iba a ser la de la carga de facturas. Las tres hacían lo mismo
 * con diferencias que no eran decisiones sino accidentes: una cerraba la lista
 * con `onClick` y la otra con `onBlur` y un `setTimeout` de 150 ms.
 *
 * Devuelve la ficha entera y no solo el id a propósito. Quien la elige necesita
 * lo que la ficha ya sabe —el plazo de pago que propone el vencimiento, la
 * cuenta contra la que se imputan sus facturas— y eso es justamente lo que
 * evita volver a tipear en cada comprobante lo que ya está cargado una vez.
 */
export function SelectorEntidad({
  id = "entidad",
  tipo,
  valor,
  nombre,
  disabled,
  etiqueta,
  permitirAlta,
  onElegir,
}: {
  id?: string
  /** De qué maestro se elige. */
  tipo: "cliente" | "proveedor"
  /** El id ya elegido, si lo hay. Sirve para dibujar el tilde. */
  valor: string
  /** Cómo se llama lo elegido, que es lo que se muestra con la lista cerrada. */
  nombre: string
  disabled?: boolean
  /** Para omitir el rótulo cuando el contexto ya lo dice. */
  etiqueta?: string | null
  /**
   * Ofrecer dar de alta la ficha cuando la búsqueda no encuentra nada.
   *
   * Va donde cargar el documento es la tarea y el maestro es un medio —una
   * factura de un proveedor nuevo—, y no donde la ficha tiene que existir por
   * fuerza: a un proveedor recién creado no se le puede pagar nada todavía,
   * así que en el formulario de recibos el botón sólo sería ruido.
   */
  permitirAlta?: boolean
  onElegir: (c: Cliente) => void
}) {
  const [q, setQ] = useState("")
  const [abierto, setAbierto] = useState(false)
  const [resultados, setResultados] = useState<Cliente[]>([])
  const [buscando, setBuscando] = useState(false)
  const [creando, setCreando] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  const recurso = tipo === "proveedor" ? "proveedores" : "clientes"
  const rotulo = etiqueta === undefined ? (tipo === "proveedor" ? "Proveedor" : "Cliente") : etiqueta

  useEffect(() => {
    if (!abierto) return
    const t = setTimeout(async () => {
      setBuscando(true)
      try {
        const params = new URLSearchParams({ porPagina: "8", estado: "activos" })
        if (q.trim()) params.set("q", q.trim())
        const res = await fetch(`/api/admin/${recurso}?${params}`)
        const data = await res.json()
        setResultados(data[recurso] ?? [])
      } catch {
        setResultados([])
      } finally {
        setBuscando(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, abierto, recurso])

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener("mousedown", fuera)
    return () => document.removeEventListener("mousedown", fuera)
  }, [])

  return (
    <div ref={caja} className="relative">
      {rotulo && (
        <label htmlFor={id} className="text-[12.5px] font-semibold text-ink">
          {rotulo}
        </label>
      )}

      <div className={cn("relative", rotulo && "mt-1.5")}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
        <Input
          id={id}
          value={abierto ? q : nombre}
          onChange={(e) => {
            setQ(e.target.value)
            setAbierto(true)
          }}
          onFocus={() => {
            setQ("")
            setAbierto(true)
          }}
          placeholder="Buscar por razón social o CUIT…"
          className={cn("pl-9", valor && !abierto && "font-medium")}
          disabled={disabled}
          autoComplete="off"
        />
        {valor && !abierto && (
          <Check className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-success" />
        )}
      </div>

      {abierto && creando && (
        <AltaRapida
          tipo={tipo}
          razonSocialInicial={q}
          onCancelar={() => setCreando(false)}
          onCreada={(c) => {
            onElegir(c)
            setCreando(false)
            setAbierto(false)
            setQ("")
          }}
        />
      )}

      {abierto && !creando && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-e3">
          {buscando && resultados.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-ink-muted">Buscando…</p>
          ) : resultados.length === 0 ? (
            <div className="px-3 py-3">
              <p className="text-[12px] text-ink-muted">
                {q.trim() ? `No hay ningún ${tipo} con ese nombre.` : "Escribí para buscar."}
              </p>
              {permitirAlta && q.trim().length >= 2 && (
                <button
                  type="button"
                  onClick={() => setCreando(true)}
                  className="mt-2 flex w-full items-center gap-2 rounded-lg bg-brand-50 px-2.5 py-2 text-left text-[12.5px] font-medium text-brand-700 transition-colors hover:bg-brand-100"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Dar de alta «{q.trim()}»</span>
                </button>
              )}
            </div>
          ) : (
            resultados.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onElegir(c)
                  setAbierto(false)
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-brand-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {c.razonSocial}
                  </span>
                  {c.cuit && (
                    <span className="num block text-[11px] text-ink-muted">
                      {formatearCuit(c.cuit)}
                    </span>
                  )}
                </span>
                {c.condicionPagoDias !== null && (
                  <span className="num shrink-0 text-[11px] text-ink-faint">
                    {c.condicionPagoDias} d
                  </span>
                )}
              </button>
            ))
          )}

          {/* También con resultados a la vista: buscar "TECNO" puede traer tres
              fichas y que ninguna sea la del papel. */}
          {permitirAlta && resultados.length > 0 && q.trim().length >= 2 && (
            <button
              type="button"
              onClick={() => setCreando(true)}
              className="mt-1 flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-[12px] font-medium text-brand-600 transition-colors hover:bg-brand-50"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Ninguno: dar de alta «{q.trim()}»</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Alta rápida ──────────────────────────────────────────────────────────── */

/**
 * Dar de alta la ficha sin salir de la carga del documento.
 *
 * Existía sólo en la carga por PDF, y era una asimetría que no tenía defensa:
 * subir la factura escaneada de un proveedor nuevo funcionaba, y tipear esa
 * misma factura a mano te dejaba con el botón de guardar deshabilitado y un
 * "no hay resultados" sin salida. La única forma de seguir era abandonar la
 * carga, ir al maestro, crear la ficha y volver a empezar.
 *
 * Pide sólo dos datos, y el CUIT es obligatorio por la misma razón que en la
 * importación: es lo que identifica al proveedor y lo que va a permitir
 * encontrarlo la próxima vez. Una ficha sin CUIT nace condenada a duplicarse.
 * El resto —domicilio, categoría, plazo de pago— se completa después desde el
 * maestro, cuando haya tiempo; nada de eso hace falta para registrar la factura.
 */
function AltaRapida({
  tipo,
  razonSocialInicial,
  onCancelar,
  onCreada,
}: {
  tipo: "cliente" | "proveedor"
  razonSocialInicial: string
  onCancelar: () => void
  onCreada: (c: Cliente) => void
}) {
  const recurso = tipo === "proveedor" ? "proveedores" : "clientes"
  const [razonSocial, setRazonSocial] = useState(razonSocialInicial.trim())
  const [cuit, setCuit] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const problemaCuit = cuit.trim() ? errorDeCuit(cuit) : null
  const puedeCrear = razonSocial.trim().length >= 2 && esCuitValido(cuit) && !guardando

  const crear = async () => {
    if (!puedeCrear) return
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/${recurso}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ razonSocial: razonSocial.trim(), cuit, origen: "nacional" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo dar de alta")

      // La clave con que viaja la ficha creada depende del recurso, así que se
      // toma el primer objeto de la respuesta en vez de adivinarle el nombre.
      const creada = Object.values(data).find(
        (v): v is Cliente => typeof v === "object" && v !== null && "id" in v
      )
      if (!creada) throw new Error("La ficha se creó pero no volvió: buscala en el maestro")

      onCreada(creada)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo dar de alta")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="absolute z-20 mt-1 w-full rounded-xl border border-line bg-surface p-3 shadow-e3">
      <div className="mb-2.5 flex items-center gap-2">
        <Plus className="h-3.5 w-3.5 shrink-0 text-brand-600" />
        <span className="text-[12.5px] font-semibold text-ink">
          {tipo === "proveedor" ? "Nuevo proveedor" : "Nuevo cliente"}
        </span>
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          aria-label="Cancelar"
          className="ml-auto flex h-6 w-6 items-center justify-center rounded text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-subtle">
            Razón social
          </label>
          <Input
            value={razonSocial}
            onChange={(e) => setRazonSocial(e.target.value)}
            disabled={guardando}
            className="mt-1 h-8 text-[12.5px]"
            autoFocus
          />
        </div>

        <div>
          <label className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-subtle">
            CUIT
          </label>
          <Input
            value={cuit}
            onChange={(e) => setCuit(e.target.value)}
            disabled={guardando}
            placeholder="30-50054729-0"
            className="num mt-1 h-8 text-[12.5px]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void crear()
              }
            }}
          />
          <p
            className={cn(
              "mt-1 text-[11px] leading-snug",
              problemaCuit ? "text-warning-text" : "text-ink-muted"
            )}
          >
            {problemaCuit ??
              `Es lo que identifica al ${tipo}: sin él, su próxima factura no lo va a encontrar.`}
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-[11.5px] text-danger-text">
          {error}
        </p>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Button>
        <Button size="sm" onClick={crear} disabled={!puedeCrear}>
          {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Dar de alta
        </Button>
      </div>
    </div>
  )
}
