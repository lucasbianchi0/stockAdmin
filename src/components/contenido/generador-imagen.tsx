"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  Brush,
  Download,
  Expand,
  History,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Sparkles,
  Stamp,
  Trash2,
  Wand2,
  X,
} from "lucide-react"

import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/ui/states"
import {
  CLASE_SELECT,
  Campo,
  Segmentado,
  SubidorReferencias,
  achicar,
  descargar,
  errorDe,
} from "@/components/contenido/generador-ui"
import { CamposLogo, DialogoLogo, DialogoZona } from "@/components/contenido/generador-edicion"
import {
  BotonTemplates,
  CamposFeed,
  GaleriaFeed,
  TEXTO_FEED_VACIO,
  TemplateElegido,
  aVariables,
  deVariables,
  useMuestras,
  type TextoFeed,
} from "@/components/contenido/generador-feed"
import { templateFeedPorId, type TemplateFeed } from "@/lib/templates-feed"
import {
  FORMATOS_ESTANDAR,
  LOGO_DEFAULT,
  MAX_REFERENCIAS,
  MAX_VARIANTES,
  MEDIDA_MAX,
  MEDIDA_MIN,
  MOTORES_IMAGEN,
  OPERACION_LABEL,
  type ConfigLogo,
  type EntradaHistorial,
  type Formato,
  type ImagenGenerada,
  type MotorImagen,
  type OperacionImagen,
} from "@/lib/generador"
import { cn } from "@/lib/utils"

const API = "/api/contenido/generador"
const PERSONALIZADO = "personalizado"

/** Un casillero de resultado: lo que se está generando, lo que salió o lo que falló. */
type Casillero =
  | { key: string; estado: "cargando"; ancho: number; alto: number; operacion: OperacionImagen }
  | { key: string; estado: "listo"; imagen: ImagenGenerada }
  | { key: string; estado: "error"; ancho: number; alto: number; error: string }

/** Lo necesario para repetir un pedido tal cual (el botón "Regenerar"). */
type Pedido = {
  operacion: OperacionImagen
  prompt: string
  ancho: number
  alto: number
  motor: MotorImagen
  marca: boolean
  referencias: string[]
  variantes: number
  origenId: string | null
  mascara?: string
  logo: ConfigLogo | null
  /** Solo con un template del feed. */
  templateFeed?: string
  variables?: ReturnType<typeof aVariables>
  escena?: string
  tema?: "oscuro" | "claro"
  formato?: "square" | "portrait"
  foto?: string
}

/** Las dos medidas del sistema del feed. Otras se consiguen después con "Adaptar formato". */
const MEDIDA_FEED = { square: { ancho: 1080, alto: 1080 }, portrait: { ancho: 1080, alto: 1350 } } as const

/** En qué está el panel izquierdo. Zona y logo son diálogos aparte. */
type Modo =
  { tipo: "generar" } | { tipo: "modificar"; base: ImagenGenerada } | { tipo: "adaptar"; base: ImagenGenerada }

const nombreArchivo = (img: ImagenGenerada) => `accedra-${img.ancho}x${img.alto}-${img.id.slice(0, 8)}.png`

export function GeneradorImagen() {
  // ── Pedido ──
  const [modo, setModo] = useState<Modo>({ tipo: "generar" })
  const [prompt, setPrompt] = useState("")
  const [formatoId, setFormatoId] = useState(FORMATOS_ESTANDAR[0].id)
  const [ancho, setAncho] = useState(FORMATOS_ESTANDAR[0].ancho)
  const [alto, setAlto] = useState(FORMATOS_ESTANDAR[0].alto)
  const [motor, setMotor] = useState<MotorImagen>("chatgpt")
  const [variantes, setVariantes] = useState(2)
  const [marca, setMarca] = useState(false)
  const [conLogo, setConLogo] = useState(false)
  const [logo, setLogo] = useState<ConfigLogo>(LOGO_DEFAULT)
  const [referencias, setReferencias] = useState<string[]>([])

  // ── Template del feed ──
  const [feed, setFeed] = useState<TemplateFeed | null>(null)
  const [textoFeed, setTextoFeed] = useState<TextoFeed>(TEXTO_FEED_VACIO)
  const [temaFeed, setTemaFeed] = useState<"oscuro" | "claro">("oscuro")
  const [formatoFeed, setFormatoFeed] = useState<"square" | "portrait">("square")
  const [fondoFeed, setFondoFeed] = useState<"ia" | "foto">("ia")
  const [escena, setEscena] = useState("")
  const [fotoFeed, setFotoFeed] = useState<string[]>([])
  const [galeria, setGaleria] = useState(false)
  const muestras = useMuestras()

  // ── Formatos guardados ──
  const [guardados, setGuardados] = useState<Formato[]>([])
  const [nombreFormato, setNombreFormato] = useState<string | null>(null)

  // ── Resultados ──
  const [casilleros, setCasilleros] = useState<Casillero[]>([])
  const [ultimo, setUltimo] = useState<Pedido | null>(null)
  const [recientes, setRecientes] = useState<ImagenGenerada[]>([])

  // ── Diálogos ──
  const [zonaDe, setZonaDe] = useState<ImagenGenerada | null>(null)
  const [logoDe, setLogoDe] = useState<ImagenGenerada | null>(null)
  const [logoDialogo, setLogoDialogo] = useState<ConfigLogo>(LOGO_DEFAULT)

  const generando = casilleros.some((c) => c.estado === "cargando")
  const todos = [...FORMATOS_ESTANDAR, ...guardados]

  useEffect(() => {
    fetch(`${API}/formatos`)
      .then((r) => (r.ok ? r.json() : { formatos: [] }))
      .then((d) => setGuardados(d.formatos ?? []))
      .catch(() => {})
    cargarRecientes()

    // Reabrir desde el historial (?desde=<id>) o llegar con un template elegido (?feed=<id>).
    const params = new URLSearchParams(window.location.search)
    const conTemplate = templateFeedPorId(params.get("feed"))
    if (conTemplate) setFeed(conTemplate)
    const desde = params.get("desde")
    if (desde) {
      fetch(`${API}/historial/${desde}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { entrada?: EntradaHistorial } | null) => {
          if (d?.entrada?.tipo !== "imagen") return
          abrirImagen(d.entrada)
          // Una pieza de template vuelve con su template y su texto, lista para iterar.
          const p = d.entrada.parametros
          const t = p.operacion === "feed" ? templateFeedPorId(String(p.template ?? "")) : null
          if (t) {
            setFeed(t)
            setTextoFeed(deVariables(p.variables as Record<string, unknown> | undefined))
            if (p.tema === "claro" || p.tema === "oscuro") setTemaFeed(p.tema)
            if (p.formato === "portrait" || p.formato === "square") setFormatoFeed(p.formato)
            setEscena(typeof p.escena === "string" ? p.escena : "")
          }
        })
        .catch(() => {})
    }
    // Solo al montar: leer el link una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function cargarRecientes() {
    fetch(`${API}/imagen?limite=24`)
      .then((r) => (r.ok ? r.json() : { imagenes: [] }))
      .then((d) => setRecientes(d.imagenes ?? []))
      .catch(() => {})
  }

  /* ── Formato ── */

  function elegirFormato(id: string) {
    setFormatoId(id)
    const f = todos.find((x) => x.id === id)
    if (f) {
      setAncho(f.ancho)
      setAlto(f.alto)
    }
  }

  function fijarMedida(a: number, h: number) {
    setAncho(a)
    setAlto(h)
    setFormatoId(todos.find((f) => f.ancho === a && f.alto === h)?.id ?? PERSONALIZADO)
  }

  function editarMedida(lado: "ancho" | "alto", valor: string) {
    const n = Math.max(0, Math.min(MEDIDA_MAX, Number(valor.replace(/\D/g, "")) || 0))
    if (lado === "ancho") setAncho(n)
    else setAlto(n)
    setFormatoId(PERSONALIZADO)
  }

  const medidaOk = ancho >= MEDIDA_MIN && alto >= MEDIDA_MIN

  async function guardarFormato() {
    const nombre = nombreFormato?.trim()
    if (!nombre) return
    const res = await fetch(`${API}/formatos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre, ancho, alto }),
    })
    if (!res.ok) return toast.error(await errorDe(res, "No se pudo guardar el formato"))
    const { formato } = (await res.json()) as { formato: Formato }
    setGuardados((g) => [...g, formato].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    setFormatoId(formato.id)
    setNombreFormato(null)
    toast.success("Formato guardado")
  }

  async function borrarFormato(id: string) {
    const res = await fetch(`${API}/formatos/${id}`, { method: "DELETE" })
    if (!res.ok) return toast.error(await errorDe(res, "No se pudo borrar el formato"))
    setGuardados((g) => g.filter((f) => f.id !== id))
    setFormatoId(PERSONALIZADO)
  }

  /* ── Template del feed ── */

  function elegirTemplate(t: TemplateFeed) {
    setFeed(t)
    setModo({ tipo: "generar" })
    setGaleria(false)
  }

  /* ── Referencias ── */

  async function usarComoReferencia(img: ImagenGenerada) {
    if (!img.url) return
    if (referencias.length >= MAX_REFERENCIAS) return toast.error(`Hasta ${MAX_REFERENCIAS} imágenes de referencia`)
    try {
      const dataUrl = await achicar(await (await fetch(img.url)).blob())
      setReferencias((r) => [...r, dataUrl])
      toast.success("Agregada como referencia")
    } catch {
      toast.error("No se pudo usar esa imagen")
    }
  }

  /* ── Generar ── */

  const ejecutar = useCallback(async (pedido: Pedido) => {
    setUltimo(pedido)
    const grupoId = crypto.randomUUID()
    const keys = Array.from({ length: pedido.variantes }, () => crypto.randomUUID())
    setCasilleros(
      keys.map((key) => ({
        key,
        estado: "cargando",
        ancho: pedido.ancho,
        alto: pedido.alto,
        operacion: pedido.operacion,
      }))
    )

    // Una petición por variante, en paralelo: cada una aparece apenas sale.
    await Promise.all(
      keys.map(async (key) => {
        let resultado: Casillero
        try {
          const res = await fetch(`${API}/imagen`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...pedido, grupoId }),
            signal: AbortSignal.timeout(120_000),
          })
          if (!res.ok) throw new Error(await errorDe(res, "No se pudo generar la imagen"))
          const { imagen } = (await res.json()) as { imagen: ImagenGenerada }
          resultado = { key, estado: "listo", imagen }
        } catch (e) {
          const error =
            e instanceof DOMException && e.name === "TimeoutError"
              ? "Tardó demasiado. Probá de nuevo."
              : e instanceof Error
                ? e.message
                : "No se pudo generar la imagen"
          resultado = { key, estado: "error", ancho: pedido.ancho, alto: pedido.alto, error }
        }
        setCasilleros((cs) => cs.map((c) => (c.key === key ? resultado : c)))
      })
    )
    cargarRecientes()
  }, [])

  function enviar() {
    if (modo.tipo === "generar" && feed) return enviarFeed(feed)
    const texto = prompt.trim()

    if (modo.tipo !== "adaptar" && !texto) {
      return toast.error(modo.tipo === "modificar" ? "Escribí qué querés cambiar" : "Escribí qué imagen necesitás")
    }
    if (modo.tipo !== "modificar" && !medidaOk) {
      return toast.error(`La medida va de ${MEDIDA_MIN} a ${MEDIDA_MAX} px por lado`)
    }

    ejecutar({
      operacion: modo.tipo,
      prompt: texto,
      // Una modificación sale con la medida de la imagen que se modifica.
      ancho: modo.tipo === "modificar" ? modo.base.ancho : ancho,
      alto: modo.tipo === "modificar" ? modo.base.alto : alto,
      motor,
      marca,
      referencias: modo.tipo === "adaptar" ? [] : referencias,
      variantes,
      origenId: modo.tipo === "generar" ? null : modo.base.id,
      logo: conLogo ? logo : null,
    })
    if (modo.tipo !== "generar") {
      setModo({ tipo: "generar" })
      setPrompt("")
    }
  }

  function enviarFeed(t: TemplateFeed) {
    const variables = aVariables(textoFeed)
    if (variables.headline.length === 0) return toast.error("Escribí el titular")
    if (fondoFeed === "foto" && fotoFeed.length === 0) return toast.error("Subí la foto del fondo")
    ejecutar({
      operacion: "feed",
      prompt: variables.headline.join(" "),
      ...MEDIDA_FEED[formatoFeed],
      motor,
      marca: false,
      referencias: [],
      variantes: fondoFeed === "foto" ? 1 : variantes,
      origenId: null,
      logo: null,
      templateFeed: t.id,
      variables,
      escena: fondoFeed === "ia" ? escena : undefined,
      tema: temaFeed,
      formato: formatoFeed,
      foto: fondoFeed === "foto" ? fotoFeed[0] : undefined,
    })
  }

  function entrarEnModo(tipo: "modificar" | "adaptar", img: ImagenGenerada) {
    setModo({ tipo, base: img })
    setPrompt("")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function aplicarZona(instruccion: string, mascara: string) {
    if (!zonaDe) return
    ejecutar({
      operacion: "zona",
      prompt: instruccion,
      ancho: zonaDe.ancho,
      alto: zonaDe.alto,
      motor,
      marca,
      referencias,
      variantes: 1,
      origenId: zonaDe.id,
      mascara,
      logo: null,
    })
    setZonaDe(null)
  }

  function aplicarLogo() {
    if (!logoDe) return
    ejecutar({
      operacion: "logo",
      prompt: "",
      ancho: logoDe.ancho,
      alto: logoDe.alto,
      motor,
      marca: false,
      referencias: [],
      variantes: 1,
      origenId: logoDe.id,
      logo: logoDialogo,
    })
    setLogoDe(null)
  }

  function abrirImagen(img: ImagenGenerada) {
    setCasilleros([{ key: img.id, estado: "listo", imagen: img }])
    if (img.operacion !== "feed") setPrompt(img.prompt)
    setModo({ tipo: "generar" })
    fijarMedida(img.ancho, img.alto)
    setUltimo(null)
  }

  async function borrar(img: ImagenGenerada) {
    const res = await fetch(`${API}/historial/${img.id}`, { method: "DELETE" })
    if (!res.ok) return toast.error(await errorDe(res, "No se pudo borrar"))
    setCasilleros((cs) => cs.filter((c) => !(c.estado === "listo" && c.imagen.id === img.id)))
    setRecientes((r) => r.filter((x) => x.id !== img.id))
  }

  /* ── Render ── */

  const base = modo.tipo === "generar" ? null : modo.base
  const conFeed = modo.tipo === "generar" && feed !== null
  const etiquetaBoton = generando
    ? "Generando…"
    : conFeed
      ? `Generar pieza${variantes > 1 && fondoFeed === "ia" ? "s" : ""}`
      : modo.tipo === "modificar"
        ? "Aplicar cambio"
        : modo.tipo === "adaptar"
          ? "Adaptar formato"
          : `Generar imagen${variantes > 1 ? "es" : ""}`

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      {/* Panel del pedido */}
      <aside className="space-y-5 rounded-xl border border-line bg-surface p-5 shadow-e1 lg:sticky lg:top-24 lg:self-start">
        {base ? (
          <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 p-2.5">
            {base.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={base.url} alt="" className="h-12 w-12 rounded-md object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-ink">
                {modo.tipo === "modificar" ? "Modificando una imagen" : "Adaptando a otro formato"}
              </p>
              <p className="text-[11.5px] text-ink-muted">
                {modo.tipo === "modificar"
                  ? "Describí qué cambiar; el resto se mantiene."
                  : "La imagen queda igual y la escena se extiende hasta llenar el formato nuevo."}
              </p>
              {modo.tipo === "adaptar" && base.operacion === "logo" && (
                <p className="mt-1 text-[11px] font-medium text-warning-text">
                  Esta versión ya tiene el logo y va a quedar donde está. Conviene adaptar la versión sin logo y
                  agregarlo al final.
                </p>
              )}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setModo({ tipo: "generar" })} aria-label="Cancelar">
              <X />
            </Button>
          </div>
        ) : feed ? (
          <TemplateElegido
            template={feed}
            muestra={muestras[feed.id]}
            onCambiar={() => setGaleria(true)}
            onQuitar={() => setFeed(null)}
          />
        ) : (
          <BotonTemplates onClick={() => setGaleria(true)} />
        )}

        {conFeed && feed ? (
          <>
            <CamposFeed template={feed} valor={textoFeed} onCambio={setTextoFeed} />

            <Campo etiqueta="Fondo">
              <Segmentado
                opciones={[
                  { id: "ia", nombre: "Generar con IA" },
                  { id: "foto", nombre: "Usar mi foto" },
                ]}
                valor={fondoFeed}
                onCambio={setFondoFeed}
              />
              {fondoFeed === "ia" ? (
                <Textarea
                  rows={3}
                  value={escena}
                  onChange={(e) => setEscena(e.target.value)}
                  placeholder="Qué se ve en la foto. Si lo dejás vacío, usa la escena del template."
                />
              ) : (
                <div className="space-y-1.5">
                  <SubidorReferencias
                    items={fotoFeed.map((src) => ({ src }))}
                    onCambio={(items) => setFotoFeed(items.map((i) => i.src))}
                    maximo={1}
                  />
                  <p className="text-[11.5px] leading-snug text-ink-muted">
                    Se usa de fondo tal cual, recortada a la medida. El texto y el logo se componen encima.
                  </p>
                </div>
              )}
            </Campo>

            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Composición">
                <Segmentado
                  opciones={[
                    { id: "oscuro", nombre: "Oscura" },
                    { id: "claro", nombre: "Clara" },
                  ]}
                  valor={temaFeed}
                  onCambio={setTemaFeed}
                />
              </Campo>
              <Campo etiqueta="Formato">
                <Segmentado
                  opciones={[
                    { id: "square", nombre: "1:1", titulo: "1080 × 1080" },
                    { id: "portrait", nombre: "4:5", titulo: "1080 × 1350" },
                  ]}
                  valor={formatoFeed}
                  onCambio={setFormatoFeed}
                />
              </Campo>
            </div>
            {fondoFeed === "ia" && (
              <Campo etiqueta="Variantes" ayuda="Cada una con otro fondo">
                <Segmentado
                  opciones={Array.from({ length: MAX_VARIANTES }, (_, i) => ({ id: i + 1, nombre: String(i + 1) }))}
                  valor={variantes}
                  onCambio={setVariantes}
                />
              </Campo>
            )}
          </>
        ) : (
          <>
            <Campo
              etiqueta={
                modo.tipo === "modificar"
                  ? "¿Qué querés cambiar?"
                  : modo.tipo === "adaptar"
                    ? "Indicaciones para lo que se agrega"
                    : "¿Qué imagen necesitás?"
              }
              ayuda={modo.tipo === "adaptar" ? "Opcional" : undefined}
            >
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) enviar()
                }}
                rows={modo.tipo === "adaptar" ? 3 : 6}
                placeholder={
                  modo.tipo === "modificar"
                    ? "Ej.: cambiá el fondo a azul oscuro y sacá a la persona de la derecha"
                    : modo.tipo === "adaptar"
                      ? "Ej.: que a los costados siga la oficina, sin agregar personas"
                      : "Desde una idea general («una oficina moderna de noche») hasta un pedido detallado con encuadre, luz, colores y texto."
                }
              />
            </Campo>

            {modo.tipo !== "modificar" && (
              <Campo etiqueta={modo.tipo === "adaptar" ? "Formato nuevo" : "Formato"} ayuda={`${ancho} × ${alto} px`}>
                <select value={formatoId} onChange={(e) => elegirFormato(e.target.value)} className={CLASE_SELECT}>
                  {Object.entries(
                    FORMATOS_ESTANDAR.reduce<Record<string, Formato[]>>((acc, f) => {
                      ;(acc[f.grupo ?? "Otros"] ??= []).push(f)
                      return acc
                    }, {})
                  ).map(([grupo, fs]) => (
                    <optgroup key={grupo} label={grupo}>
                      {fs.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nombre} · {f.ancho}×{f.alto}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {guardados.length > 0 && (
                    <optgroup label="Guardados por el equipo">
                      {guardados.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nombre} · {f.ancho}×{f.alto}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <option value={PERSONALIZADO}>Personalizado…</option>
                </select>

                <div className="flex items-center gap-2">
                  <Input
                    inputMode="numeric"
                    aria-label="Ancho en píxeles"
                    value={ancho || ""}
                    onChange={(e) => editarMedida("ancho", e.target.value)}
                    className="text-center tabular-nums"
                  />
                  <span className="text-ink-faint">×</span>
                  <Input
                    inputMode="numeric"
                    aria-label="Alto en píxeles"
                    value={alto || ""}
                    onChange={(e) => editarMedida("alto", e.target.value)}
                    className="text-center tabular-nums"
                  />
                  {guardados.some((g) => g.id === formatoId) ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => borrarFormato(formatoId)}
                      title="Borrar este formato guardado"
                    >
                      <Trash2 />
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={formatoId !== PERSONALIZADO || !medidaOk}
                      onClick={() => setNombreFormato(nombreFormato === null ? "" : null)}
                      title="Guardar esta medida como formato"
                    >
                      <Save />
                    </Button>
                  )}
                </div>

                {nombreFormato !== null && (
                  <div className="flex items-center gap-2">
                    <Input
                      autoFocus
                      value={nombreFormato}
                      onChange={(e) => setNombreFormato(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && guardarFormato()}
                      placeholder="Nombre, ej.: Banner newsletter"
                    />
                    <Button size="sm" onClick={guardarFormato} disabled={!nombreFormato.trim()}>
                      Guardar
                    </Button>
                  </div>
                )}
                {!medidaOk && (
                  <p className="text-[11.5px] text-destructive">
                    Entre {MEDIDA_MIN} y {MEDIDA_MAX} px por lado.
                  </p>
                )}
              </Campo>
            )}

            {modo.tipo !== "adaptar" && (
              <Campo etiqueta="Imágenes de referencia" ayuda={`Opcional · hasta ${MAX_REFERENCIAS}`}>
                <SubidorReferencias
                  items={referencias.map((src) => ({ src }))}
                  onCambio={(items) => setReferencias(items.map((i) => i.src))}
                  maximo={MAX_REFERENCIAS}
                />
              </Campo>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Variantes">
                <Segmentado
                  opciones={Array.from({ length: MAX_VARIANTES }, (_, i) => ({ id: i + 1, nombre: String(i + 1) }))}
                  valor={variantes}
                  onCambio={setVariantes}
                />
              </Campo>
              <Campo etiqueta="Motor">
                <Segmentado
                  opciones={MOTORES_IMAGEN.map((m) => ({ id: m.id, nombre: m.nombre, titulo: m.nota }))}
                  valor={motor}
                  onCambio={setMotor}
                />
              </Campo>
            </div>

            <div className="divide-y divide-line rounded-lg border border-line">
              <label className="flex cursor-pointer items-start justify-between gap-3 p-3">
                <span>
                  <span className="block text-[12.5px] font-semibold text-ink">Estilo del Brand Kit</span>
                  <span className="block text-[11.5px] leading-snug text-ink-muted">
                    Paleta, composición y tipografías de Accedra.
                  </span>
                </span>
                <Switch checked={marca} onCheckedChange={setMarca} />
              </label>
              <div className="space-y-3 p-3">
                <label className="flex cursor-pointer items-start justify-between gap-3">
                  <span>
                    <span className="block text-[12.5px] font-semibold text-ink">Agregar el logo</span>
                    <span className="block text-[11.5px] leading-snug text-ink-muted">
                      El archivo oficial, compuesto encima al terminar.
                    </span>
                  </span>
                  <Switch checked={conLogo} onCheckedChange={setConLogo} />
                </label>
                {conLogo && (
                  <CamposLogo
                    valor={logo}
                    onCambio={setLogo}
                    ancho={modo.tipo === "modificar" ? modo.base.ancho : ancho || 1080}
                    alto={modo.tipo === "modificar" ? modo.base.alto : alto || 1080}
                  />
                )}
              </div>
            </div>
          </>
        )}

        <Button className="w-full" size="lg" onClick={enviar} disabled={generando}>
          {generando ? (
            <Loader2 className="animate-spin" />
          ) : modo.tipo === "modificar" ? (
            <Wand2 />
          ) : modo.tipo === "adaptar" ? (
            <Expand />
          ) : conFeed ? (
            <LayoutTemplate />
          ) : (
            <Sparkles />
          )}
          {etiquetaBoton}
        </Button>
      </aside>

      {/* Resultados */}
      <section className="min-w-0 space-y-8">
        {casilleros.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong">
            <EmptyState
              icon={Sparkles}
              title="Todavía no generaste nada"
              description="Escribí el pedido libre o usá un template del feed. Cada variante aparece apenas está lista."
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13.5px] font-semibold text-ink">Resultado</h2>
              {ultimo && ultimo.operacion !== "logo" && (
                <Button variant="outline" size="sm" disabled={generando} onClick={() => ejecutar(ultimo)}>
                  <RefreshCw /> Regenerar
                </Button>
              )}
            </div>
            <div className={cn("grid gap-4", casilleros.length > 1 && "xl:grid-cols-2")}>
              {casilleros.map((c) => (
                <TarjetaResultado
                  key={c.key}
                  casillero={c}
                  onModificar={(img) => entrarEnModo("modificar", img)}
                  onAdaptar={(img) => entrarEnModo("adaptar", img)}
                  onZona={setZonaDe}
                  onLogo={(img) => {
                    setLogoDialogo(logo)
                    setLogoDe(img)
                  }}
                  onReferencia={usarComoReferencia}
                  onBorrar={borrar}
                />
              ))}
            </div>
          </div>
        )}

        {recientes.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13.5px] font-semibold text-ink">Generadas recientemente</h2>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/contenido/historial">
                  <History /> Ver historial
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
              {recientes.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => abrirImagen(img)}
                  title={img.prompt}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-surface-muted"
                >
                  {img.miniatura && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img.miniatura}
                      alt={img.prompt}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  )}
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] tabular-nums text-white">
                    {img.ancho}×{img.alto}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <GaleriaFeed
        abierta={galeria}
        muestras={muestras}
        elegido={feed?.id ?? null}
        onElegir={elegirTemplate}
        onCerrar={() => setGaleria(false)}
      />
      <DialogoZona img={zonaDe} trabajando={generando} onCerrar={() => setZonaDe(null)} onAplicar={aplicarZona} />
      <DialogoLogo
        img={logoDe}
        config={logoDialogo}
        onConfig={setLogoDialogo}
        trabajando={generando}
        onCerrar={() => setLogoDe(null)}
        onAplicar={aplicarLogo}
      />
    </div>
  )
}

function TarjetaResultado({
  casillero: c,
  onModificar,
  onAdaptar,
  onZona,
  onLogo,
  onReferencia,
  onBorrar,
}: {
  casillero: Casillero
  onModificar: (img: ImagenGenerada) => void
  onAdaptar: (img: ImagenGenerada) => void
  onZona: (img: ImagenGenerada) => void
  onLogo: (img: ImagenGenerada) => void
  onReferencia: (img: ImagenGenerada) => void
  onBorrar: (img: ImagenGenerada) => void
}) {
  const [bajando, setBajando] = useState(false)

  if (c.estado !== "listo") {
    return (
      <div
        className="flex max-h-[70vh] w-full items-center justify-center rounded-xl border border-line bg-surface-muted p-6"
        style={{ aspectRatio: `${c.ancho} / ${c.alto}` }}
      >
        {c.estado === "cargando" ? (
          <div className="flex flex-col items-center gap-2 text-ink-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-[12px]">
              {c.operacion === "logo" ? "Aplicando el logo…" : "Generando… suele tardar 20 a 40 s"}
            </span>
          </div>
        ) : (
          <p className="max-w-sm text-center text-[12.5px] leading-relaxed text-destructive">{c.error}</p>
        )}
      </div>
    )
  }

  const img = c.imagen
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
      <div className="relative flex justify-center bg-surface-muted">
        {img.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.url} alt={img.prompt} className="max-h-[70vh] w-auto object-contain" />
        )}
        {img.operacion !== "generar" && (
          <Badge className="absolute left-2 top-2" tone="brand">
            {OPERACION_LABEL[img.operacion]}
          </Badge>
        )}
      </div>
      <figcaption className="space-y-2 border-t border-line px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="outline"
            size="xs"
            onClick={() => onModificar(img)}
            title="Cambiar la imagen entera con una instrucción"
          >
            <Pencil /> Modificar
          </Button>
          <Button variant="outline" size="xs" onClick={() => onZona(img)} title="Pintar una zona y cambiar solo eso">
            <Brush /> Editar zona
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => onAdaptar(img)}
            title="Llevarla a otro formato extendiendo la escena"
          >
            <Expand /> Adaptar formato
          </Button>
          {/* Las piezas de template ya salen con el logo compuesto: otro lo duplicaría. */}
          {img.operacion !== "feed" && (
            <Button variant="outline" size="xs" onClick={() => onLogo(img)} title="Agregar el logo oficial">
              <Stamp /> Logo
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11.5px] tabular-nums text-ink-muted">
            {img.ancho} × {img.alto} px · PNG
          </span>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="xs" onClick={() => onReferencia(img)}>
              <ImagePlus /> Usar de referencia
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={bajando || !img.url}
              onClick={async () => {
                setBajando(true)
                try {
                  await descargar(img.url!, nombreArchivo(img))
                } catch {
                  toast.error("No se pudo descargar")
                } finally {
                  setBajando(false)
                }
              }}
            >
              {bajando ? <Loader2 className="animate-spin" /> : <Download />} PNG
            </Button>
            <Button variant="ghost" size="xs" onClick={() => onBorrar(img)} aria-label="Borrar" title="Borrar">
              <Trash2 />
            </Button>
          </div>
        </div>
      </figcaption>
    </figure>
  )
}
