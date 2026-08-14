"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, RotateCcw, Sparkles, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { TEMPLATES, promptDeTemplate } from "@/lib/templates-pieza"
import { cambiarArchivado, useTemplatesArchivados } from "@/lib/templates-browser"
import type { PiezaGenerada } from "@/lib/piezas"

/**
 * El probador: el mismo contenido en todos los templates, uno al lado del otro.
 *
 * Es la única forma de juzgar si tienen la misma personalidad. Una pieza suelta
 * siempre parece razonable; recién puestas juntas se ve si son de la misma marca
 * o si son un montón de cosas distintas que salieron el mismo día.
 *
 * Van en serie y no en paralelo: todas las llamadas juntas terminan en rate
 * limit y además así se ven aparecer una por una, que es más útil que esperar a
 * que estén todas.
 */

type Resultado = { templateId: string; imagen: string | null; error?: string }

export function ProbadorTemplates() {
  const [titular, setTitular] = useState("Las caídas de red pasaron de 5 por semana a 1 por mes")
  const [etiqueta, setEtiqueta] = useState("Networking")
  const [sujeto, setSujeto] = useState(
    "un rack de red ordenado en una sala técnica real, luz natural, sin personas"
  )
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [enCurso, setEnCurso] = useState<string | null>(null)
  // El id de la tanda: todas las piezas generadas juntas lo comparten, y por eso
  // el historial las puede mostrar como una versión del sistema y no sueltas.
  const [lote, setLote] = useState<string | null>(null)
  const [refrescar, setRefrescar] = useState(0)
  const [historial, setHistorial] = useState<PiezaGenerada[]>([])
  // Cuál está pidiendo confirmación para archivarse. Uno solo a la vez: son
  // diecinueve tarjetas y un estado por tarjeta no aporta nada.
  const [confirmando, setConfirmando] = useState<string | null>(null)

  const archivados = useTemplatesArchivados()
  const visibles = useMemo(
    () => (archivados ? TEMPLATES.filter((t) => !archivados.has(t.id)) : []),
    [archivados]
  )
  const guardados = useMemo(
    () => (archivados ? TEMPLATES.filter((t) => archivados.has(t.id)) : []),
    [archivados]
  )

  useEffect(() => {
    fetch("/api/contenido/piezas?limite=60")
      .then((r) => r.json())
      .then((d) => setHistorial(d.piezas ?? []))
      .catch(() => {})
  }, [refrescar])

  /**
   * La última pieza guardada de cada template.
   *
   * Sin esto la grilla arranca vacía en cada visita y hay que regenerar los
   * quince —tres minutos y quince llamadas— solo para volver a ver lo que ya
   * habías generado ayer.
   */
  const ultimaPorTemplate = useMemo(() => {
    const mapa = new Map<string, PiezaGenerada>()
    // El historial viene de la más nueva a la más vieja: la primera de cada
    // template es la última generada.
    for (const p of historial) if (!mapa.has(p.templateId)) mapa.set(p.templateId, p)
    return mapa
  }, [historial])

  async function generarUno(templateId: string, loteId?: string) {
    setEnCurso(templateId)
    try {
      const r = await fetch("/api/contenido/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId, titular, sujeto, etiqueta, size: "portrait", prompt: titular }),
      })
      const d = await r.json()
      const resultado: Resultado = r.ok && d.image
        ? { templateId, imagen: d.image }
        : { templateId, imagen: null, error: d.error ?? "No se pudo generar" }

      setResultados((prev) => [...prev.filter((x) => x.templateId !== templateId), resultado])

      // Se guarda apenas sale, no al final: si el navegador se cierra a mitad de
      // la tanda, lo generado hasta ahí ya está en la base. Que falle el guardado
      // no puede tumbar la generación, así que va sin await bloqueante.
      if (d.image) {
        const t = TEMPLATES.find((x) => x.id === templateId)
        fetch("/api/contenido/piezas", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            imagen: d.image,
            templateId,
            templateNombre: t?.nombre,
            titular,
            etiqueta,
            sujeto,
            prompt: d.prompt,
            modelo: d.model,
            loteId: loteId ?? lote ?? crypto.randomUUID(),
          }),
        }).catch(() => {})
      }
    } catch {
      setResultados((prev) => [
        ...prev.filter((x) => x.templateId !== templateId),
        { templateId, imagen: null, error: "Error de conexión" },
      ])
    } finally {
      setEnCurso(null)
    }
  }

  async function generarTodos() {
    if (!titular.trim()) return toast.error("Escribí un titular")
    const loteId = crypto.randomUUID()
    setLote(loteId)
    setResultados([])
    for (const t of visibles) await generarUno(t.id, loteId)
    setRefrescar((n) => n + 1)
    toast.success(`Listo — compará los ${visibles.length}`)
  }

  /**
   * Archivar saca el formato de todos lados: de esta grilla, del selector de
   * cada pieza y de la secuencia que arma el calendario. No borra nada de lo ya
   * generado con él — esas piezas siguen en el historial con su nombre.
   */
  async function archivar(slug: string, activo: boolean) {
    setConfirmando(null)
    const error = await cambiarArchivado(slug, activo)
    if (error) return toast.error(error)
    toast.success(activo ? "Formato restaurado" : "Formato archivado")
  }

  const generando = enCurso !== null

  return (
    <div className="space-y-5">
      <div className="panel p-5">
        <p className="eyebrow mb-3">Probá el mismo contenido en los {visibles.length}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-secondary">
              Titular de la pieza
            </span>
            <Input value={titular} onChange={(e) => setTitular(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-secondary">
              Etiqueta <span className="font-normal text-ink-faint">(arriba a la izquierda)</span>
            </span>
            <Input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[12px] font-medium text-ink-secondary">
              Qué muestra la foto
            </span>
            <Textarea value={sujeto} onChange={(e) => setSujeto(e.target.value)} rows={2} />
          </label>
        </div>
        <div className="mt-3.5 flex flex-wrap items-center gap-3">
          <Button onClick={generarTodos} disabled={generando || visibles.length === 0}>
            {generando ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {generando ? "Generando…" : `Generar en los ${visibles.length} templates`}
          </Button>
          <p className="text-[11.5px] text-ink-muted">
            Van de a uno, unos 12 segundos cada uno — {Math.max(1, Math.round((visibles.length * 12) / 60))} minutos
            los {visibles.length}. Aparecen a medida que salen.
          </p>
        </div>
      </div>

      <Versiones piezas={historial} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibles.map((t) => {
          const r = resultados.find((x) => x.templateId === t.id)
          const guardada = ultimaPorTemplate.get(t.id)
          const imagen = r?.imagen ?? guardada?.url ?? null
          const esHistorial = !r?.imagen && Boolean(guardada)
          return (
            <figure key={t.id} className="panel overflow-hidden">
              <div
                className={cn(
                  "relative flex aspect-[4/5] items-center justify-center bg-surface-muted",
                  enCurso === t.id && "animate-pulse"
                )}
              >
                {imagen ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- data: URL o URL firmada */}
                    <img src={imagen} alt={t.nombre} className="h-full w-full object-cover" />
                    {esHistorial && guardada?.loteNumero != null && (
                      <span className="absolute left-2 top-2 rounded bg-navy-950/75 px-1.5 py-0.5 text-[9.5px] font-semibold text-white">
                        Versión {guardada.loteNumero}
                      </span>
                    )}
                  </>
                ) : enCurso === t.id ? (
                  <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
                ) : (
                  <span className="px-4 text-center text-[11.5px] text-ink-faint">
                    {r?.error ?? "Sin generar"}
                  </span>
                )}
              </div>

              <figcaption className="border-t border-line p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-semibold text-ink">{t.nombre}</p>

                  {confirmando === t.id ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <Button
                        size="xs"
                        variant="destructive"
                        onClick={() => archivar(t.id, false)}
                      >
                        Archivar
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => setConfirmando(null)}>
                        No
                      </Button>
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => generarUno(t.id)}
                        disabled={generando}
                      >
                        {r?.imagen ? "Otra" : "Generar"}
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setConfirmando(t.id)}
                        disabled={generando}
                      >
                        <Trash2 />
                        <span className="sr-only">Archivar {t.nombre}</span>
                      </Button>
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">{t.cuandoUsar}</p>

                {/* El prompt exacto que se le mandó. Sin esto, cuando una pieza
                    sale mal no hay forma de saber si falló la receta o el
                    modelo. */}
                <details className="mt-2 group">
                  <summary className="cursor-pointer list-none text-[10.5px] font-medium text-ink-faint transition-colors hover:text-ink-muted">
                    Ver el prompt
                  </summary>
                  <pre className="mt-1.5 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-subtle p-2.5 font-mono text-[10px] leading-[1.6] text-ink-secondary">
                    {promptDeTemplate({
                      template: t,
                      titular,
                      sujeto: t.llevaFoto ? sujeto : undefined,
                      etiqueta,
                    })}
                  </pre>
                </details>
              </figcaption>
            </figure>
          )
        })}
      </div>

      {guardados.length > 0 && (
        <div className="panel p-5">
          <p className="eyebrow mb-1">Archivados</p>
          <p className="mb-3 text-[11.5px] leading-relaxed text-ink-muted">
            Fuera de circulación: no se generan, no aparecen en el selector de cada pieza y el
            calendario no los asigna. Las piezas que ya salieron con ellos siguen intactas.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {guardados.map((t) => (
              <span
                key={t.id}
                className="flex items-center gap-1 rounded-lg border border-line bg-surface-subtle py-1 pl-2.5 pr-1 text-[11.5px] text-ink-secondary"
              >
                {t.nombre}
                <Button size="icon-sm" variant="ghost" onClick={() => archivar(t.id, true)}>
                  <RotateCcw />
                  <span className="sr-only">Restaurar {t.nombre}</span>
                </Button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Versiones ────────────────────────────────────────────────────────────── */

/**
 * Cada tanda masiva es una versión del sistema.
 *
 * Versionar receta por receta responde "cómo cambió este template". Agrupar por
 * tanda responde la pregunta que importa: cómo se ve el conjunto hoy contra el
 * de la semana pasada. Quince piezas generadas juntas son una foto del sistema
 * en ese momento, y es lo único realmente comparable.
 */
function Versiones({ piezas }: { piezas: PiezaGenerada[] }) {
  const [abierta, setAbierta] = useState<number | null>(null)

  const lotes = useMemo(() => {
    const mapa = new Map<number, PiezaGenerada[]>()
    for (const p of piezas) {
      if (p.loteNumero == null) continue
      const lista = mapa.get(p.loteNumero) ?? []
      lista.push(p)
      mapa.set(p.loteNumero, lista)
    }
    return [...mapa.entries()].sort((a, b) => b[0] - a[0])
  }, [piezas])

  if (lotes.length === 0) return null

  return (
    <div className="panel p-5">
      <p className="eyebrow mb-3">Versiones generadas</p>
      <div className="space-y-2">
        {lotes.map(([numero, lista]) => {
          const fecha = new Date(lista[0].createdAt)
          const activa = abierta === numero
          return (
            <div key={numero} className="rounded-xl border border-line">
              <button
                type="button"
                onClick={() => setAbierta(activa ? null : numero)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left"
              >
                <span className="text-[13px] font-semibold text-ink">Versión {numero}</span>
                <span className="text-[11.5px] text-ink-muted">
                  {fecha.toLocaleDateString("es-AR")} {fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-[11.5px] text-ink-faint">· {lista.length} piezas</span>
                <span className="ml-auto truncate text-[11.5px] italic text-ink-faint">
                  “{lista[0].titular}”
                </span>
              </button>

              {activa && (
                <div className="grid grid-cols-3 gap-1.5 border-t border-line p-3 sm:grid-cols-5">
                  {lista.map((p) => (
                    <figure key={p.id} className="overflow-hidden rounded-lg border border-line">
                      {p.url && (
                        // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal
                        <img src={p.url} alt={p.templateNombre ?? ""} className="aspect-[4/5] w-full object-cover" />
                      )}
                      <figcaption className="truncate px-1.5 py-1 text-[9.5px] text-ink-faint">
                        {p.templateNombre ?? p.templateId}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
