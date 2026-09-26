"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  ExternalLink,
  Eye,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import {
  Campo,
  CampoArea,
  CampoTexto,
  Interruptor,
  Seccion,
  Segmentado,
} from "@/components/marketing/form-campos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  CATEGORIAS,
  CATEGORIA_COLOR,
  CATEGORIA_LABEL,
  IDEAL,
  INDUSTRIAS,
  INDUSTRIA_LABEL,
  LIMITES,
  TIPOS,
  TIPO_LABEL,
  TIPO_PISTA,
  aInputLocal,
  avisosDe,
  borradorDe,
  borradorVacio,
  deInputLocal,
  faltantesDe,
  fechaLarga,
  minutosDe,
  PALABRAS,
  palabrasDe,
  slugDe,
  type BorradorNota,
  type Nota,
  type NotaExistente,
} from "@/lib/marketing/notas"
import { renderizarMarkdown } from "@/lib/marketing/notas-markdown"
import {
  AREA_LABEL,
  VEREDICTO_LABEL,
  ordenarPuntos,
  type Gravedad,
  type Revision,
} from "@/lib/marketing/notas-revision"
import { cn } from "@/lib/utils"

const SITIO = "https://www.accedra.com.ar"

/**
 * La ficha de una nota.
 *
 * Una sola pantalla y una sola columna de formulario, a diferencia del editor de
 * eventos: una nota es un texto largo, y partirlo en pestañas obliga a ir y
 * volver mientras se escribe. A la derecha, fija, la vista previa —el texto
 * renderizado y cómo se vería en Google— y la lista de avisos.
 *
 * LOS AVISOS NO BLOQUEAN
 *
 * Publicar sin respuesta directa, sin FAQs o sin autor está permitido: son
 * decisiones, no errores. Pero su costo no se ve el día que se publica sino
 * tres meses después, cuando esa nota no la cita nadie. Por eso la lista está a
 * la vista al lado del botón de guardar y no escondida en una validación.
 */
export function NotaEditor({ id }: { id: string | null }) {
  const router = useRouter()

  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const [nota, setNota] = useState<Nota | null>(null)
  const [f, setF] = useState<BorradorNota>(borradorVacio)
  const [guardadoJson, setGuardadoJson] = useState(() => JSON.stringify(borradorVacio()))
  /** Las demás notas cargadas: con esto se avisa si ésta compite con otra. */
  const [otras, setOtras] = useState<NotaExistente[]>([])

  const [portada, setPortada] = useState<File | null>(null)
  const [quitarPortada, setQuitarPortada] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* ── Carga ─────────────────────────────────────────────────────────────── */

  const cargar = useCallback(async () => {
    setErrorCarga(null)
    try {
      // La lista de las demás notas viaja siempre, también en un alta: es contra
      // ella que se avisa si la nota nueva compite con una que ya existe, y esa
      // es la advertencia que más conviene ver ANTES de escribir.
      const listado = fetch("/api/marketing/notas")
        .then((r) => (r.ok ? r.json() : { notas: [] }))
        .then((d) => (d.notas ?? []) as Nota[])
        .catch(() => [] as Nota[])

      if (!id) {
        setOtras((await listado).map((n) => ({ id: n.id, titulo: n.titulo, slug: n.slug, publicado: n.publicado })))
        return
      }

      const r = await fetch(`/api/marketing/notas/${id}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudo cargar la nota")
      const b = borradorDe(d.nota as Nota)
      setNota(d.nota)
      setF(b)
      setGuardadoJson(JSON.stringify(b))
      setOtras(
        (await listado)
          .filter((n) => n.id !== id)
          .map((n) => ({ id: n.id, titulo: n.titulo, slug: n.slug, publicado: n.publicado }))
      )
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : "No se pudo cargar")
    } finally {
      setCargando(false)
    }
  }, [id])

  useEffect(() => {
    cargar()
  }, [cargar])

  const sucio = JSON.stringify(f) !== guardadoJson || portada !== null || quitarPortada

  // Escribir una nota son horas. Salir de la pestaña con cambios sin guardar es
  // la forma más cara de perderlas.
  useEffect(() => {
    if (!sucio) return
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", avisar)
    return () => window.removeEventListener("beforeunload", avisar)
  }, [sucio])

  const set = <K extends keyof BorradorNota>(campo: K, valor: BorradorNota[K]) =>
    setF((prev) => ({ ...prev, [campo]: valor }))

  /* ── Portada ───────────────────────────────────────────────────────────── */

  const [vistaPortada, setVistaPortada] = useState<string | null>(null)
  useEffect(() => {
    if (!portada) {
      setVistaPortada(null)
      return
    }
    const url = URL.createObjectURL(portada)
    setVistaPortada(url)
    return () => URL.revokeObjectURL(url)
  }, [portada])

  const portadaUrl = vistaPortada ?? (quitarPortada ? null : nota?.portadaUrl ?? null)

  /* ── Guardar ───────────────────────────────────────────────────────────── */

  async function guardar() {
    const faltantes = faltantesDe(f)
    if (faltantes.length > 0) {
      setError(`Falta ${faltantes.join(", ")}.`)
      return
    }
    setGuardando(true)
    setError(null)
    try {
      const cuerpo = new FormData()
      cuerpo.set("datos", JSON.stringify(f))
      if (portada) cuerpo.set("portada", portada)
      if (quitarPortada && !portada) cuerpo.set("quitar_portada", "true")

      const r = await fetch(id ? `/api/marketing/notas/${id}` : "/api/marketing/notas", {
        method: id ? "PATCH" : "POST",
        body: cuerpo,
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar")

      const guardada = d.nota as Nota
      const b = borradorDe(guardada)
      setNota(guardada)
      setF(b)
      setGuardadoJson(JSON.stringify(b))
      setPortada(null)
      setQuitarPortada(false)

      if (!id) {
        toast.success("Nota creada")
        router.replace(`/marketing/notas/${guardada.id}`)
      } else {
        toast.success("Cambios guardados")
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  if (cargando && id) return <LoadingState label="Cargando nota…" />
  if (errorCarga) return <ErrorState message={errorCarga} onRetry={cargar} />

  const palabras = palabrasDe(f.cuerpo)

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
      <div className="space-y-6">
        <Seccion
          num="01"
          titulo="La pregunta que responde"
          bajada="El título es la pregunta tal como la escribe alguien en Google o se la hace a una IA. La respuesta directa es lo que esa IA va a citar."
        >
          <CampoTexto
            label="Título"
            valor={f.titulo}
            onChange={(v) => set("titulo", v)}
            max={LIMITES.titulo}
            placeholder="Firma biométrica en Argentina: qué validez legal tiene"
            obligatorio
          />
          <Campo label="Tipo" pista={TIPO_PISTA[f.tipo]}>
            <Segmentado
              opciones={TIPOS.map((v) => ({ v, label: TIPO_LABEL[v] }))}
              valor={f.tipo}
              onChange={(v) => set("tipo", v)}
            />
          </Campo>
          <CampoArea
            label="Respuesta directa"
            valor={f.respuesta}
            onChange={(v) => set("respuesta", v)}
            max={LIMITES.respuesta}
            filas={4}
            placeholder="Sí. La Ley 25.506 le da validez a la firma electrónica, y la firma biométrica es una firma electrónica con datos biométricos que identifican a quien firma…"
            pista="Dos o tres oraciones que respondan el título sin leer el resto. Es el bloque destacado arriba de la nota y lo que copia un modelo generativo."
          />
        </Seccion>

        <Seccion
          num="02"
          titulo="El texto"
          bajada={`En markdown, y corto: ${PALABRAS.objetivo} palabras es la vara y ${PALABRAS.maximo} el techo. Cuatro subtítulos con ##: qué está pasando, cuál es el problema, cómo se resuelve a grandes rasgos y cómo lo hacemos nosotros. El detalle fino va a las preguntas frecuentes.`}
          accion={
            // El contador es la única señal de largo que el redactor ve
            // mientras escribe, así que dice en qué zona está y no sólo el
            // número: verde hasta el objetivo, ámbar hasta el máximo, rojo
            // arriba. El aviso de `avisosDe` explica qué recortar.
            <span
              className={`shrink-0 font-mono text-[10.5px] tabular-nums ${
                palabras > PALABRAS.maximo
                  ? "text-danger"
                  : palabras > PALABRAS.objetivo
                    ? "text-warning"
                    : "text-ink-faint"
              }`}
            >
              {palabras} / {PALABRAS.objetivo} palabras · {minutosDe(f.cuerpo)} min
            </span>
          }
        >
          <Textarea
            rows={26}
            value={f.cuerpo}
            maxLength={LIMITES.cuerpo}
            onChange={(e) => set("cuerpo", e.target.value)}
            className="font-mono text-[12.5px] leading-relaxed"
            placeholder={"## Qué dice la ley\n\nLa **Ley 25.506** distingue dos figuras…\n\n- Firma electrónica: …\n- Firma digital: …\n\n> Lo que cambia en la práctica es quién tiene que probar qué.\n\n### Qué pasa en un juicio\n\nTexto con un [link](https://www.accedra.com.ar/soluciones/firma-biometrica)."}
          />
          <p className="text-[11.5px] leading-relaxed text-ink-muted">
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px]">## Subtítulo</code> ·{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px]">### Sub-subtítulo</code> ·{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px]">- lista</code> ·{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px]">1. numerada</code> ·{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px]">&gt; cita</code> ·{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px]">**negrita**</code> ·{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px]">[texto](url)</code> · tablas con{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px]">| a | b |</code>. Todo lo demás
            es un párrafo.
          </p>
        </Seccion>

        <Seccion
          num="03"
          titulo="Preguntas frecuentes"
          bajada="Van al final de la nota y salen como FAQPage en el schema. Es lo que más se cita en búsqueda generativa: cada par pregunta–respuesta es una cita lista para usar."
          accion={
            f.faqs.length < LIMITES.faqs ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => set("faqs", [...f.faqs, { q: "", a: "" }])}
              >
                <Plus />
                Agregar
              </Button>
            ) : undefined
          }
        >
          {f.faqs.length === 0 ? (
            <p className="text-[12px] text-ink-muted">
              Sin preguntas cargadas. Tres o cuatro, con la pregunta escrita como la diría una persona.
            </p>
          ) : (
            f.faqs.map((faq, i) => (
              <div key={i} className="rounded-lg border border-line bg-surface-subtle p-3">
                <div className="flex items-start gap-2">
                  <Input
                    value={faq.q}
                    maxLength={LIMITES.faqPregunta}
                    placeholder="¿Sirve una firma biométrica ante un juez?"
                    onChange={(e) => set("faqs", f.faqs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => set("faqs", f.faqs.filter((_, j) => j !== i))}
                    title="Quitar"
                  >
                    <X />
                  </Button>
                </div>
                <Textarea
                  rows={3}
                  value={faq.a}
                  maxLength={LIMITES.faqRespuesta}
                  placeholder="Sí, y es la parte donde la biometría se diferencia de una firma escaneada: el dato del trazo…"
                  onChange={(e) => set("faqs", f.faqs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))}
                  className="mt-2"
                />
              </div>
            ))
          )}
        </Seccion>

        <Seccion
          num="04"
          titulo="Fuentes"
          bajada="Las leyes, normas o informes que cita la nota. En temas legales es lo que separa una nota de una opinión, y es la señal de experiencia que mira Google."
          accion={
            f.fuentes.length < LIMITES.fuentes ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => set("fuentes", [...f.fuentes, { titulo: "", url: "" }])}
              >
                <Plus />
                Agregar
              </Button>
            ) : undefined
          }
        >
          {f.fuentes.length === 0 ? (
            <p className="text-[12px] text-ink-muted">Sin fuentes cargadas.</p>
          ) : (
            f.fuentes.map((fu, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                <Input
                  value={fu.titulo}
                  maxLength={LIMITES.fuenteTitulo}
                  placeholder="Ley 25.506 — Firma Digital"
                  onChange={(e) =>
                    set("fuentes", f.fuentes.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))
                  }
                />
                <Input
                  value={fu.url}
                  maxLength={LIMITES.url}
                  placeholder="https://servicios.infoleg.gob.ar/…"
                  className="font-mono text-[12px]"
                  onChange={(e) => set("fuentes", f.fuentes.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => set("fuentes", f.fuentes.filter((_, j) => j !== i))}
                  title="Quitar"
                >
                  <X />
                </Button>
              </div>
            ))
          )}
        </Seccion>

        <Seccion
          num="05"
          titulo="Dónde encaja"
          bajada="Con esto la nota enlaza a la página de la solución y a las landings por industria, que es adonde queremos que siga el lector."
        >
          <Campo label="Solución" pista="Una sola: es el link que aparece al final de la nota.">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIAS.map((cat) => {
                const activa = f.categoria === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => set("categoria", activa ? null : cat)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors",
                      activa
                        ? "border-transparent text-white shadow-e1"
                        : "border-line bg-surface text-ink-secondary hover:border-line-strong"
                    )}
                    style={activa ? { background: CATEGORIA_COLOR[cat] } : undefined}
                  >
                    {!activa && <span className="h-2 w-2 rounded-full" style={{ background: CATEGORIA_COLOR[cat] }} />}
                    {CATEGORIA_LABEL[cat]}
                  </button>
                )
              })}
            </div>
          </Campo>
          <Campo
            label="Industrias"
            pista="Opcional. Si la nota habla de un vertical, enlaza a la landing de esa solución para esa industria."
          >
            <div className="flex flex-wrap gap-1.5">
              {INDUSTRIAS.map((ind) => {
                const activa = f.industrias.includes(ind)
                return (
                  <button
                    key={ind}
                    type="button"
                    onClick={() =>
                      set(
                        "industrias",
                        activa
                          ? f.industrias.filter((x) => x !== ind)
                          : INDUSTRIAS.filter((x) => x === ind || f.industrias.includes(x))
                      )
                    }
                    className={cn(
                      "h-8 rounded-full border px-3 text-[12px] font-medium transition-colors",
                      activa
                        ? "border-brand-400 bg-brand-50 text-brand-700"
                        : "border-line bg-surface text-ink-secondary hover:border-line-strong"
                    )}
                  >
                    {INDUSTRIA_LABEL[ind]}
                  </button>
                )
              })}
            </div>
          </Campo>
          <Campo label="Tags" pista="Enter o coma para agregar. Se muestran al pie y agrupan notas del mismo tema.">
            <Tags valor={f.tags} onChange={(v) => set("tags", v)} />
          </Campo>
        </Seccion>

        <Seccion
          num="06"
          titulo="Quién la firma"
          bajada="Una nota sin autor pesa menos: Google pide autoría real en contenido que aconseja, y las IAs citan a la persona antes que a la marca."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto
              label="Autor"
              valor={f.autor}
              onChange={(v) => set("autor", v)}
              max={LIMITES.autor}
              placeholder="Carlos Omar Bianchi"
            />
            <CampoTexto
              label="Cargo"
              valor={f.autorCargo}
              onChange={(v) => set("autorCargo", v)}
              max={LIMITES.autorCargo}
              placeholder="Director · Accedra IT Solutions"
            />
          </div>
        </Seccion>

        <Seccion
          num="07"
          titulo="Portada"
          bajada="La imagen de la card y la que se ve cuando alguien comparte la nota por WhatsApp o LinkedIn."
        >
          <SelectorPortada
            url={portadaUrl}
            nombre={portada?.name ?? null}
            onArchivo={(file) => {
              setPortada(file)
              setQuitarPortada(false)
            }}
            onQuitar={() => {
              setPortada(null)
              setQuitarPortada(true)
            }}
          />
        </Seccion>

        <Seccion
          num="08"
          titulo="Cómo se ve en Google"
          bajada="El título y la descripción del resultado de búsqueda. Son lo único que lee alguien antes de decidir si entra."
        >
          <CampoTexto
            label="Título para Google"
            valor={f.tituloSeo}
            onChange={(v) => set("tituloSeo", v)}
            max={LIMITES.tituloSeo}
            placeholder={f.titulo || "Firma biométrica: validez legal en Argentina"}
            pista={`Vacío: se usa el título de la nota. Google corta cerca de los ${IDEAL.titulo} caracteres.`}
          />
          <CampoArea
            label="Resumen"
            valor={f.resumen}
            onChange={(v) => set("resumen", v)}
            max={LIMITES.resumen}
            filas={3}
            placeholder="Qué dice la Ley 25.506, en qué se diferencia de la firma digital y qué hace falta para que una firma biométrica sirva ante un juez."
            pista={`La descripción del resultado y la bajada de la card. Google muestra unos ${IDEAL.resumen} caracteres.`}
          />
          <Campo
            label="Dirección"
            pista={
              nota
                ? "Cambiarla rompe los links compartidos y hace que Google tenga que indexar la nota de nuevo."
                : "Se genera del título al crear."
            }
          >
            <div className="flex items-center rounded-lg border border-line bg-surface-subtle pl-3">
              <span className="shrink-0 font-mono text-[12px] text-ink-faint">accedra.com.ar/recursos/</span>
              <Input
                value={!nota && !f.slug ? slugDe(f.titulo) : f.slug}
                onChange={(e) => set("slug", slugDe(e.target.value) || e.target.value.toLowerCase())}
                onBlur={(e) => set("slug", slugDe(e.target.value))}
                className="border-0 bg-transparent pl-0.5 font-mono text-[12px] shadow-none focus-visible:ring-0"
                placeholder={nota?.slug || "firma-biometrica-validez-legal"}
              />
            </div>
          </Campo>
        </Seccion>

        <Seccion num="09" titulo="Publicación">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              label="Fecha de publicación"
              pista="Con fecha futura, la nota queda programada: el sitio la muestra recién ese día. Vacío: el momento en que se publica."
            >
              <Input
                type="datetime-local"
                value={aInputLocal(f.publicadoEn)}
                onChange={(e) => set("publicadoEn", deInputLocal(e.target.value))}
              />
            </Campo>
            <Campo
              label="Última revisión"
              pista="Sólo cuando se revisa el contenido de verdad. Es la fecha que Google lee como “actualizado”."
            >
              <div className="flex gap-2">
                <Input
                  type="datetime-local"
                  value={aInputLocal(f.revisadoEn)}
                  onChange={(e) => set("revisadoEn", deInputLocal(e.target.value))}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Marcar como revisada hoy"
                  onClick={() => set("revisadoEn", new Date().toISOString())}
                >
                  <CalendarCheck />
                </Button>
              </div>
            </Campo>
          </div>
          <Interruptor
            label="Destacada"
            pista="Ocupa la card grande del hub de recursos. Si hay varias, gana la más nueva."
            valor={f.destacada}
            onChange={(v) => set("destacada", v)}
          />
        </Seccion>
      </div>

      <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <Vista f={f} portadaUrl={portadaUrl} slug={nota?.slug ?? slugDe(f.titulo)} />
        <Avisos borrador={f} otras={otras} />
        <RevisionIA
          borrador={f}
          slug={nota?.slug ?? ""}
          onAplicarTitulo={(v) => set("tituloSeo", v)}
          onAplicarResumen={(v) => set("resumen", v)}
          onAgregarFaqs={(nuevas) => set("faqs", [...f.faqs, ...nuevas].slice(0, LIMITES.faqs))}
        />
        <BarraGuardar
          sucio={sucio}
          guardando={guardando}
          error={error}
          nueva={!id}
          publicado={f.publicado}
          onPublicado={(v) => set("publicado", v)}
          onGuardar={guardar}
          slug={nota?.slug ?? ""}
        />
      </div>
    </div>
  )
}

/* ── Portada ──────────────────────────────────────────────────────────────── */

function SelectorPortada({
  url,
  nombre,
  onArchivo,
  onQuitar,
}: {
  url: string | null
  nombre: string | null
  onArchivo: (f: File) => void
  onQuitar: () => void
}) {
  const input = useRef<HTMLInputElement>(null)

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onArchivo(file)
        }}
      />
      {url ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-e1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-16 w-28 shrink-0 rounded-lg object-cover" />
          <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink-muted">
            {nombre ? `${nombre} · se sube al guardar` : "La portada publicada"}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
            <RefreshCw />
            Cambiar
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onQuitar} title="Quitar">
            <Trash2 />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-subtle p-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-ink-muted shadow-e1">
            <ImagePlus className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-[12.5px] font-medium text-ink">Subir una portada</span>
            <span className="mt-0.5 block text-[11.5px] text-ink-muted">
              JPG, PNG o WebP · mínimo 600 px de ancho. Sin portada, la card usa el fondo de marca.
            </span>
          </span>
        </button>
      )}
    </>
  )
}

/* ── Vista previa ─────────────────────────────────────────────────────────── */

/**
 * Dos vistas de lo mismo: el texto renderizado con el mismo markdown que usa el
 * sitio, y el resultado de búsqueda tal como lo dibuja Google. La segunda
 * existe porque el título y el resumen se escriben en un formulario, pero se
 * leen en una lista de diez resultados — y ahí es donde se gana o se pierde el
 * clic.
 */
function Vista({ f, portadaUrl, slug }: { f: BorradorNota; portadaUrl: string | null; slug: string }) {
  const [tab, setTab] = useState<"nota" | "google">("nota")
  const { html, indice } = useMemo(() => renderizarMarkdown(f.cuerpo), [f.cuerpo])

  return (
    <div className="rounded-xl border border-line bg-surface shadow-e1">
      <div className="border-b border-line px-4 py-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "nota" | "google")}>
          <TabsList>
            <TabsTrigger value="nota">
              <Eye className="h-3.5 w-3.5" />
              La nota
            </TabsTrigger>
            <TabsTrigger value="google">
              <Search className="h-3.5 w-3.5" />
              En Google
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-4">
        {tab === "google" ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-line bg-surface-subtle p-4">
              <p className="truncate font-mono text-[11px] text-ink-muted">accedra.com.ar › recursos › {slug || "…"}</p>
              <p className="mt-1 text-[16px] leading-snug text-[#1a0dab]">
                {(f.tituloSeo || f.titulo || "El título de la nota").slice(0, 70)}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-secondary">
                {f.resumen
                  ? f.resumen.slice(0, IDEAL.resumen) + (f.resumen.length > IDEAL.resumen ? "…" : "")
                  : "Sin resumen, Google inventa uno con el primer texto que encuentre en la página."}
              </p>
            </div>
            <p className="text-[11.5px] leading-relaxed text-ink-muted">
              Google recorta el título cerca de {IDEAL.titulo} caracteres y la descripción cerca de {IDEAL.resumen}. Lo
              que se ve acá es el corte, no el texto completo.
            </p>
          </div>
        ) : (
          <article>
            {portadaUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={portadaUrl} alt="" className="mb-4 aspect-[16/9] w-full rounded-lg object-cover" />
            )}
            <p className="eyebrow">
              {TIPO_LABEL[f.tipo]}
              {f.categoria ? ` · ${CATEGORIA_LABEL[f.categoria]}` : ""}
            </p>
            <h1 className="mt-2 text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink">
              {f.titulo || "El título de la nota va acá"}
            </h1>
            {(f.autor || f.publicadoEn) && (
              <p className="mt-2 text-[11.5px] text-ink-muted">
                {[f.autor, fechaLarga(f.publicadoEn), `${minutosDe(f.cuerpo)} min`].filter(Boolean).join(" · ")}
              </p>
            )}
            {f.respuesta && (
              <div className="mt-4 rounded-lg border-l-2 border-brand-400 bg-brand-50 p-3 text-[13px] leading-relaxed text-ink-secondary">
                {f.respuesta}
              </div>
            )}
            {indice.length > 1 && (
              <nav className="mt-4 rounded-lg border border-line bg-surface-subtle p-3">
                <p className="eyebrow mb-1.5">En esta nota</p>
                <ul className="space-y-1 text-[12px] text-ink-muted">
                  {indice
                    .filter((h) => h.nivel === 2)
                    .map((h) => (
                      <li key={h.id}>{h.texto}</li>
                    ))}
                </ul>
              </nav>
            )}
            {html ? (
              <div className="prosa mt-5" dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <p className="mt-5 text-[12.5px] text-ink-muted">El cuerpo de la nota, todavía vacío.</p>
            )}
            {f.faqs.length > 0 && (
              <div className="mt-6 border-t border-line pt-4">
                <p className="text-[14px] font-semibold text-ink">Preguntas frecuentes</p>
                <div className="mt-3 space-y-3">
                  {f.faqs
                    .filter((q) => q.q && q.a)
                    .map((q, i) => (
                      <div key={i}>
                        <p className="text-[12.5px] font-semibold text-ink">{q.q}</p>
                        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-secondary">{q.a}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </article>
        )}
      </div>
    </div>
  )
}

/* ── Avisos ───────────────────────────────────────────────────────────────── */

function Avisos({ borrador, otras }: { borrador: BorradorNota; otras: NotaExistente[] }) {
  const avisos = useMemo(() => avisosDe(borrador, otras), [borrador, otras])
  if (avisos.length === 0) {
    return (
      <p className="rounded-xl border border-success/25 bg-success/5 px-4 py-3 text-[12px] text-ink-secondary">
        La nota tiene todo lo que hace falta para competir: respuesta directa, preguntas frecuentes y autor.
      </p>
    )
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-e1">
      <p className="eyebrow mb-2.5">Antes de publicar</p>
      <ul className="space-y-2">
        {avisos.map((a, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-secondary">
            <AlertTriangle className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", a.grave ? "text-warning" : "text-ink-faint")} />
            {a.texto}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Revisión con IA ──────────────────────────────────────────────────────── */

const TONO_GRAVEDAD: Record<Gravedad, string> = {
  alta: "border-destructive/30 bg-destructive/5 text-destructive",
  media: "border-warning/30 bg-warning/5 text-warning",
  baja: "border-line bg-surface-muted text-ink-muted",
}

const GRAVEDAD_LABEL: Record<Gravedad, string> = { alta: "Grave", media: "Importante", baja: "Menor" }

/**
 * Un lector externo antes de publicar. Opcional: se pide con un botón, nunca
 * corre al guardar.
 *
 * Lee el borrador que está en pantalla —no lo guardado— y lo compara con las
 * notas que ya están publicadas. Lo que devuelve son observaciones, no cambios:
 * las propuestas de título, resumen y preguntas se aplican de a una, con un
 * clic, y sólo si se está de acuerdo. Nada se reescribe solo, porque una nota
 * que el equipo no reconoce como propia es exactamente lo que no queremos
 * publicar.
 */
function RevisionIA({
  borrador,
  slug,
  onAplicarTitulo,
  onAplicarResumen,
  onAgregarFaqs,
}: {
  borrador: BorradorNota
  slug: string
  onAplicarTitulo: (v: string) => void
  onAplicarResumen: (v: string) => void
  onAgregarFaqs: (faqs: { q: string; a: string }[]) => void
}) {
  const [revisando, setRevisando] = useState(false)
  const [revision, setRevision] = useState<Revision | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aplicados, setAplicados] = useState<Set<string>>(new Set())

  const listo = Boolean(borrador.titulo.trim() && borrador.cuerpo.trim())

  const marcar = (clave: string) => setAplicados((prev) => new Set(prev).add(clave))

  async function revisar() {
    setRevisando(true)
    setError(null)
    try {
      const r = await fetch("/api/marketing/notas/revision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...borrador, slug }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudo revisar")
      setRevision(d.revision as Revision)
      setAplicados(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo revisar")
    } finally {
      setRevisando(false)
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-e1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-ink">Revisión con IA</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
            Opcional. Lee la nota como la leería alguien de afuera y la compara con las que ya están publicadas.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={revisar} disabled={revisando || !listo}>
          {revisando ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {revision ? "Revisar de nuevo" : "Revisar"}
        </Button>
      </div>

      {!listo && <p className="mt-3 text-[11.5px] text-ink-faint">Escribí el título y el cuerpo para poder revisar.</p>}

      {error && (
        <p className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {error}
        </p>
      )}

      {revision && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="flex items-start gap-2">
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold",
                revision.veredicto === "publicar"
                  ? "border-success/30 bg-success/5 text-success"
                  : revision.veredicto === "ajustar"
                    ? "border-warning/30 bg-warning/5 text-warning"
                    : "border-destructive/30 bg-destructive/5 text-destructive"
              )}
            >
              {VEREDICTO_LABEL[revision.veredicto]}
            </span>
            {revision.resumen && <p className="text-[12px] leading-relaxed text-ink-secondary">{revision.resumen}</p>}
          </div>

          {ordenarPuntos(revision.puntos).map((p, i) => (
            <div key={i} className="rounded-lg border border-line bg-surface-subtle p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold", TONO_GRAVEDAD[p.gravedad])}>
                  {GRAVEDAD_LABEL[p.gravedad]}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-faint">
                  {AREA_LABEL[p.area]}
                </span>
              </div>
              <p className="mt-1.5 text-[12.5px] font-medium text-ink">{p.titulo}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{p.detalle}</p>
              {p.sugerencia && (
                <p className="mt-2 rounded border-l-2 border-brand-300 bg-surface px-2.5 py-1.5 text-[12px] leading-relaxed text-ink-secondary">
                  {p.sugerencia}
                </p>
              )}
            </div>
          ))}

          {/* Las propuestas que se pueden aplicar solas. Se aplican de a una:
              aceptar todo de una vez es la forma más rápida de publicar algo
              que nadie leyó. */}
          {revision.tituloSeoSugerido && (
            <Propuesta
              label="Título para Google"
              valor={revision.tituloSeoSugerido}
              aplicado={aplicados.has("titulo")}
              onAplicar={() => {
                onAplicarTitulo(revision.tituloSeoSugerido)
                marcar("titulo")
              }}
            />
          )}
          {revision.resumenSugerido && (
            <Propuesta
              label="Resumen"
              valor={revision.resumenSugerido}
              aplicado={aplicados.has("resumen")}
              onAplicar={() => {
                onAplicarResumen(revision.resumenSugerido)
                marcar("resumen")
              }}
            />
          )}
          {revision.faqsSugeridas.length > 0 && (
            <Propuesta
              label={`${revision.faqsSugeridas.length} pregunta${revision.faqsSugeridas.length === 1 ? "" : "s"} que falta${revision.faqsSugeridas.length === 1 ? "" : "n"}`}
              valor={revision.faqsSugeridas.map((q) => q.q).join(" · ")}
              aplicado={aplicados.has("faqs")}
              onAplicar={() => {
                onAgregarFaqs(revision.faqsSugeridas)
                marcar("faqs")
              }}
            />
          )}

          <p className="text-[11px] leading-relaxed text-ink-faint">
            Es una opinión, no una corrección: la nota se publica igual si no estás de acuerdo.
          </p>
        </div>
      )}
    </div>
  )
}

function Propuesta({
  label,
  valor,
  aplicado,
  onAplicar,
}: {
  label: string
  valor: string
  aplicado: boolean
  onAplicar: () => void
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brand-700">{label}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-secondary">{valor}</p>
      </div>
      <Button type="button" variant="outline" size="xs" onClick={onAplicar} disabled={aplicado} className="shrink-0">
        {aplicado ? <Check /> : null}
        {aplicado ? "Aplicado" : "Aplicar"}
      </Button>
    </div>
  )
}

/* ── Barra de guardar ─────────────────────────────────────────────────────── */

function BarraGuardar({
  sucio,
  guardando,
  error,
  nueva,
  publicado,
  onPublicado,
  onGuardar,
  slug,
}: {
  sucio: boolean
  guardando: boolean
  error: string | null
  nueva: boolean
  publicado: boolean
  onPublicado: (v: boolean) => void
  onGuardar: () => void
  slug: string
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-e1">
      <Interruptor
        label="Publicada en el sitio"
        pista={
          publicado
            ? "Al guardar aparece en accedra.com.ar/recursos y entra en el sitemap."
            : "Se guarda como borrador: no se ve en el sitio."
        }
        valor={publicado}
        onChange={onPublicado}
      />
      {error && (
        <p className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
          {error}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="min-w-0 text-[11.5px] text-ink-muted">
          {sucio ? (
            <span className="text-warning">Cambios sin guardar</span>
          ) : slug && publicado ? (
            <a
              href={`${SITIO}/recursos/${slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-ink"
            >
              Ver en el sitio <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            !nueva && "Todo guardado"
          )}
        </div>
        <Button type="button" onClick={onGuardar} disabled={guardando || (!sucio && !nueva)}>
          {guardando && <Loader2 className="animate-spin" />}
          {nueva ? "Crear nota" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  )
}

/* ── Tags ─────────────────────────────────────────────────────────────────── */

function Tags({ valor, onChange }: { valor: string[]; onChange: (v: string[]) => void }) {
  const [texto, setTexto] = useState("")
  const lleno = valor.length >= LIMITES.tags

  function agregar(crudo: string) {
    const nuevos = crudo
      .split(",")
      .map((t) => t.trim().replace(/^#/, "").slice(0, LIMITES.tag))
      .filter(Boolean)
    const unidos = [...valor]
    for (const t of nuevos) {
      if (unidos.length >= LIMITES.tags) break
      if (!unidos.some((x) => x.toLowerCase() === t.toLowerCase())) unidos.push(t)
    }
    onChange(unidos)
    setTexto("")
  }

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5">
      {valor.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-[11.5px] font-medium text-brand-700"
        >
          {t}
          <button type="button" onClick={() => onChange(valor.filter((x) => x !== t))} className="text-brand-400 hover:text-brand-700">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {!lleno && (
        <input
          value={texto}
          maxLength={LIMITES.tag + 1}
          onChange={(e) => (e.target.value.endsWith(",") ? agregar(e.target.value) : setTexto(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              agregar(texto)
            } else if (e.key === "Backspace" && !texto && valor.length) {
              onChange(valor.slice(0, -1))
            }
          }}
          onBlur={() => texto && agregar(texto)}
          placeholder={valor.length ? "" : "Ley 25.506, validez legal…"}
          className="h-6 min-w-24 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-ink-faint"
        />
      )}
    </div>
  )
}
