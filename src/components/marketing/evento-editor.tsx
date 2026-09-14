"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowDown,
  ArrowUp,
  Award,
  CalendarDays,
  Clock,
  ExternalLink,
  ImagePlus,
  Loader2,
  MapPin,
  Plus,
  Printer,
  RefreshCw,
  Trash2,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { AsistentesPanel } from "@/components/marketing/asistentes-panel"
import { CertificadoEscalado } from "@/components/marketing/certificado-escalado"
import {
  Campo,
  CampoArea,
  CampoTexto,
  Interruptor,
  Seccion,
  Segmentado,
  Tarjeta,
} from "@/components/marketing/form-campos"
import { FirmanteFila } from "@/components/marketing/firmante-fila"
import { MarcasSelector } from "@/components/marketing/marcas-selector"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CATEGORIAS,
  CATEGORIA_COLOR,
  CATEGORIA_LABEL,
  FIRMANTE_VACIO,
  HORAS_MAX,
  LIMITES,
  MODALIDADES,
  MODALIDAD_LABEL,
  NOMBRE_EJEMPLO,
  TEMAS,
  TEMA_LABEL,
  TIPOS,
  TIPO_LABEL,
  aInputLocal,
  borradorDe,
  borradorVacio,
  deInputLocal,
  faltantesDe,
  fechaCorta,
  fechaLarga,
  horasDe,
  horasTexto,
  marcasDelCertificado,
  slugDe,
  type Asistente,
  type BorradorEvento,
  type Certificado,
  type Evento,
  type Marca,
} from "@/lib/marketing/eventos"
import { cn } from "@/lib/utils"

type Tab = "evento" | "certificado" | "asistentes"

/**
 * La ficha de un evento, en tres pestañas que siguen el orden de la vida real:
 * se anuncia (Evento), se diseña el certificado (Certificado) y, cuando pasó, se
 * cargan los que vinieron y se imprimen (Asistentes).
 *
 * UN SOLO BORRADOR PARA LAS TRES
 *
 * El certificado vive dentro del evento, así que cambiar de pestaña no pierde
 * nada y hay un solo botón de guardar. Los asistentes son la excepción: se
 * guardan al instante, uno por uno, porque son filas y no parte de la ficha.
 *
 * NO SE IMPRIME CON CAMBIOS SIN GUARDAR
 *
 * La impresión se dibuja en el servidor con lo guardado. Dejar imprimir con el
 * editor sucio sería entregar un certificado distinto del que se ve en pantalla.
 */
export function EventoEditor({ id, tabInicial }: { id: string | null; tabInicial: Tab }) {
  const router = useRouter()

  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const [evento, setEvento] = useState<Evento | null>(null)
  const [f, setF] = useState<BorradorEvento>(borradorVacio)
  const [guardadoJson, setGuardadoJson] = useState(() => JSON.stringify(borradorVacio()))
  const [asistentes, setAsistentes] = useState<Asistente[]>([])
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [tab, setTab] = useState<Tab>(id ? tabInicial : "evento")

  const [portada, setPortada] = useState<File | null>(null)
  const [quitarPortada, setQuitarPortada] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* ── Carga ─────────────────────────────────────────────────────────────── */

  const cargar = useCallback(async () => {
    setErrorCarga(null)
    try {
      if (!id) {
        const r = await fetch("/api/marketing/marcas")
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? "No se pudo cargar la biblioteca de marcas")
        setMarcas(d.marcas ?? [])
        return
      }
      const r = await fetch(`/api/marketing/eventos/${id}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudo cargar el evento")
      const b = borradorDe(d.evento as Evento)
      setEvento(d.evento)
      setF(b)
      setGuardadoJson(JSON.stringify(b))
      setAsistentes(d.asistentes ?? [])
      setMarcas(d.marcas ?? [])
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

  // Salir de la pestaña con cambios sin guardar es la forma más común de perder
  // media hora de carga. El navegador pregunta; la navegación interna no.
  useEffect(() => {
    if (!sucio) return
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", avisar)
    return () => window.removeEventListener("beforeunload", avisar)
  }, [sucio])

  const set = <K extends keyof BorradorEvento>(campo: K, valor: BorradorEvento[K]) =>
    setF((prev) => ({ ...prev, [campo]: valor }))

  const setCert = <K extends keyof Certificado>(campo: K, valor: Certificado[K]) =>
    setF((prev) => ({ ...prev, certificado: { ...prev.certificado, [campo]: valor } }))

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

  const portadaUrl = vistaPortada ?? (quitarPortada ? null : evento?.portadaUrl ?? null)

  /* ── Guardar ───────────────────────────────────────────────────────────── */

  async function guardar() {
    const faltantes = faltantesDe(f)
    if (faltantes.length > 0) {
      setError(`Falta ${faltantes.join(", ")}.`)
      setTab("evento")
      return
    }
    setGuardando(true)
    setError(null)
    try {
      const cuerpo = new FormData()
      cuerpo.set("datos", JSON.stringify(f))
      if (portada) cuerpo.set("portada", portada)
      if (quitarPortada && !portada) cuerpo.set("quitar_portada", "true")

      const r = await fetch(id ? `/api/marketing/eventos/${id}` : "/api/marketing/eventos", {
        method: id ? "PATCH" : "POST",
        body: cuerpo,
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar")

      const guardado = d.evento as Evento
      const b = borradorDe(guardado)
      setEvento(guardado)
      setF(b)
      setGuardadoJson(JSON.stringify(b))
      setPortada(null)
      setQuitarPortada(false)

      if (!id) {
        toast.success("Evento creado")
        router.replace(`/marketing/eventos/${guardado.id}`)
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

  if (cargando) return <LoadingState label="Cargando evento…" />
  if (errorCarga) return <ErrorState message={errorCarga} onRetry={cargar} />

  const marcasDe = (ids: string[]) =>
    ids.map((x) => marcas.find((m) => m.id === x)).filter((m): m is Marca => Boolean(m))

  const barra = (
    <BarraGuardar
      sucio={sucio}
      guardando={guardando}
      error={error}
      nuevo={!id}
      publicado={f.publicado}
      onPublicado={(v) => set("publicado", v)}
      onGuardar={guardar}
      slug={evento?.slug ?? ""}
    />
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="evento">
              <CalendarDays className="h-3.5 w-3.5" />
              Evento
            </TabsTrigger>
            <TabsTrigger value="certificado">
              <Award className="h-3.5 w-3.5" />
              Certificado
            </TabsTrigger>
            <TabsTrigger value="asistentes" disabled={!id}>
              <Users className="h-3.5 w-3.5" />
              Asistentes{asistentes.length > 0 ? ` · ${asistentes.length}` : ""}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {!id && (
          <p className="text-[11.5px] text-ink-muted">Los asistentes se cargan una vez creado el evento.</p>
        )}
      </div>

      {tab === "evento" && (
        <PestanaEvento
          f={f}
          set={set}
          nuevo={!id}
          slugGuardado={evento?.slug ?? ""}
          marcas={marcas}
          setMarcas={setMarcas}
          portadaUrl={portadaUrl}
          portadaNombre={portada?.name ?? null}
          onPortada={(file) => {
            setPortada(file)
            setQuitarPortada(false)
          }}
          onQuitarPortada={() => {
            setPortada(null)
            setQuitarPortada(true)
          }}
          barra={barra}
        />
      )}

      {tab === "certificado" && (
        <PestanaCertificado
          f={f}
          setCert={setCert}
          marcas={marcas}
          setMarcas={setMarcas}
          marcasDe={marcasDe}
          asistentes={asistentes}
          eventoId={id}
          sucio={sucio}
          barra={barra}
        />
      )}

      {tab === "asistentes" && id && (
        <AsistentesPanel
          eventoId={id}
          evento={f}
          marcas={marcasDe(marcasDelCertificado(f.certificado, f.marcaIds))}
          asistentes={asistentes}
          onAsistentes={setAsistentes}
          sucio={sucio}
          onIrAlCertificado={() => setTab("certificado")}
        />
      )}
    </div>
  )
}

/* ── Pestaña: evento ──────────────────────────────────────────────────────── */

function PestanaEvento({
  f,
  set,
  nuevo,
  slugGuardado,
  marcas,
  setMarcas,
  portadaUrl,
  portadaNombre,
  onPortada,
  onQuitarPortada,
  barra,
}: {
  f: BorradorEvento
  set: <K extends keyof BorradorEvento>(campo: K, valor: BorradorEvento[K]) => void
  nuevo: boolean
  slugGuardado: string
  marcas: Marca[]
  setMarcas: React.Dispatch<React.SetStateAction<Marca[]>>
  portadaUrl: string | null
  portadaNombre: string | null
  onPortada: (f: File) => void
  onQuitarPortada: () => void
  barra: React.ReactNode
}) {
  const input = useRef<HTMLInputElement>(null)
  const duracion = horasDe(f.inicio, f.fin)

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Seccion num="01" titulo="Qué es" bajada="El título y el resumen son lo que se lee en la card del sitio. La descripción, en la página del evento.">
          <CampoTexto
            label="Título"
            valor={f.titulo}
            onChange={(v) => set("titulo", v)}
            max={LIMITES.titulo}
            placeholder="Microsoft Copilot para equipos comerciales"
            obligatorio
          />
          <Campo label="Tipo">
            <Segmentado opciones={TIPOS.map((v) => ({ v, label: TIPO_LABEL[v] }))} valor={f.tipo} onChange={(v) => set("tipo", v)} />
          </Campo>
          <CampoArea
            label="Resumen"
            valor={f.resumen}
            onChange={(v) => set("resumen", v)}
            max={LIMITES.resumen}
            placeholder="Tres horas prácticas para que tu equipo use Copilot en Outlook, Teams y Excel desde el día siguiente."
            pista="Dos o tres renglones. Es lo que decide si alguien hace clic."
          />
          <CampoArea
            label="Descripción"
            valor={f.descripcion}
            onChange={(v) => set("descripcion", v)}
            max={LIMITES.descripcion}
            filas={7}
            placeholder={"Qué se va a ver, para quién es y qué hay que llevar.\n\nSe respetan los saltos de línea."}
          />
          <Campo
            label="Categorías"
            pista="La solución a la que pertenece. Puede ser más de una: el sitio agrupa y filtra los eventos con esto."
          >
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIAS.map((cat) => {
                const activa = f.categorias.includes(cat)
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() =>
                      set("categorias", activa ? f.categorias.filter((x) => x !== cat) : CATEGORIAS.filter((x) => x === cat || f.categorias.includes(x)))
                    }
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors",
                      activa ? "border-transparent text-white shadow-e1" : "border-line bg-surface text-ink-secondary hover:border-line-strong"
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
          <Campo label="Tags" pista="Enter o coma para agregar. Palabras clave que se muestran en la página del evento: Copilot, Zero Trust, Power BI.">
            <Tags valor={f.tags} onChange={(v) => set("tags", v)} />
          </Campo>
        </Seccion>

        <Seccion num="02" titulo="Cuándo y dónde" bajada="La hora de fin hace que el sitio lo pase solo a “Realizado”, y sugiere las horas del certificado.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Empieza *">
              <Input type="datetime-local" value={aInputLocal(f.inicio)} onChange={(e) => set("inicio", deInputLocal(e.target.value))} />
            </Campo>
            <Campo label="Termina" pista={duracion ? `Dura ${horasTexto(duracion)}.` : undefined}>
              <Input type="datetime-local" value={aInputLocal(f.fin)} onChange={(e) => set("fin", deInputLocal(e.target.value))} />
            </Campo>
          </div>
          <Campo label="Modalidad">
            <Segmentado opciones={MODALIDADES.map((v) => ({ v, label: MODALIDAD_LABEL[v] }))} valor={f.modalidad} onChange={(v) => set("modalidad", v)} />
          </Campo>
          <CampoTexto
            label={f.modalidad === "online" ? "Plataforma" : "Lugar"}
            valor={f.lugar}
            onChange={(v) => set("lugar", v)}
            max={LIMITES.lugar}
            placeholder={f.modalidad === "online" ? "Microsoft Teams" : "Oficinas Accedra · Irala 1950, CABA"}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Cupo" pista="Vacío: sin límite.">
              <Input
                type="number"
                min={1}
                value={f.cupo ?? ""}
                onChange={(e) => set("cupo", e.target.value ? Number(e.target.value) : null)}
                placeholder="30"
              />
            </Campo>
            <CampoTexto label="Precio" valor={f.precio} onChange={(v) => set("precio", v)} max={LIMITES.precio} placeholder="Sin costo" />
          </div>
          <CampoTexto
            label="Link de inscripción"
            valor={f.inscripcionUrl}
            onChange={(v) => set("inscripcionUrl", v)}
            max={LIMITES.url}
            placeholder="https://forms.office.com/…"
            pista="Vacío: el botón del sitio lleva al formulario de contacto."
            mono
          />
        </Seccion>

        <Seccion num="03" titulo="Tecnologías" bajada="Los logos que salen en la card del sitio y, salvo que el certificado elija otros, en el certificado.">
          <MarcasSelector
            marcas={marcas}
            seleccion={f.marcaIds}
            onChange={(ids) => set("marcaIds", ids)}
            onMarcaCreada={(m) => setMarcas((prev) => [...prev, m].sort((a, b) => a.nombre.localeCompare(b.nombre)))}
            onMarcaBorrada={(idBorrada) => setMarcas((prev) => prev.filter((m) => m.id !== idBorrada))}
          />
        </Seccion>

        <Seccion
          num="04"
          titulo="Oradores"
          bajada="Opcional. Un nombre con cargo le da peso a una charla que de otro modo es “de Accedra”."
          accion={
            f.oradores.length < LIMITES.oradores ? (
              <Button type="button" variant="outline" size="xs" onClick={() => set("oradores", [...f.oradores, { nombre: "", cargo: "", empresa: "" }])}>
                <Plus />
                Agregar
              </Button>
            ) : undefined
          }
        >
          {f.oradores.length === 0 ? (
            <p className="text-[12px] text-ink-muted">Sin oradores cargados.</p>
          ) : (
            f.oradores.map((o, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                {(["nombre", "cargo", "empresa"] as const).map((k) => (
                  <Input
                    key={k}
                    value={o[k]}
                    maxLength={LIMITES.oradorCampo}
                    placeholder={k === "nombre" ? "Nombre" : k === "cargo" ? "Cargo" : "Empresa"}
                    onChange={(e) => set("oradores", f.oradores.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
                  />
                ))}
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => set("oradores", f.oradores.filter((_, j) => j !== i))} title="Quitar">
                  <X />
                </Button>
              </div>
            ))
          )}
        </Seccion>

        <Seccion num="05" titulo="Portada" bajada="La foto de la card. Se recorta a 16:9, así que el texto importante no puede estar en la imagen.">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onPortada(file)
            }}
          />
          {portadaUrl ? (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-e1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={portadaUrl} alt="" className="h-16 w-28 shrink-0 rounded-lg object-cover" />
              <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink-muted">
                {portadaNombre ? `${portadaNombre} · se sube al guardar` : "La portada publicada"}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
                <RefreshCw />
                Cambiar
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={onQuitarPortada} title="Quitar">
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
                <span className="mt-0.5 block text-[11.5px] text-ink-muted">JPG, PNG o WebP · mínimo 600 px de ancho. Sin portada, la card usa el fondo de marca.</span>
              </span>
            </button>
          )}
        </Seccion>

        <Seccion num="06" titulo="Publicación">
          <Campo
            label="Dirección"
            pista={nuevo ? "Se genera del título al crear." : "Cambiarla rompe los links que ya se compartieron."}
          >
            <div className="flex items-center rounded-lg border border-line bg-surface-subtle pl-3">
              <span className="shrink-0 font-mono text-[12px] text-ink-faint">accedra.com.ar/eventos?evento=</span>
              <Input
                value={nuevo && !f.slug ? slugDe(f.titulo) : f.slug}
                onChange={(e) => set("slug", slugDe(e.target.value) || e.target.value.toLowerCase())}
                onBlur={(e) => set("slug", slugDe(e.target.value))}
                className="border-0 bg-transparent pl-0.5 font-mono text-[12px] shadow-none focus-visible:ring-0"
                placeholder={slugGuardado || "copilot-para-ventas"}
              />
            </div>
          </Campo>
          <Interruptor
            label="Destacado"
            pista="Ocupa la card grande de la sección. Si hay varios, gana el más próximo."
            valor={f.destacado}
            onChange={(v) => set("destacado", v)}
          />
        </Seccion>
      </div>

      <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <VistaSitio f={f} portadaUrl={portadaUrl} marcas={f.marcaIds.map((x) => marcas.find((m) => m.id === x)).filter((m): m is Marca => Boolean(m))} />
        {barra}
      </div>
    </div>
  )
}

/* ── Pestaña: certificado ─────────────────────────────────────────────────── */

function PestanaCertificado({
  f,
  setCert,
  marcas,
  setMarcas,
  marcasDe,
  asistentes,
  eventoId,
  sucio,
  barra,
}: {
  f: BorradorEvento
  setCert: <K extends keyof Certificado>(campo: K, valor: Certificado[K]) => void
  marcas: Marca[]
  setMarcas: React.Dispatch<React.SetStateAction<Marca[]>>
  marcasDe: (ids: string[]) => Marca[]
  asistentes: Asistente[]
  eventoId: string | null
  sucio: boolean
  barra: React.ReactNode
}) {
  const c = f.certificado
  const [muestraId, setMuestraId] = useState<string>("ejemplo")
  const propias = c.marcasPropias
  const duracion = horasDe(f.inicio, f.fin)

  const muestra = useMemo(() => {
    const a = asistentes.find((x) => x.id === muestraId)
    return a
      ? { nombre: a.nombre, codigo: a.codigo, horas: a.horas }
      : { nombre: NOMBRE_EJEMPLO, codigo: "ACC-26-7K3QXM", horas: null }
  }, [asistentes, muestraId])

  function moverContenido(i: number, delta: number) {
    const lista = [...c.contenidos]
    const j = i + delta
    if (j < 0 || j >= lista.length) return
    ;[lista[i], lista[j]] = [lista[j], lista[i]]
    setCert("contenidos", lista)
  }

  return (
    <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Seccion num="01" titulo="Diseño">
          <div className="grid grid-cols-2 gap-2">
            {TEMAS.map((t) => (
              <Tarjeta
                key={t}
                activo={c.tema === t}
                titulo={TEMA_LABEL[t]}
                pista={t === "azul" ? "El de marca. Para PDF y pantalla." : "Rinde mejor impreso en papel."}
                onClick={() => setCert("tema", t)}
              >
                <span
                  className="mb-2 block h-10 rounded-lg"
                  style={{
                    background:
                      t === "azul"
                        ? "linear-gradient(128deg,#0B2466 0%,#1640A0 40%,#2F79E0 100%)"
                        : "linear-gradient(140deg,#060D19 0%,#0A1424 50%,#0F2140 100%)",
                  }}
                />
              </Tarjeta>
            ))}
          </div>
          <div className="space-y-3 border-t border-line pt-4">
            <Interruptor
              label="Contenidos impartidos"
              pista="Apagado por defecto: en LinkedIn la lista de temas no se lee y le quita protagonismo a los logos."
              valor={c.mostrarContenidos}
              onChange={(v) => setCert("mostrarContenidos", v)}
            />
            <Interruptor label="Tecnologías revisadas" valor={c.mostrarTecnologias} onChange={(v) => setCert("mostrarTecnologias", v)} />
            <Interruptor
              label="Código de verificación"
              pista="Cada certificado lleva un código único que se valida en accedra.com.ar."
              valor={c.mostrarCodigo}
              onChange={(v) => setCert("mostrarCodigo", v)}
            />
          </div>
        </Seccion>

        <Seccion num="02" titulo="Textos" bajada="Vacío usa lo del evento. Se completa sólo lo que tiene que decir otra cosa.">
          <CampoTexto label="Título del certificado" valor={c.titulo} onChange={(v) => setCert("titulo", v)} max={LIMITES.certTitulo} placeholder="Certificado de asistencia" />
          <CampoTexto
            label="Nombre del curso"
            valor={c.tituloCurso}
            onChange={(v) => setCert("tituloCurso", v)}
            max={LIMITES.certCurso}
            placeholder={f.titulo || "El título del evento"}
            pista="Vacío: el título del evento. Arriba del curso va sola la etiqueta con el tipo y la modalidad."
          />
          <CampoTexto
            label="Fecha"
            valor={c.fechaTexto}
            onChange={(v) => setCert("fechaTexto", v)}
            max={LIMITES.certFecha}
            placeholder={fechaLarga(f.inicio) || "22 de octubre de 2026"}
            pista="Para los de varios días: “6, 13 y 20 de octubre de 2026”."
          />
          <Campo
            label="Carga horaria"
            pista="La de todos. A una persona puntual se le cambian en la pestaña Asistentes."
          >
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0.5}
                max={HORAS_MAX}
                step={0.5}
                value={c.horas}
                onChange={(e) => setCert("horas", Math.max(0.5, Number(e.target.value) || 0.5))}
                className="w-28 font-mono"
              />
              <span className="text-[12px] text-ink-muted">horas</span>
              {duracion && duracion !== c.horas && (
                <Button type="button" variant="outline" size="xs" onClick={() => setCert("horas", duracion)}>
                  <Clock />
                  Usar la duración del evento ({horasTexto(duracion)})
                </Button>
              )}
            </div>
          </Campo>
        </Seccion>

        {c.mostrarContenidos && (
        <Seccion
          num="03"
          titulo="Contenidos impartidos"
          bajada={`Hasta ${LIMITES.contenidos}, cortos. Es la columna de la derecha del certificado.`}
          accion={
            c.contenidos.length < LIMITES.contenidos ? (
              <Button type="button" variant="outline" size="xs" onClick={() => setCert("contenidos", [...c.contenidos, ""])}>
                <Plus />
                Agregar
              </Button>
            ) : undefined
          }
        >
          {c.contenidos.length === 0 ? (
            <p className="text-[12px] text-ink-muted">Sin contenidos, el certificado ocupa todo el ancho con el nombre.</p>
          ) : (
            <div className="space-y-2">
              {c.contenidos.map((item, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 font-mono text-[10.5px] text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
                  <Input
                    value={item}
                    maxLength={LIMITES.contenido}
                    placeholder="Copilot en Outlook: resúmenes y respuestas"
                    onChange={(e) => setCert("contenidos", c.contenidos.map((x, j) => (j === i ? e.target.value : x)))}
                    autoFocus={item === "" && i === c.contenidos.length - 1}
                  />
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => moverContenido(i, -1)} disabled={i === 0} title="Subir">
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => moverContenido(i, 1)} disabled={i === c.contenidos.length - 1} title="Bajar">
                    <ArrowDown />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setCert("contenidos", c.contenidos.filter((_, j) => j !== i))} title="Quitar">
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Seccion>
        )}

        <Seccion
          num="04"
          titulo="Tecnologías revisadas"
          bajada={
            propias
              ? c.marcaIds.length === 0
                ? "Este certificado no muestra tecnologías."
                : "Este certificado usa sus propios logos. Van en blanco, debajo del texto."
              : "Usa las del evento. Sacá o agregá logos acá para que el certificado muestre otras, o ninguna."
          }
          accion={
            propias ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  setCert("marcasPropias", false)
                  setCert("marcaIds", [])
                }}
              >
                Volver a las del evento
              </Button>
            ) : undefined
          }
        >
          <MarcasSelector
            marcas={marcas}
            seleccion={marcasDelCertificado(c, f.marcaIds)}
            onChange={(ids) => {
              setCert("marcasPropias", true)
              setCert("marcaIds", ids)
            }}
            onMarcaCreada={(m) => setMarcas((prev) => [...prev, m].sort((a, b) => a.nombre.localeCompare(b.nombre)))}
            onMarcaBorrada={(idBorrada) => setMarcas((prev) => prev.filter((m) => m.id !== idBorrada))}
          />
        </Seccion>

        <Seccion
          num="05"
          titulo="Firmas"
          bajada="Hasta dos. La imagen de la firma va arriba de la línea: una foto o un escaneo sirve, se le quita el fondo y se pasa a blanco."
          accion={
            c.firmantes.length < LIMITES.firmantes ? (
              <Button type="button" variant="outline" size="xs" onClick={() => setCert("firmantes", [...c.firmantes, { ...FIRMANTE_VACIO }])}>
                <Plus />
                Agregar
              </Button>
            ) : undefined
          }
        >
          {c.firmantes.length === 0 && <p className="text-[12px] text-ink-muted">Sin firmas: queda sólo el sello.</p>}
          {c.firmantes.map((fi, i) => (
            <FirmanteFila
              key={i}
              firmante={fi}
              onChange={(nuevo) => setCert("firmantes", c.firmantes.map((x, j) => (j === i ? nuevo : x)))}
              onQuitar={() => setCert("firmantes", c.firmantes.filter((_, j) => j !== i))}
            />
          ))}
        </Seccion>
      </div>

      <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <div className="rounded-xl border border-line bg-surface-subtle p-4 shadow-e1">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-medium text-ink-secondary">Vista previa · A4 apaisado</p>
            <div className="flex items-center gap-2">
              <select
                value={muestraId}
                onChange={(e) => setMuestraId(e.target.value)}
                className="h-8 max-w-56 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink"
              >
                <option value="ejemplo">Nombre de ejemplo</option>
                {asistentes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
              {eventoId && (
                <Button variant="outline" size="sm" asChild disabled={sucio}>
                  <Link
                    href={`/marketing/eventos/${eventoId}/certificados?muestra=1`}
                    target="_blank"
                    aria-disabled={sucio}
                    onClick={(e) => {
                      if (sucio) {
                        e.preventDefault()
                        toast.info("Guardá los cambios antes de imprimir: se imprime lo guardado.")
                      }
                    }}
                  >
                    <Printer />
                    Imprimir muestra
                  </Link>
                </Button>
              )}
            </div>
          </div>
          <CertificadoEscalado
            evento={{ titulo: f.titulo, tipo: f.tipo, modalidad: f.modalidad, inicio: f.inicio, lugar: f.lugar }}
            config={c}
            marcas={marcasDe(marcasDelCertificado(c, f.marcaIds))}
            asistente={muestra}
          />
        </div>
        {barra}
      </div>
    </div>
  )
}

/* ── Vista del sitio ──────────────────────────────────────────────────────── */

/**
 * Cómo se ve la card en accedra.com.ar. No es el componente del sitio —ese vive
 * en el otro repo—, pero usa sus colores, radios y jerarquía, que es lo que
 * hace falta para decidir si el título es largo o si la portada funciona.
 */
function VistaSitio({ f, portadaUrl, marcas }: { f: BorradorEvento; portadaUrl: string | null; marcas: Marca[] }) {
  const d = f.inicio ? new Date(f.inicio) : null
  return (
    <div className="rounded-xl border border-line bg-surface-subtle p-4 shadow-e1">
      <p className="mb-3 text-[12px] font-medium text-ink-secondary">Así se ve en el sitio</p>
      <div className="rounded-2xl bg-[#0A1424] p-5">
        <article
          className="overflow-hidden rounded-[22px] border border-white/[0.12]"
          style={{
            background: "linear-gradient(180deg, #1B2D49 0%, #13223A 50%, #0C1826 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 26px 66px rgba(0,0,0,0.55)",
          }}
        >
          <div
            className="relative aspect-[16/9] overflow-hidden"
            style={{ background: "linear-gradient(128deg, #0B2466 0%, #1640A0 45%, #2F79E0 100%)" }}
          >
            {portadaUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={portadaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0C1826]/80 via-transparent to-transparent" />
            <span className="absolute left-4 top-4 rounded-full border border-white/15 bg-[#0A1220]/70 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-[#DCE9FB]">
              {TIPO_LABEL[f.tipo]} · {MODALIDAD_LABEL[f.modalidad]}
            </span>
            {d && (
              <div className="absolute bottom-4 left-4 rounded-xl bg-white px-3 py-2 text-center leading-none text-[#0A1424] shadow-lg">
                <div className="text-[20px] font-bold tabular-nums">{d.toLocaleDateString("es-AR", { day: "2-digit" })}</div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#2560BC]">
                  {d.toLocaleDateString("es-AR", { month: "short" }).replace(".", "")}
                </div>
              </div>
            )}
          </div>
          <div className="p-5">
            {f.categorias.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {f.categorias.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium text-[#E3ECF9]"
                    style={{ background: `${CATEGORIA_COLOR[cat]}24`, border: `1px solid ${CATEGORIA_COLOR[cat]}55` }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: CATEGORIA_COLOR[cat] }} />
                    {CATEGORIA_LABEL[cat]}
                  </span>
                ))}
              </div>
            )}
            <h3 className="text-[18px] font-bold leading-snug text-white">{f.titulo || "El título del evento va acá"}</h3>
            {f.resumen && <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-[#9FB0C7]">{f.resumen}</p>}
            <div className="mt-4 space-y-1.5 text-[12px] text-[#C9D6E8]">
              {f.inicio && (
                <p className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-[#7FB3F8]" />
                  {fechaCorta(f.inicio)}
                </p>
              )}
              {f.lugar && (
                <p className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-[#7FB3F8]" />
                  {f.lugar}
                </p>
              )}
            </div>
            {f.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {f.tags.map((t) => (
                  <span key={t} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-[#C9D6E8]">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {marcas.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
                {marcas.map((m) => (
                  <div key={m.id} className="grid h-9 min-w-12 place-items-center rounded-lg bg-white px-3 shadow-[0_8px_20px_rgba(0,0,0,0.3)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.logoUrl} alt={m.nombre} className="max-h-5 max-w-20 object-contain" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>
      </div>
    </div>
  )
}

/* ── Barra de guardar ─────────────────────────────────────────────────────── */

function BarraGuardar({
  sucio,
  guardando,
  error,
  nuevo,
  publicado,
  onPublicado,
  onGuardar,
  slug,
}: {
  sucio: boolean
  guardando: boolean
  error: string | null
  nuevo: boolean
  publicado: boolean
  onPublicado: (v: boolean) => void
  onGuardar: () => void
  slug: string
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-e1">
      <Interruptor
        label="Publicado en el sitio"
        pista={publicado ? "Al guardar aparece en la sección de eventos de accedra.com.ar." : "Se guarda como borrador: no se ve en el sitio."}
        valor={publicado}
        onChange={onPublicado}
      />
      {error && (
        <p className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">{error}</p>
      )}
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="min-w-0 text-[11.5px] text-ink-muted">
          {sucio ? (
            <span className="text-warning">Cambios sin guardar</span>
          ) : slug && publicado ? (
            <a href={`https://www.accedra.com.ar/eventos?evento=${slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink">
              Ver en el sitio <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            !nuevo && "Todo guardado"
          )}
        </div>
        <Button type="button" onClick={onGuardar} disabled={guardando || (!sucio && !nuevo)}>
          {guardando && <Loader2 className="animate-spin" />}
          {nuevo ? "Crear evento" : "Guardar cambios"}
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
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-[11.5px] font-medium text-brand-700">
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
          placeholder={valor.length ? "" : "IA, Microsoft 365…"}
          className={cn("h-6 min-w-24 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-ink-faint")}
        />
      )}
    </div>
  )
}
