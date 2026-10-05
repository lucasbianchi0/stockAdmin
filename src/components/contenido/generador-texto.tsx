"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  History,
  Loader2,
  RefreshCw,
  Sparkles,
  Square,
  Wand2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/ui/states"
import {
  CLASE_SELECT,
  Campo,
  Segmentado,
  descargar,
  errorDe,
} from "@/components/contenido/generador-ui"
import {
  CANALES_TEXTO,
  CONTEXTOS_MARCA,
  EXTENSIONES_TEXTO,
  IDIOMAS_TEXTO,
  OBJETIVOS_TEXTO,
  TIPOS_TEXTO,
  TONOS_TEXTO,
  type EntradaHistorial,
  type TextoGenerado,
  type TipoTexto,
} from "@/lib/generador"
import { cn } from "@/lib/utils"

const API = "/api/contenido/generador"

const AJUSTES_RAPIDOS = ["Más corto", "Más formal", "Más cercano", "Más persuasivo", "Sin emojis"]

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })

export function GeneradorTexto() {
  const [tipo, setTipo] = useState<TipoTexto>("linkedin")
  const [prompt, setPrompt] = useState("")
  const [verParametros, setVerParametros] = useState(false)
  const [canal, setCanal] = useState("")
  const [publico, setPublico] = useState("")
  const [objetivo, setObjetivo] = useState("")
  const [tono, setTono] = useState("")
  const [extension, setExtension] = useState("media")
  const [idioma, setIdioma] = useState(IDIOMAS_TEXTO[0])
  const [marca, setMarca] = useState(true)
  const [contexto, setContexto] = useState<string>("contenido")

  const [resultado, setResultado] = useState("")
  const [generando, setGenerando] = useState(false)
  const [ajuste, setAjuste] = useState("")
  const [copiado, setCopiado] = useState(false)
  const [recientes, setRecientes] = useState<TextoGenerado[]>([])

  const corte = useRef<AbortController | null>(null)

  useEffect(() => {
    cargarRecientes()

    // Reabrir desde el historial: /contenido/texto?desde=<id>
    const desde = new URLSearchParams(window.location.search).get("desde")
    if (desde) {
      fetch(`${API}/historial/${desde}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { entrada?: EntradaHistorial } | null) => {
          if (d?.entrada?.tipo !== "texto") return
          aplicarParametros(d.entrada.parametros)
          setPrompt(d.entrada.prompt)
          setResultado(d.entrada.texto)
        })
        .catch(() => {})
    }
  }, [])

  /** Carga en el formulario los parámetros de un texto del historial. */
  function aplicarParametros(p: Record<string, unknown>) {
    const str = (v: unknown) => (typeof v === "string" ? v : "")
    if (TIPOS_TEXTO.some((t) => t.id === p.tipo)) setTipo(p.tipo as TipoTexto)
    setCanal(str(p.canal))
    setPublico(str(p.publico))
    setObjetivo(str(p.objetivo))
    setTono(str(p.tono))
    if (EXTENSIONES_TEXTO.some((e) => e.id === p.extension)) setExtension(p.extension as string)
    if (IDIOMAS_TEXTO.includes(str(p.idioma))) setIdioma(str(p.idioma))
    if (typeof p.marca === "boolean") setMarca(p.marca)
    if (CONTEXTOS_MARCA.some((c) => c.id === p.contexto)) setContexto(p.contexto as string)
    if (str(p.canal) || str(p.publico) || str(p.objetivo) || str(p.tono)) setVerParametros(true)
  }

  function cargarRecientes() {
    fetch(`${API}/texto`)
      .then((r) => (r.ok ? r.json() : { textos: [] }))
      .then((d) => setRecientes(d.textos ?? []))
      .catch(() => {})
  }

  async function generar(conAjuste?: string) {
    const texto = prompt.trim()
    if (!texto) return toast.error("Escribí qué contenido necesitás")

    const anterior = conAjuste ? resultado : ""
    corte.current = new AbortController()
    setGenerando(true)
    setResultado("")

    try {
      const res = await fetch(`${API}/texto`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: texto,
          tipo,
          canal,
          publico,
          objetivo,
          tono,
          extension,
          idioma,
          marca,
          contexto,
          anterior: anterior || undefined,
          ajuste: conAjuste || undefined,
        }),
        signal: corte.current.signal,
      })
      if (!res.ok || !res.body) throw new Error(await errorDe(res, "No se pudo generar el texto"))

      const lector = res.body.getReader()
      const decoder = new TextDecoder()
      let acumulado = ""
      for (;;) {
        const { done, value } = await lector.read()
        if (done) break
        acumulado += decoder.decode(value, { stream: true })
        setResultado(acumulado)
      }
      setAjuste("")
      cargarRecientes()
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return
      toast.error(e instanceof Error ? e.message : "No se pudo generar el texto")
      // Si se estaba ajustando, que no se pierda lo que había.
      if (anterior) setResultado(anterior)
    } finally {
      setGenerando(false)
      corte.current = null
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(resultado)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  function bajar(ext: "txt" | "md") {
    const nombre = TIPOS_TEXTO.find((t) => t.id === tipo)?.nombre ?? "texto"
    const slug = nombre.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    descargar(new Blob([resultado], { type: "text/plain;charset=utf-8" }), `accedra-${slug}.${ext}`)
  }

  function abrirReciente(t: TextoGenerado) {
    setPrompt(t.prompt)
    setResultado(t.texto)
    if (TIPOS_TEXTO.some((x) => x.id === t.tipoTexto)) setTipo(t.tipoTexto as TipoTexto)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
      {/* Panel del pedido */}
      <aside className="space-y-5 rounded-xl border border-line bg-surface p-5 shadow-e1 lg:sticky lg:top-24 lg:self-start">
        <Campo etiqueta="Tipo de contenido">
          <div className="flex flex-wrap gap-1.5">
            {TIPOS_TEXTO.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTipo(t.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                  tipo === t.id
                    ? "border-brand-400 bg-brand-50 text-brand-700"
                    : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
                )}
              >
                {t.nombre}
              </button>
            ))}
          </div>
        </Campo>

        <Campo etiqueta="¿Qué necesitás?">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generar()
            }}
            rows={6}
            placeholder="Ej.: un post anunciando que vamos a estar en el evento de bancos del 20/10, invitando a pasar por el stand."
          />
        </Campo>

        <div className="rounded-lg border border-line">
          <button
            type="button"
            onClick={() => setVerParametros((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-[12.5px] font-semibold text-ink-secondary"
          >
            Parámetros opcionales
            <ChevronDown className={cn("h-4 w-4 transition-transform", verParametros && "rotate-180")} />
          </button>
          {verParametros && (
            <div className="grid grid-cols-2 gap-3 border-t border-line p-3">
              <Campo etiqueta="Canal">
                <Input list="gen-canales" value={canal} onChange={(e) => setCanal(e.target.value)} placeholder="Cualquiera" />
              </Campo>
              <Campo etiqueta="Objetivo">
                <Input list="gen-objetivos" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="—" />
              </Campo>
              <Campo etiqueta="Público" className="col-span-2">
                <Input value={publico} onChange={(e) => setPublico(e.target.value)} placeholder="Ej.: gerentes de sistemas de bancos" />
              </Campo>
              <Campo etiqueta="Tono">
                <Input list="gen-tonos" value={tono} onChange={(e) => setTono(e.target.value)} placeholder="El de la marca" />
              </Campo>
              <Campo etiqueta="Idioma">
                <select value={idioma} onChange={(e) => setIdioma(e.target.value)} className={CLASE_SELECT}>
                  {IDIOMAS_TEXTO.map((i) => (
                    <option key={i}>{i}</option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Extensión" className="col-span-2">
                <Segmentado
                  opciones={EXTENSIONES_TEXTO.map((e) => ({ id: e.id, nombre: e.nombre }))}
                  valor={extension}
                  onCambio={setExtension}
                />
              </Campo>
              <datalist id="gen-canales">{CANALES_TEXTO.map((c) => <option key={c} value={c} />)}</datalist>
              <datalist id="gen-objetivos">{OBJETIVOS_TEXTO.map((c) => <option key={c} value={c} />)}</datalist>
              <datalist id="gen-tonos">{TONOS_TEXTO.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-line p-3">
          <label className="flex cursor-pointer items-start justify-between gap-3">
            <span>
              <span className="block text-[12.5px] font-semibold text-ink">Usar contexto de marca</span>
              <span className="block text-[11.5px] leading-snug text-ink-muted">
                Tono, servicios y claims del Brand Kit. Apagalo para textos que no son de Accedra.
              </span>
            </span>
            <Switch checked={marca} onCheckedChange={setMarca} />
          </label>
          {marca && (
            <Campo etiqueta="Enfoque">
              <select value={contexto} onChange={(e) => setContexto(e.target.value)} className={CLASE_SELECT}>
                {CONTEXTOS_MARCA.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} — {c.nota}
                  </option>
                ))}
              </select>
            </Campo>
          )}
        </div>

        {generando ? (
          <Button className="w-full" size="lg" variant="outline" onClick={() => corte.current?.abort()}>
            <Square /> Detener
          </Button>
        ) : (
          <Button className="w-full" size="lg" onClick={() => generar()}>
            <Sparkles /> Generar texto
          </Button>
        )}
      </aside>

      {/* Resultado */}
      <section className="min-w-0 space-y-8">
        {!resultado && !generando ? (
          <div className="rounded-xl border border-dashed border-line-strong">
            <EmptyState
              icon={Sparkles}
              title="Todavía no generaste nada"
              description="Elegí el tipo de contenido y escribí qué necesitás. Después podés ajustarlo, regenerarlo, copiarlo o descargarlo."
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
              <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                {generando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {generando ? "Escribiendo…" : `${resultado.trim().split(/\s+/).filter(Boolean).length} palabras · editable`}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="xs" disabled={generando} onClick={() => generar()}>
                  <RefreshCw /> Regenerar
                </Button>
                <Button variant="ghost" size="xs" disabled={generando || !resultado} onClick={copiar}>
                  {copiado ? <Check /> : <Copy />} {copiado ? "Copiado" : "Copiar"}
                </Button>
                <Button variant="ghost" size="xs" disabled={generando || !resultado} onClick={() => bajar("txt")}>
                  <Download /> .txt
                </Button>
                <Button variant="ghost" size="xs" disabled={generando || !resultado} onClick={() => bajar("md")}>
                  <Download /> .md
                </Button>
              </div>
            </div>
            <Textarea
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
              readOnly={generando}
              className="min-h-[420px] resize-y rounded-none border-0 px-5 py-4 text-[13.5px] leading-relaxed shadow-none focus-visible:shadow-none"
            />
            <div className="space-y-2 border-t border-line bg-surface-subtle p-3">
              <div className="flex gap-2">
                <Input
                  value={ajuste}
                  onChange={(e) => setAjuste(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && ajuste.trim() && !generando && generar(ajuste.trim())}
                  placeholder="Ajustar el resultado: «sumá un dato concreto», «cerrá con una pregunta»…"
                  disabled={generando}
                />
                <Button disabled={generando || !ajuste.trim()} onClick={() => generar(ajuste.trim())}>
                  <Wand2 /> Ajustar
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {AJUSTES_RAPIDOS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    disabled={generando}
                    onClick={() => generar(a)}
                    className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {recientes.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13.5px] font-semibold text-ink">Generados recientemente</h2>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/contenido/historial?tipo=texto">
                  <History /> Ver historial
                </Link>
              </Button>
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {recientes.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => abrirReciente(t)}
                    className="w-full px-4 py-2.5 text-left transition-colors hover:bg-surface-subtle"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[12.5px] font-medium text-ink">{t.prompt}</span>
                      <span className="shrink-0 text-[11px] text-ink-faint">
                        {TIPOS_TEXTO.find((x) => x.id === t.tipoTexto)?.nombre} · {fecha(t.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-muted">{t.texto}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
