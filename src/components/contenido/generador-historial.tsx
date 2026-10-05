"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileStack,
  ImageIcon,
  LayoutTemplate,
  Loader2,
  Search,
  Trash2,
  Type,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmarDialog } from "@/components/ui/confirmar-dialog"
import { Input } from "@/components/ui/input"
import { EmptyState, LoadingState } from "@/components/ui/states"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CLASE_SELECT, Modal, descargar, errorDe } from "@/components/contenido/generador-ui"
import { MuestraTemplate, useMuestras } from "@/components/contenido/generador-feed"
import { FAMILIA_LABEL, TEMPLATES_FEED, templateFeedPorId, type FamiliaFeed } from "@/lib/templates-feed"
import {
  CONTEXTOS_MARCA,
  FAMILIAS_LOGO,
  OPERACION_LABEL,
  TIPOS_TEXTO,
  type EntradaHistorial,
  type OperacionImagen,
} from "@/lib/generador"
import { cn } from "@/lib/utils"

const API = "/api/contenido/generador"

type Pestana = "imagen" | "texto" | "templates"
type EntradaImagen = Extract<EntradaHistorial, { tipo: "imagen" }>
type EntradaTexto = Extract<EntradaHistorial, { tipo: "texto" }>

const ETIQUETA_PARAM = { canal: "Canal", publico: "Público", objetivo: "Objetivo", tono: "Tono", idioma: "Idioma" }

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

/** Espera a que se deje de tipear antes de buscar. */
function useDemorado<T>(valor: T, ms = 300): T {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}

/**
 * Todo lo que se generó, con búsqueda y filtros, y los templates del equipo.
 *
 * Cada pestaña mantiene su lista propia y se carga recién cuando se abre: la de
 * imágenes firma URLs de Storage y no tiene sentido pagarlo si se vino a buscar
 * un texto.
 */
export function HistorialClient() {
  const [pestana, setPestana] = useState<Pestana>("imagen")

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tipo")
    if (t === "texto" || t === "templates") setPestana(t)
  }, [])

  return (
    <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)}>
      <TabsList>
        <TabsTrigger value="imagen">
          <ImageIcon className="h-3.5 w-3.5" /> Imágenes
        </TabsTrigger>
        <TabsTrigger value="texto">
          <Type className="h-3.5 w-3.5" /> Textos
        </TabsTrigger>
        <TabsTrigger value="templates">
          <FileStack className="h-3.5 w-3.5" /> Templates
        </TabsTrigger>
      </TabsList>
      <TabsContent value="imagen" className="mt-5">
        <ListaHistorial tipo="imagen" />
      </TabsContent>
      <TabsContent value="texto" className="mt-5">
        <ListaHistorial tipo="texto" />
      </TabsContent>
      <TabsContent value="templates" className="mt-5">
        <ListaTemplates />
      </TabsContent>
    </Tabs>
  )
}

/* ── Imágenes y textos ────────────────────────────────────────────────────── */

function ListaHistorial({ tipo }: { tipo: "imagen" | "texto" }) {
  const [busqueda, setBusqueda] = useState("")
  const [filtro, setFiltro] = useState("")
  const q = useDemorado(busqueda)
  const [entradas, setEntradas] = useState<EntradaHistorial[]>([])
  const [hayMas, setHayMas] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [detalle, setDetalle] = useState<EntradaHistorial | null>(null)
  const [borrar, setBorrar] = useState<EntradaHistorial | null>(null)
  const [borrando, setBorrando] = useState(false)
  /** Descarta respuestas viejas si se cambió el filtro mientras volvían. */
  const pedido = useRef(0)

  const cargar = useCallback(
    async (antes?: string) => {
      const n = ++pedido.current
      setCargando(true)
      const p = new URLSearchParams({ tipo })
      if (q.trim()) p.set("q", q.trim())
      if (filtro) p.set("filtro", filtro)
      if (antes) p.set("antes", antes)
      try {
        const res = await fetch(`${API}/historial?${p}`)
        if (!res.ok) throw new Error(await errorDe(res, "No se pudo cargar el historial"))
        const d = (await res.json()) as { entradas: EntradaHistorial[]; hayMas: boolean }
        if (n !== pedido.current) return
        setEntradas((prev) => (antes ? [...prev, ...d.entradas] : d.entradas))
        setHayMas(d.hayMas)
      } catch (e) {
        if (n === pedido.current) toast.error(e instanceof Error ? e.message : "No se pudo cargar el historial")
      } finally {
        if (n === pedido.current) setCargando(false)
      }
    },
    [tipo, q, filtro]
  )

  useEffect(() => {
    cargar()
  }, [cargar])

  async function confirmarBorrado() {
    if (!borrar) return
    setBorrando(true)
    const res = await fetch(`${API}/historial/${borrar.id}`, { method: "DELETE" })
    setBorrando(false)
    if (!res.ok) return toast.error(await errorDe(res, "No se pudo borrar"))
    setEntradas((es) => es.filter((e) => e.id !== borrar.id))
    if (detalle?.id === borrar.id) setDetalle(null)
    setBorrar(null)
  }

  async function verOriginal(id: string) {
    const res = await fetch(`${API}/historial/${id}`)
    if (!res.ok) return toast.error("El original ya no está en el historial")
    const { entrada } = (await res.json()) as { entrada: EntradaHistorial }
    setDetalle(entrada)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={tipo === "imagen" ? "Buscar por pedido…" : "Buscar en pedidos y textos…"}
            className="pl-8"
          />
        </div>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className={cn(CLASE_SELECT, "w-auto")}>
          {tipo === "imagen" ? (
            <>
              <option value="">Todas las operaciones</option>
              {(Object.keys(OPERACION_LABEL) as OperacionImagen[]).map((o) => (
                <option key={o} value={o}>
                  {OPERACION_LABEL[o]}
                </option>
              ))}
            </>
          ) : (
            <>
              <option value="">Todos los tipos</option>
              {TIPOS_TEXTO.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </>
          )}
        </select>
        <Button asChild size="sm" className="ml-auto">
          <Link href={tipo === "imagen" ? "/contenido/imagen" : "/contenido/texto"}>
            {tipo === "imagen" ? "Generar imagen" : "Generar texto"}
          </Link>
        </Button>
      </div>

      {cargando && entradas.length === 0 ? (
        <LoadingState />
      ) : entradas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong">
          <EmptyState
            icon={tipo === "imagen" ? ImageIcon : Type}
            title={q || filtro ? "No hay resultados con ese filtro" : "Todavía no hay nada generado"}
          />
        </div>
      ) : tipo === "imagen" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {(entradas as EntradaImagen[]).map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setDetalle(e)}
              className="group overflow-hidden rounded-xl border border-line bg-surface text-left shadow-e1 transition-shadow hover:shadow-e2"
            >
              <div className="relative aspect-square bg-surface-muted">
                {e.miniatura && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.miniatura} alt={e.prompt} loading="lazy" className="h-full w-full object-cover" />
                )}
                {e.operacion !== "generar" && (
                  <Badge tone="brand" size="sm" className="absolute left-1.5 top-1.5">
                    {OPERACION_LABEL[e.operacion]}
                  </Badge>
                )}
              </div>
              <div className="space-y-0.5 px-2.5 py-2">
                <p className="line-clamp-2 text-[11.5px] leading-snug text-ink-secondary">{e.prompt || "—"}</p>
                <p className="text-[10.5px] tabular-nums text-ink-faint">
                  {e.ancho}×{e.alto} · {fecha(e.createdAt)}
                </p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {(entradas as EntradaTexto[]).map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setDetalle(e)}
                className="w-full px-4 py-3 text-left transition-colors hover:bg-surface-subtle"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[13px] font-medium text-ink">{e.prompt}</span>
                  <span className="shrink-0 text-[11px] text-ink-faint">{fecha(e.createdAt)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge size="sm">{TIPOS_TEXTO.find((t) => t.id === e.tipoTexto)?.nombre ?? "Libre"}</Badge>
                  <p className="line-clamp-1 text-[12px] text-ink-muted">{e.texto}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {hayMas && (
        <div className="flex justify-center">
          <Button variant="outline" disabled={cargando} onClick={() => cargar(entradas[entradas.length - 1]?.createdAt)}>
            {cargando && <Loader2 className="animate-spin" />} Cargar más
          </Button>
        </div>
      )}

      <DetalleEntrada
        entrada={detalle}
        onCerrar={() => setDetalle(null)}
        onBorrar={setBorrar}
        onVerOriginal={verOriginal}
      />

      <ConfirmarDialog
        abierto={borrar !== null}
        titulo="Borrar del historial"
        descripcion="Se borra para todo el equipo y no se puede recuperar."
        confirmar="Borrar"
        trabajando={borrando}
        onCerrar={() => setBorrar(null)}
        onConfirmar={confirmarBorrado}
      />
    </div>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <span className="text-[11.5px] text-ink-muted">{etiqueta}</span>
      <span className="text-right text-[12px] font-medium text-ink-secondary">{children}</span>
    </div>
  )
}

function DetalleEntrada({
  entrada,
  onCerrar,
  onBorrar,
  onVerOriginal,
}: {
  entrada: EntradaHistorial | null
  onCerrar: () => void
  onBorrar: (e: EntradaHistorial) => void
  onVerOriginal: (id: string) => void
}) {
  const [copiado, setCopiado] = useState(false)
  const [bajando, setBajando] = useState(false)
  if (!entrada) return null
  const p = entrada.parametros

  const acciones = (
    <>
      <Button variant="ghost" className="mr-auto text-destructive" onClick={() => onBorrar(entrada)}>
        <Trash2 /> Borrar
      </Button>
      {entrada.tipo === "imagen" ? (
        <Button
          variant="outline"
          disabled={bajando || !entrada.url}
          onClick={async () => {
            setBajando(true)
            try {
              await descargar(entrada.url!, `accedra-${entrada.ancho}x${entrada.alto}-${entrada.id.slice(0, 8)}.png`)
            } catch {
              toast.error("No se pudo descargar")
            } finally {
              setBajando(false)
            }
          }}
        >
          {bajando ? <Loader2 className="animate-spin" /> : <Download />} PNG
        </Button>
      ) : (
        <>
          <Button
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(entrada.texto)
              setCopiado(true)
              setTimeout(() => setCopiado(false), 2000)
            }}
          >
            {copiado ? <Check /> : <Copy />} {copiado ? "Copiado" : "Copiar"}
          </Button>
          <Button
            variant="outline"
            onClick={() => descargar(new Blob([entrada.texto], { type: "text/plain;charset=utf-8" }), `accedra-${entrada.tipoTexto}.md`)}
          >
            <Download /> .md
          </Button>
        </>
      )}
      <Button asChild>
        <Link href={`/contenido/${entrada.tipo}?desde=${entrada.id}`}>
          <ExternalLink /> Abrir en el generador
        </Link>
      </Button>
    </>
  )

  return (
    <Modal abierto titulo={entrada.tipo === "imagen" ? "Imagen generada" : "Texto generado"} onCerrar={onCerrar} ancho="max-w-5xl" pie={acciones}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_300px]">
        {entrada.tipo === "imagen" ? (
          <div className="flex items-start justify-center rounded-lg bg-surface-muted">
            {entrada.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={entrada.url} alt={entrada.prompt} className="max-h-[65vh] w-auto rounded-lg object-contain" />
            )}
          </div>
        ) : (
          <pre className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-subtle p-4 font-sans text-[13px] leading-relaxed text-ink">
            {entrada.texto}
          </pre>
        )}

        <div className="space-y-4">
          <div>
            <p className="mb-1 text-[11.5px] font-semibold text-ink-muted">Pedido</p>
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{entrada.prompt || "—"}</p>
          </div>
          <div>
            <Dato etiqueta="Fecha">{fecha(entrada.createdAt)}</Dato>
            {entrada.tipo === "imagen" ? (
              <>
                <Dato etiqueta="Operación">{OPERACION_LABEL[entrada.operacion]}</Dato>
                {entrada.operacion === "feed" && (
                  <>
                    <Dato etiqueta="Template">
                      {templateFeedPorId(String(p.template ?? ""))?.nombre ?? String(p.templateNombre ?? "—")}
                    </Dato>
                    <Dato etiqueta="Fondo">{p.fondo === "foto" ? "Foto propia" : "Generado con IA"}</Dato>
                    <Dato etiqueta="Composición">{p.tema === "claro" ? "Clara" : "Oscura"}</Dato>
                  </>
                )}
                <Dato etiqueta="Medida">
                  {entrada.ancho} × {entrada.alto} px
                </Dato>
                {typeof p.instruccion === "string" && p.instruccion && p.instruccion !== entrada.prompt && entrada.operacion !== "generar" && (
                  <Dato etiqueta="Instrucción">{p.instruccion}</Dato>
                )}
                <Dato etiqueta="Motor">{entrada.modelo ?? "Sin IA"}</Dato>
                <Dato etiqueta="Brand Kit">{p.marca ? "Sí" : "No"}</Dato>
                <Dato etiqueta="Logo">
                  {p.logo && typeof p.logo === "object"
                    ? FAMILIAS_LOGO.find((f) => f.id === (p.logo as { familia?: string }).familia)?.nombre ?? "Sí"
                    : "No"}
                </Dato>
                {typeof p.referencias === "number" && p.referencias > 0 && (
                  <Dato etiqueta="Referencias">{p.referencias}</Dato>
                )}
              </>
            ) : (
              <>
                <Dato etiqueta="Tipo">{TIPOS_TEXTO.find((t) => t.id === entrada.tipoTexto)?.nombre ?? "Libre"}</Dato>
                {(["canal", "publico", "objetivo", "tono", "idioma"] as const).map(
                  (k) =>
                    typeof p[k] === "string" &&
                    p[k] && (
                      <Dato key={k} etiqueta={ETIQUETA_PARAM[k]}>
                        {p[k] as string}
                      </Dato>
                    )
                )}
                <Dato etiqueta="Contexto de marca">
                  {p.marca === false
                    ? "No"
                    : CONTEXTOS_MARCA.find((c) => c.id === p.contexto)?.nombre ?? "Contenido"}
                </Dato>
                {typeof p.ajuste === "string" && p.ajuste && <Dato etiqueta="Ajuste">{p.ajuste}</Dato>}
              </>
            )}
          </div>
          {entrada.tipo === "imagen" && entrada.origenId && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => onVerOriginal(entrada.origenId!)}>
              Ver la imagen de origen
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

/* ── Templates ────────────────────────────────────────────────────────────── */

/**
 * Los templates del feed, los mismos del banco de piezas. Son parte del sistema
 * visual y viven en el código (`templates-feed.ts`), así que acá se consultan y
 * se usan, no se editan.
 */
function ListaTemplates() {
  const muestras = useMuestras()
  const [familia, setFamilia] = useState<FamiliaFeed | "">("")
  const visibles = TEMPLATES_FEED.filter((t) => !familia || t.familia === familia)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={familia}
          onChange={(e) => setFamilia(e.target.value as FamiliaFeed | "")}
          className={cn(CLASE_SELECT, "w-auto")}
        >
          <option value="">Todas las familias</option>
          {(Object.keys(FAMILIA_LABEL) as FamiliaFeed[]).map((f) => (
            <option key={f} value={f}>
              {FAMILIA_LABEL[f]}
            </option>
          ))}
        </select>
        <p className="text-[12px] text-ink-muted">
          Los mismos 15 templates del banco de piezas. La muestra es la última pieza que salió con cada uno.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {visibles.map((t) => (
          <div key={t.id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
            <MuestraTemplate template={t} url={muestras[t.id]} className="aspect-square" />
            <div className="flex flex-1 flex-col gap-1 p-3">
              <p className="text-[13px] font-semibold leading-snug text-ink">
                <span className="tabular-nums text-ink-faint">{t.numero}.</span> {t.nombre}
              </p>
              <Badge size="sm" tone={t.familia === "tecnologia" ? "brand" : "neutral"} className="self-start">
                {FAMILIA_LABEL[t.familia]}
              </Badge>
              <p className="line-clamp-3 flex-1 text-[11.5px] leading-snug text-ink-muted">{t.cuandoUsar}</p>
              <Button size="xs" asChild className="mt-2 self-start">
                <Link href={`/contenido/imagen?feed=${t.id}`}>
                  <LayoutTemplate /> Usar
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
