"use client"

import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react"

import { PopupPreview, type Dispositivo } from "@/components/marketing/popup-preview"
import type { PiezaPopup } from "@/components/marketing/popup-pieza"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  ACCIONES,
  ACCION_LABEL,
  ACCION_PISTA,
  ALCANCES,
  ALCANCE_LABEL,
  AVISO_DESDE,
  BORRADOR_VACIO,
  FORMATOS,
  FORMATO_LABEL,
  FORMATO_PISTA,
  FRECUENCIAS,
  FRECUENCIA_LABEL,
  FRECUENCIA_PISTA,
  LIMITES,
  aInputLocal,
  deInputLocal,
  faltantesDe,
  problemaDeImagen,
  type BorradorPopup,
  type Popup,
} from "@/lib/marketing/popups"
import { cn } from "@/lib/utils"

/**
 * Cargar un popup: el formulario a la izquierda y lo que se publica a la derecha.
 *
 * LA VISTA PREVIA NO ES UN ADORNO
 *
 * Es la mitad de la pantalla porque es la única forma de que alguien que no
 * diseña pueda decidir si el aviso está bien. Escribiendo a ciegas, el título
 * queda largo, la etiqueta repite el título y la imagen se recorta justo en la
 * cara de alguien — y eso se descubre en producción.
 *
 * TODO CAMPO CON TOPE MUESTRA EL TOPE
 *
 * El contador no aparece cuando ya te pasaste: aparece siempre, y se pone
 * naranja cerca del final. La diferencia importa. Un límite que aparece recién
 * al chocarlo se vive como un error del sistema; uno visible desde el principio
 * se vive como el ancho de la pieza, que es lo que es.
 */
export function PopupEditor({
  popup,
  onCancelar,
  onGuardado,
}: {
  /** `null` = alta. Con popup = edición. */
  popup: Popup | null
  onCancelar: () => void
  onGuardado: (p: Popup, esNuevo: boolean) => void
}) {
  const editando = popup !== null

  const [f, setF] = useState<BorradorPopup>(() =>
    popup ? borradorDe(popup) : BORRADOR_VACIO
  )
  const [archivo, setArchivo] = useState<File | null>(null)
  const [quitarImagen, setQuitarImagen] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dispositivo, setDispositivo] = useState<Dispositivo>("escritorio")

  const inputArchivo = useRef<HTMLInputElement>(null)

  /** La imagen recién elegida, para verla antes de subirla. Se libera al
   *  cambiarla: cada `createObjectURL` que no se revoca es memoria retenida
   *  hasta que se recarga la pantalla. */
  const [vistaArchivo, setVistaArchivo] = useState<string | null>(null)
  useEffect(() => {
    if (!archivo) {
      setVistaArchivo(null)
      return
    }
    const url = URL.createObjectURL(archivo)
    setVistaArchivo(url)
    return () => URL.revokeObjectURL(url)
  }, [archivo])

  const imagenUrl = vistaArchivo ?? (quitarImagen ? null : popup?.imagenUrl ?? null)

  const set = <K extends keyof BorradorPopup>(campo: K, valor: BorradorPopup[K]) =>
    setF((prev) => ({ ...prev, [campo]: valor }))

  /* ── Lo que ve la vista previa ─────────────────────────────────────────── */

  const pieza: PiezaPopup = useMemo(
    () => ({
      formato: f.formato,
      etiqueta: f.etiqueta,
      // Con el formulario vacío la vista previa mostraría una card sin nada y
      // parecería rota. El texto de relleno deja ver la forma desde el primer
      // segundo; se va apenas se escribe.
      titulo: f.titulo || "El título del aviso va acá",
      descripcion: f.descripcion,
      imagenUrl,
      imagenAlt: f.imagenAlt,
      accion: f.accion,
      ctaTexto: f.ctaTexto,
      ctaUrl: f.ctaUrl,
      ctaNuevaPestana: f.ctaNuevaPestana,
      mailGracias: f.mailGracias,
      cerrarTexto: f.cerrarTexto,
    }),
    [f, imagenUrl]
  )

  /* ── Imagen ────────────────────────────────────────────────────────────── */

  /** Se valida al elegirla y no al guardar: enterarse de que la foto pesa 20 MB
   *  después de completar el formulario es la peor versión de esto. */
  function elegirArchivo(nuevo: File | null) {
    if (!nuevo) return
    const problema = problemaDeImagen(nuevo)
    if (problema) {
      setError(problema)
      return
    }
    setError(null)
    setQuitarImagen(false)
    setArchivo(nuevo)
  }

  function sacarImagen() {
    setArchivo(null)
    setQuitarImagen(true)
    if (inputArchivo.current) inputArchivo.current.value = ""
  }

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
      // FormData y no JSON: la imagen viaja en el mismo pedido que los datos.
      // Ver el comentario del endpoint.
      const cuerpo = new FormData()
      cuerpo.set("nombre", f.nombre)
      cuerpo.set("activo", String(f.activo))
      cuerpo.set("formato", f.formato)
      cuerpo.set("etiqueta", f.etiqueta)
      cuerpo.set("titulo", f.titulo)
      cuerpo.set("descripcion", f.descripcion)
      cuerpo.set("imagen_alt", f.imagenAlt)
      cuerpo.set("accion", f.accion)
      cuerpo.set("cta_texto", f.ctaTexto)
      cuerpo.set("cta_url", f.ctaUrl)
      cuerpo.set("cta_nueva_pestana", String(f.ctaNuevaPestana))
      cuerpo.set("mail_gracias", f.mailGracias)
      cuerpo.set("cerrar_texto", f.cerrarTexto)
      cuerpo.set("desde", f.desde)
      cuerpo.set("hasta", f.hasta)
      cuerpo.set("demora_s", String(f.demoraS))
      cuerpo.set("frecuencia", f.frecuencia)
      cuerpo.set("alcance", f.alcance)
      cuerpo.set("rutas", f.rutas.join("\n"))
      if (archivo) cuerpo.set("imagen", archivo)
      if (quitarImagen && !archivo) cuerpo.set("quitar_imagen", "true")

      const url = editando ? `/api/marketing/popups/${popup.id}` : "/api/marketing/popups"
      const r = await fetch(url, { method: editando ? "PATCH" : "POST", body: cuerpo })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar")

      onGuardado(d.popup as Popup, !editando)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  const conImagen = imagenUrl !== null

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,540px)_minmax(0,1fr)]">
      {/* ── Formulario ─────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        <Seccion num="01" titulo="Qué es" bajada="El nombre es interno: sirve para encontrarlo en la lista dentro de seis meses.">
          <CampoTexto
            label="Nombre interno"
            valor={f.nombre}
            onChange={(v) => set("nombre", v)}
            max={LIMITES.nombre}
            placeholder="Webinar de firma biométrica — octubre"
            obligatorio
          />

          <Campo label="Formato" pista="Cuánta atención pide la pieza.">
            <div className="grid gap-2 sm:grid-cols-2">
              {FORMATOS.map((v) => (
                <Tarjeta
                  key={v}
                  activo={f.formato === v}
                  titulo={FORMATO_LABEL[v]}
                  pista={FORMATO_PISTA[v]}
                  onClick={() => set("formato", v)}
                />
              ))}
            </div>
          </Campo>
        </Seccion>

        <Seccion num="02" titulo="Qué dice" bajada="Los topes son los de la pieza: el título entra en dos renglones y la bajada en tres.">
          <CampoTexto
            label="Etiqueta"
            valor={f.etiqueta}
            onChange={(v) => set("etiqueta", v)}
            max={LIMITES.etiqueta}
            placeholder="Evento · 22 de octubre"
            pista="La volanta de arriba de todo. Opcional."
          />
          <CampoTexto
            label="Título"
            valor={f.titulo}
            onChange={(v) => set("titulo", v)}
            max={LIMITES.titulo}
            placeholder="Firma biométrica: qué cambia con la nueva ley"
            obligatorio
          />
          <CampoArea
            label="Bajada"
            valor={f.descripcion}
            onChange={(v) => set("descripcion", v)}
            max={LIMITES.descripcion}
            placeholder="Una hora, online y sin costo. Mostramos cómo se firma un contrato con validez legal de punta a punta."
            pista="Opcional. Si el título ya lo dice todo, dejala vacía."
          />

          {/* ── Imagen ── */}
          <Campo
            label="Imagen"
            pista="Se recorta para entrar en la pieza, así que el texto importante no puede estar en la foto."
          >
            <input
              ref={inputArchivo}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
            />

            {conImagen ? (
              <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-e1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagenUrl}
                  alt=""
                  className="h-16 w-24 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-ink">
                    {archivo ? archivo.name : "La imagen cargada"}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ink-muted">
                    {archivo
                      ? "Se sube al guardar. Se convierte a WebP y se achica a 1600 px."
                      : popup?.imagenAncho
                        ? `${popup.imagenAncho} × ${popup.imagenAlto} px`
                        : "Publicada"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => inputArchivo.current?.click()}
                >
                  <RefreshCw />
                  Cambiar
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={sacarImagen} title="Quitar la imagen">
                  <Trash2 />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputArchivo.current?.click()}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-subtle p-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-ink-muted shadow-e1">
                  <ImagePlus className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium text-ink">Subir una imagen</span>
                  <span className="mt-0.5 block text-[11.5px] text-ink-muted">
                    JPG, PNG, WebP o AVIF · mínimo 600 px de ancho · hasta 8 MB
                  </span>
                </span>
              </button>
            )}

            {conImagen && (
              <div className="mt-3">
                <CampoTexto
                  label="Descripción de la imagen"
                  valor={f.imagenAlt}
                  onChange={(v) => set("imagenAlt", v)}
                  max={LIMITES.imagenAlt}
                  placeholder="Dos personas firmando en una tablet"
                  pista="Para lectores de pantalla. Si la imagen es sólo decorativa, dejala vacía."
                />
              </div>
            )}
          </Campo>
        </Seccion>

        <Seccion
          num="03"
          titulo="Qué le pide al visitante"
          bajada="Pedir el mail aprovecha la interrupción donde ya está mirando; el botón lo manda a otra página y ahí se pierde la mitad."
        >
          <Campo label="Acción" pista={ACCION_PISTA[f.accion]}>
            <div className="grid gap-2 sm:grid-cols-2">
              {ACCIONES.map((v) => (
                <Tarjeta
                  key={v}
                  activo={f.accion === v}
                  titulo={ACCION_LABEL[v]}
                  pista={ACCION_PISTA[v]}
                  onClick={() => set("accion", v)}
                />
              ))}
            </div>
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto
              label="Texto del botón"
              valor={f.ctaTexto}
              onChange={(v) => set("ctaTexto", v)}
              max={LIMITES.ctaTexto}
              placeholder={f.accion === "mail" ? "Quiero recibirlo" : "Quiero inscribirme"}
              pista={
                f.accion === "mail"
                  ? "Opcional: sin esto dice “Quiero recibirlo”."
                  : undefined
              }
              obligatorio={f.accion === "enlace"}
            />
            <CampoTexto
              label="Texto para descartar"
              valor={f.cerrarTexto}
              onChange={(v) => set("cerrarTexto", v)}
              max={LIMITES.cerrarTexto}
              placeholder="Ahora no"
              pista="Opcional: la cruz de arriba siempre está."
            />
          </div>

          {f.accion === "mail" ? (
            <CampoTexto
              label="Mensaje de gracias"
              valor={f.mailGracias}
              onChange={(v) => set("mailGracias", v)}
              max={LIMITES.mailGracias}
              placeholder="¡Listo! Te mandamos el link de la charla a esa dirección."
              pista="Reemplaza al formulario una vez que dejó el mail. Sin esto se muestra uno genérico."
            />
          ) : (
            <>
              <CampoTexto
                label="Adónde lleva"
                valor={f.ctaUrl}
                onChange={(v) => set("ctaUrl", v)}
                max={LIMITES.ctaUrl}
                placeholder="https://... o /contacto"
                pista="Una dirección completa, o una ruta del sitio empezando con /."
                obligatorio
                mono
              />

              <Interruptor
                label="Abrir en una pestaña nueva"
                pista="Conviene cuando el destino es otro sitio: así no se pierde la visita."
                valor={f.ctaNuevaPestana}
                onChange={(v) => set("ctaNuevaPestana", v)}
              />
            </>
          )}

          {f.accion === "mail" && (
            <p className="rounded-lg border border-line bg-surface-subtle px-3 py-2 text-[11.5px] leading-relaxed text-ink-muted">
              Los mails caen en la tabla <span className="font-mono">leads</span>, con la campaña
              que trajo a esa persona. Es la misma bandeja que las consultas del formulario de
              contacto del sitio.
            </p>
          )}
        </Seccion>

        <Seccion num="04" titulo="Cuándo aparece" bajada="Con fecha de fin se apaga solo. Es lo que evita el aviso de un evento que ya pasó.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Empieza" pista="Vacío: apenas se prende.">
              <Input
                type="datetime-local"
                value={aInputLocal(f.desde)}
                onChange={(e) => set("desde", deInputLocal(e.target.value))}
              />
            </Campo>
            <Campo label="Termina" pista="Vacío: hasta que se apague a mano.">
              <Input
                type="datetime-local"
                value={aInputLocal(f.hasta)}
                onChange={(e) => set("hasta", deInputLocal(e.target.value))}
              />
            </Campo>
          </div>

          <Campo
            label="Demora"
            pista="Segundos desde que carga la página. En cero interrumpe antes de que la persona vea dónde entró."
          >
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={30}
                value={f.demoraS}
                onChange={(e) => set("demoraS", Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-sunken accent-primary"
              />
              <span className="w-16 shrink-0 text-right font-mono text-[12.5px] tabular-nums text-ink">
                {f.demoraS} s
              </span>
            </div>
          </Campo>

          <Campo label="Cada cuánto vuelve" pista={FRECUENCIA_PISTA[f.frecuencia]}>
            <Segmentado
              opciones={FRECUENCIAS.map((v) => ({ v, label: FRECUENCIA_LABEL[v] }))}
              valor={f.frecuencia}
              onChange={(v) => set("frecuencia", v)}
            />
          </Campo>
        </Seccion>

        <Seccion num="05" titulo="Dónde aparece" bajada="Un aviso de un evento de firma biométrica no tiene por qué salir en la página de redes.">
          <Segmentado
            opciones={ALCANCES.map((v) => ({ v, label: ALCANCE_LABEL[v] }))}
            valor={f.alcance}
            onChange={(v) => set("alcance", v)}
          />

          {f.alcance === "rutas" && (
            <Campo
              label="Páginas"
              pista={`Una por línea. Alcanza con la ruta ("/soluciones/firma-biometrica") y vale también para las que cuelgan de ella. Hasta ${LIMITES.rutas}.`}
            >
              <Textarea
                rows={4}
                value={f.rutas.join("\n")}
                onChange={(e) =>
                  set(
                    "rutas",
                    e.target.value.split("\n").map((l) => l.trimStart())
                  )
                }
                onBlur={(e) =>
                  set(
                    "rutas",
                    e.target.value
                      .split("\n")
                      .map((l) => l.trim())
                      .filter(Boolean)
                      .slice(0, LIMITES.rutas)
                  )
                }
                placeholder={"/soluciones/firma-biometrica\n/casos"}
                className="font-mono text-[12px]"
              />
            </Campo>
          )}
        </Seccion>
      </div>

      {/* ── Vista previa ───────────────────────────────────────────────────── */}
      <div className="xl:sticky xl:top-24 xl:self-start">
        <PopupPreview popup={pieza} dispositivo={dispositivo} onDispositivo={setDispositivo} />

        {/* Barra de acciones: va pegada a la vista previa y no arriba de todo
            porque lo último que se hace antes de guardar es mirar el resultado.
            El interruptor de publicar está acá, al lado del botón, para que
            nadie guarde creyendo que ya está en el sitio. */}
        <div className="mt-4 rounded-xl border border-line bg-surface p-4 shadow-e1">
          <Interruptor
            label="Publicado en el sitio"
            pista={
              f.activo
                ? "Al guardar queda al aire, dentro de las fechas que pusiste."
                : "Se guarda apagado. Podés prenderlo cuando quieras desde la lista."
            }
            valor={f.activo}
            onChange={(v) => set("activo", v)}
          />

          {error && (
            <p className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancelar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="button" onClick={guardar} disabled={guardando}>
              {guardando ? <Loader2 className="animate-spin" /> : null}
              {editando ? "Guardar cambios" : "Crear popup"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Andamiaje del formulario ─────────────────────────────────────────────── */

function borradorDe(p: Popup): BorradorPopup {
  return {
    nombre: p.nombre,
    activo: p.activo,
    formato: p.formato,
    etiqueta: p.etiqueta,
    titulo: p.titulo,
    descripcion: p.descripcion,
    imagenAlt: p.imagenAlt,
    accion: p.accion,
    ctaTexto: p.ctaTexto,
    ctaUrl: p.ctaUrl,
    ctaNuevaPestana: p.ctaNuevaPestana,
    mailGracias: p.mailGracias,
    cerrarTexto: p.cerrarTexto,
    desde: p.desde,
    hasta: p.hasta,
    demoraS: p.demoraS,
    frecuencia: p.frecuencia,
    alcance: p.alcance,
    rutas: p.rutas,
  }
}

function Seccion({
  num,
  titulo,
  bajada,
  children,
}: {
  num: string
  titulo: string
  bajada: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-e1">
      <div className="mb-4 border-b border-line pb-3">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[11px] tabular-nums text-ink-faint">{num}</span>
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{titulo}</h2>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{bajada}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Campo({
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

/**
 * El contador de caracteres.
 *
 * Gris hasta el 80% del tope y naranja después. No se pone rojo nunca: no es un
 * error —el campo no deja escribir de más—, es un aviso de que se está por
 * quedar sin lugar.
 */
function Contador({ largo, max }: { largo: number; max: number }) {
  const cerca = largo >= max * AVISO_DESDE
  return (
    <span
      className={cn(
        "font-mono text-[10.5px] tabular-nums transition-colors",
        cerca ? "text-warning" : "text-ink-faint"
      )}
    >
      {largo}/{max}
    </span>
  )
}

function CampoTexto({
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
    <Campo
      label={obligatorio ? `${label} *` : label}
      pista={pista}
      contador={<Contador largo={valor.length} max={max} />}
    >
      <Input
        value={valor}
        // `maxLength` y no un corte en el onChange: cortar mientras se escribe
        // hace que el cursor salte al final si alguien edita el medio del texto.
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={mono ? "font-mono text-[12px]" : undefined}
      />
    </Campo>
  )
}

function CampoArea({
  label,
  valor,
  onChange,
  max,
  placeholder,
  pista,
}: {
  label: string
  valor: string
  onChange: (v: string) => void
  max: number
  placeholder?: string
  pista?: string
}) {
  return (
    <Campo label={label} pista={pista} contador={<Contador largo={valor.length} max={max} />}>
      <Textarea
        rows={3}
        value={valor}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Campo>
  )
}

function Interruptor({
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

function Tarjeta({
  activo,
  titulo,
  pista,
  onClick,
}: {
  activo: boolean
  titulo: string
  pista: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3 text-left transition-colors duration-150",
        activo
          ? "border-brand-400 bg-brand-50 shadow-e1"
          : "border-line bg-surface hover:border-line-strong hover:bg-surface-subtle"
      )}
    >
      <p className={cn("text-[12.5px] font-semibold", activo ? "text-brand-700" : "text-ink")}>
        {titulo}
      </p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">{pista}</p>
    </button>
  )
}

function Segmentado<T extends string>({
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
