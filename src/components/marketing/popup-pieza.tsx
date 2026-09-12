"use client"

import type React from "react"
import { useState } from "react"

/**
 * EL POPUP DEL SITIO — la pieza visual. Todo lo demás vive afuera.
 *
 * ⚠️  ARCHIVO ESPEJADO. Existe igual en los dos repos:
 *       accedra/components/popup/PopupPieza.tsx        (lo que ve el visitante)
 *       stockAdmin/src/components/marketing/popup-pieza.tsx  (la vista previa)
 *     Si se toca uno, se toca el otro. Es la única forma de que lo que se ve al
 *     cargarlo en el backoffice sea de verdad lo que se publica: una vista
 *     previa "parecida" es peor que no tener ninguna, porque se aprueba mirando
 *     algo que no es.
 *
 * Por eso mismo el archivo no importa NADA fuera de React: ni tokens de diseño,
 * ni utilidades, ni tracking, ni iconos. Colores y medidas van explícitos. Cada
 * repo tiene su propio sistema visual y el popup no pertenece a ninguno de los
 * dos: pertenece al sitio.
 *
 * ── POR QUE CONSULTAS DE CONTENEDOR Y NO BREAKPOINTS ──────────────────────────
 *
 * Todo el layout responde a `@container`, no a `sm:`/`lg:`. En el sitio da lo
 * mismo —el contenedor ocupa la ventana entera—, pero en el backoffice permite
 * meter la pieza dentro de un marco de 390 px y que se dibuje EXACTAMENTE como
 * en un celular, sin achicar la ventana del navegador.
 *
 * ── LOS LIMITES DE TEXTO NO SE DEFIENDEN ACA ─────────────────────────────────
 *
 * El título entra en dos renglones y la bajada en tres porque el formulario no
 * deja escribir más (LIMITES en lib/marketing/popups.ts, y los `check` de la
 * migración abajo de eso). Igual hay `line-clamp` como última red: si alguien
 * carga un texto largo por SQL, el popup se recorta feo pero no se rompe.
 */

export type PiezaPopup = {
  formato: "modal" | "barra"

  etiqueta: string
  titulo: string
  descripcion: string

  /** Siempre arriba del texto. No hay otra posición: ver la migración de mail. */
  imagenUrl: string | null
  imagenAlt: string

  /** `mail` pide la dirección adentro del popup; `enlace` manda a otra página. */
  accion: "mail" | "enlace"
  /** El texto del botón: el de enviar en `mail`, el de ir en `enlace`. */
  ctaTexto: string
  ctaUrl: string
  ctaNuevaPestana: boolean
  /** Lo que se muestra en lugar del formulario cuando el mail ya se envió. */
  mailGracias: string

  cerrarTexto: string
}

type Props = {
  popup: PiezaPopup
  /** `fixed` en el sitio; `absolute` dentro del marco de la vista previa. */
  posicion?: "fixed" | "absolute"
  /** Sin interacción: la vista previa no navega, no envía y no cierra nada. */
  estatico?: boolean
  onCerrar?: () => void
  onCta?: () => void
  /** Quien sabe guardar el mail. Sin esto el formulario se dibuja pero no envía
   *  —que es justo lo que necesita la vista previa—. */
  onEnviarMail?: (email: string) => Promise<{ ok: boolean; error?: string }>
  /** Marca de estado para las transiciones, que viven en el CSS global del
   *  sitio. En la vista previa no se pasa y la pieza se dibuja quieta. */
  animacion?: "entrando" | "saliendo"
}

/* ── Paleta ───────────────────────────────────────────────────────────────── */

/** Los mismos valores que `@theme` en el sitio, escritos a mano por lo que dice
 *  el encabezado: la pieza no puede depender del sistema visual de ninguno de
 *  los dos repos. */
const NAVY = "#0a1424"
const NAVY_PROFUNDO = "#07101d"
const ACENTO = "#2b6fd4"
const ACENTO_CLARO = "#7fb3f8"

/** El velo. Un negro azulado, no un gris: sobre el navy del sitio un velo
 *  neutro se ve sucio. El blur es lo que separa "hay un modal" de "la página
 *  tiene algo encima". */
const VELO = "rgba(4, 9, 17, 0.72)"

/**
 * Validación de mail del lado del navegador.
 *
 * A propósito laxa: acá no se decide si la dirección existe —eso no se puede
 * saber sin mandarle algo—, sólo se ataja el error de tipeo obvio para no
 * hacerle esperar un viaje al servidor. La regla que vale es la del endpoint.
 */
const MAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

/* ── Piezas chicas ────────────────────────────────────────────────────────── */

/**
 * El brillo de arriba a la izquierda. Es lo que hace que la card se lea como
 * una superficie iluminada y no como un rectángulo azul oscuro.
 */
function Resplandor() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background: `radial-gradient(120% 80% at 0% 0%, rgba(43,111,212,0.28) 0%, rgba(43,111,212,0) 58%)`,
      }}
    />
  )
}

/** La línea de luz del borde superior: un píxel que sugiere el canto de un
 *  objeto físico. Sin esto la card flota sin volumen. */
function Canto() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-px"
      style={{
        background:
          "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0) 100%)",
      }}
    />
  )
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em]"
      style={{
        color: ACENTO_CLARO,
        background: "rgba(43,111,212,0.16)",
        border: "1px solid rgba(127,179,248,0.22)",
      }}
    >
      {children}
    </span>
  )
}

function Cerrar({ onCerrar, estatico }: { onCerrar?: () => void; estatico?: boolean }) {
  return (
    <button
      type="button"
      onClick={onCerrar}
      tabIndex={estatico ? -1 : undefined}
      aria-label="Cerrar"
      className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full text-white/70 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      style={{
        background: "rgba(10,20,36,0.55)",
        border: "1px solid rgba(255,255,255,0.14)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      {/* La X a mano y no un icono importado: así la pieza es idéntica en los
          dos repos aunque tengan versiones distintas de lucide. */}
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
        <path d="M3.5 3.5l8 8m0-8l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  )
}

/**
 * La imagen, siempre recortada.
 *
 * `object-cover` sobre un contenedor de proporción fija es lo que sostiene la
 * promesa de "siempre queda bien": la imagen se adapta al hueco en vez de que
 * el hueco se adapte a la imagen. Una foto apaisada, una cuadrada y una
 * vertical dan las tres el mismo layout. El precio es que un texto quemado en
 * los bordes de la imagen se puede recortar — por eso el texto va en el popup,
 * no en la imagen.
 */
function Imagen({ url, alt, className }: { url: string; alt: string; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden ${className ?? ""}`}
      style={{ background: NAVY_PROFUNDO }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        // Vacío = decorativa. Es lo correcto cuando no se cargó una descripción:
        // peor que no describirla es que el lector de pantalla lea "imagen.webp".
        alt={alt}
        // `eager`, no `lazy`. Este nodo se monta cuando el popup YA se está
        // mostrando: diferir su carga es pedirle al navegador que retrase justo
        // lo único que hay que ver. Con `lazy` el modal abría con un rectángulo
        // negro arriba y la foto entraba un segundo después.
        loading="eager"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  )
}

/* ── La acción ────────────────────────────────────────────────────────────── */

const BOTON_BASE =
  "inline-flex h-12 items-center justify-center rounded-xl px-6 text-[14.5px] font-semibold text-white transition-[transform,box-shadow,filter] duration-150 hover:brightness-110 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-70"

const BOTON_ESTILO: React.CSSProperties = {
  background: `linear-gradient(180deg, #3d88ec 0%, ${ACENTO} 100%)`,
  border: "1px solid rgba(255,255,255,0.16)",
  boxShadow: "0 10px 26px rgba(43,111,212,0.38), inset 0 1px 0 0 rgba(255,255,255,0.22)",
}

function BotonDescartar({
  texto,
  onCerrar,
  estatico,
  className,
}: {
  texto: string
  onCerrar?: () => void
  estatico?: boolean
  className?: string
}) {
  if (!texto) return null
  return (
    <button
      type="button"
      onClick={onCerrar}
      tabIndex={estatico ? -1 : undefined}
      className={`inline-flex h-11 items-center justify-center rounded-xl px-4 text-[13.5px] font-medium text-white/55 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${className ?? ""}`}
    >
      <span className="truncate">{texto}</span>
    </button>
  )
}

/**
 * El formulario de una sola línea: la dirección de mail.
 *
 * ES UN CAMPO Y NO CINCO, Y ESO ES TODA LA IDEA
 *
 * El popup interrumpe. Lo único que se le puede pedir a alguien a quien
 * interrumpiste es un dato, y el que sirve para volver a hablarle es el mail.
 * Nombre, empresa y teléfono se preguntan después, cuando la conversación ya
 * arrancó — pedirlos acá convierte una respuesta de tres segundos en un
 * formulario, y un formulario dentro de un popup no lo completa nadie.
 *
 * El agradecimiento reemplaza al formulario en el mismo lugar en vez de cerrar
 * el popup: cerrarlo de golpe deja la duda de si se envió, y esa duda termina
 * en la persona mandando el mail otra vez o escribiendo por otro lado.
 */
function FormularioMail({
  popup,
  estatico,
  onEnviarMail,
  onEnviado,
  compacto,
}: {
  popup: PiezaPopup
  estatico?: boolean
  onEnviarMail?: (email: string) => Promise<{ ok: boolean; error?: string }>
  /** Para que el resto de la pieza sepa que el formulario ya no está. */
  onEnviado?: () => void
  /** En la barra el campo y el botón van uno al lado del otro. */
  compacto?: boolean
}) {
  const [email, setEmail] = useState("")
  const [estado, setEstado] = useState<"escribiendo" | "enviando" | "listo">("escribiendo")
  const [error, setError] = useState<string | null>(null)

  if (estado === "listo") {
    return (
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full"
          style={{ background: "rgba(43,111,212,0.22)", border: `1px solid ${ACENTO_CLARO}55` }}
          aria-hidden
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6.2l2.3 2.3L9.5 3.8"
              stroke={ACENTO_CLARO}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        {/* aria-live: quien usa lector de pantalla no ve que el formulario se
            reemplazó por un mensaje; hay que anunciárselo. */}
        <p className="text-[14px] leading-relaxed text-white/80" role="status" aria-live="polite">
          {popup.mailGracias || "¡Listo! Te escribimos a esa dirección."}
        </p>
      </div>
    )
  }

  const enviando = estado === "enviando"

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (estatico || !onEnviarMail || enviando) return

    const limpio = email.trim()
    if (!MAIL_RE.test(limpio)) {
      setError("Revisá la dirección: parece que falta algo.")
      return
    }

    setEstado("enviando")
    setError(null)

    const r = await onEnviarMail(limpio)
    if (r.ok) {
      setEstado("listo")
      onEnviado?.()
      return
    }
    setEstado("escribiendo")
    setError(r.error ?? "No se pudo enviar. Probá de nuevo en un momento.")
  }

  return (
    // `noValidate`: los globos de validación del navegador aparecen fuera del
    // popup, con la tipografía del sistema y en el idioma del navegador. El
    // mensaje propio queda adentro de la pieza y se lee.
    <form onSubmit={enviar} noValidate className={compacto ? "flex flex-col gap-2" : "space-y-2.5"}>
      <div className={compacto ? "flex items-center gap-2" : "space-y-2.5"}>
        <input
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          placeholder="tu@empresa.com"
          aria-label="Tu dirección de mail"
          value={email}
          maxLength={254}
          disabled={enviando}
          tabIndex={estatico ? -1 : undefined}
          onChange={(e) => {
            setEmail(e.target.value)
            if (error) setError(null)
          }}
          className={`h-12 w-full rounded-xl px-4 text-[14.5px] text-white outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-white/35 ${
            compacto ? "min-w-0 flex-1 @3xl:w-[240px] @3xl:flex-none" : ""
          }`}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: `1px solid ${error ? "rgba(248,113,113,0.55)" : "rgba(255,255,255,0.16)"}`,
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.25)",
          }}
        />

        <button
          type="submit"
          disabled={enviando}
          tabIndex={estatico ? -1 : undefined}
          className={`${BOTON_BASE} ${compacto ? "shrink-0" : "w-full"}`}
          style={BOTON_ESTILO}
        >
          <span className="truncate">
            {enviando ? "Enviando…" : popup.ctaTexto || "Quiero recibirlo"}
          </span>
        </button>
      </div>

      {error && (
        <p className="text-[12.5px] leading-snug text-[#fca5a5]" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

/** El camino B: el botón que lleva a otra página. */
function BotonEnlace({
  popup,
  estatico,
  onCta,
  compacto,
}: {
  popup: PiezaPopup
  estatico?: boolean
  onCta?: () => void
  compacto?: boolean
}) {
  if (!popup.ctaTexto) return null

  return (
    <a
      href={estatico ? undefined : popup.ctaUrl || "#"}
      target={popup.ctaNuevaPestana ? "_blank" : undefined}
      rel={popup.ctaNuevaPestana ? "noopener noreferrer" : undefined}
      onClick={onCta}
      tabIndex={estatico ? -1 : undefined}
      className={`${BOTON_BASE} ${compacto ? "shrink-0" : "w-full"}`}
      style={BOTON_ESTILO}
    >
      <span className="truncate">{popup.ctaTexto}</span>
    </a>
  )
}

function Accion(props: {
  popup: PiezaPopup
  estatico?: boolean
  onCta?: () => void
  onEnviarMail?: (email: string) => Promise<{ ok: boolean; error?: string }>
  onEnviado?: () => void
  compacto?: boolean
}) {
  return props.popup.accion === "enlace" ? (
    <BotonEnlace {...props} />
  ) : (
    <FormularioMail {...props} />
  )
}

/* ── El texto ─────────────────────────────────────────────────────────────── */

function Texto({ popup, tamano }: { popup: PiezaPopup; tamano: "grande" | "chico" }) {
  const grande = tamano === "grande"

  return (
    <>
      {popup.etiqueta ? (
        <div className={grande ? "mb-4" : "mb-1.5"}>
          <Etiqueta>{popup.etiqueta}</Etiqueta>
        </div>
      ) : null}

      <h2
        className={
          grande
            ? "text-balance text-[23px] font-semibold leading-[1.14] tracking-[-0.02em] text-white @3xl:text-[26px]"
            : "text-[16px] font-semibold leading-[1.25] tracking-[-0.01em] text-white @3xl:text-[17px]"
        }
        style={{ fontFamily: "var(--font-display, inherit)" }}
      >
        <span className="line-clamp-3">{popup.titulo}</span>
      </h2>

      {popup.descripcion ? (
        <p
          className={
            grande
              ? "mt-3 text-pretty text-[14.5px] leading-[1.62] text-white/65"
              : "mt-1 text-[13.5px] leading-[1.5] text-white/60"
          }
        >
          <span className={grande ? "line-clamp-4" : "line-clamp-2"}>{popup.descripcion}</span>
        </p>
      ) : null}
    </>
  )
}

/* ── El modal ─────────────────────────────────────────────────────────────── */

/**
 * En escritorio es una card centrada; en celular es una hoja pegada al borde de
 * abajo.
 *
 * No es un capricho de moda: el pulgar llega al campo y al botón sin reacomodar
 * la mano, y la hoja que sube desde abajo se lee como "algo que apareció" en vez
 * de "algo que estaba tapado". El alto máximo con scroll interno evita el peor
 * caso conocido —popup más alto que la pantalla, con el botón fuera de alcance
 * y sin forma de cerrarlo—.
 *
 * La imagen va arriba y ocupa el ancho completo. Es la única disposición: ver
 * el porqué en la migración 20260910_01_popups_mail.sql.
 */
function Modal({
  popup,
  estatico,
  onCerrar,
  onCta,
  onEnviarMail,
}: Omit<Props, "posicion" | "animacion">) {
  /** Con el mail ya enviado, el botón de descarte deja de ser "Ahora no" —ya
   *  dijo que sí— y pasa a ser la salida. Sin esto, quien acaba de dejar su
   *  dirección se queda mirando un botón que le pregunta si quiere. */
  const [enviado, setEnviado] = useState(false)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={popup.titulo}
      /**
       * NADA se enfoca solo cuando el popup aparece.
       *
       * Acá había un `focus()` sobre la card, por accesibilidad de teclado. Se
       * sacó a pedido: el navegador dibujaba el anillo de foco apenas entraba y
       * la pieza se veía "seleccionada" en el único segundo que importa. El
       * campo de mail tampoco lo toma: quien quiera escribir lo clickea, y
       * quien navegue con teclado llega tabulando.
       */
      className="popup-card relative w-full overflow-hidden rounded-t-[26px] shadow-[0_30px_80px_rgba(0,0,0,0.5)] @3xl:max-w-[460px] @3xl:rounded-[28px]"
      style={{
        background: NAVY,
        border: "1px solid rgba(255,255,255,0.1)",
        // En celular la hoja termina en el borde de la pantalla, y ahí abajo
        // está la barra de gestos del sistema. Sin esto, el último botón queda
        // debajo de ella. En escritorio la variable vale 0 y no hace nada.
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <Canto />
      <Cerrar onCerrar={onCerrar} estatico={estatico} />

      {popup.imagenUrl ? (
        <Imagen url={popup.imagenUrl} alt={popup.imagenAlt} className="aspect-[16/9] w-full" />
      ) : null}

      <div className="relative p-6 @3xl:p-7">
        <Resplandor />
        <div className="relative">
          <Texto popup={popup} tamano="grande" />

          <div className="mt-6">
            <Accion
              popup={popup}
              estatico={estatico}
              onCta={onCta}
              onEnviarMail={onEnviarMail}
              onEnviado={() => setEnviado(true)}
            />
          </div>

          {enviado || popup.cerrarTexto ? (
            <div className="mt-1 flex justify-center">
              <BotonDescartar
                texto={enviado ? "Cerrar" : popup.cerrarTexto}
                onCerrar={onCerrar}
                estatico={estatico}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* ── La barra ─────────────────────────────────────────────────────────────── */

/**
 * Avisa sin tapar. No lleva velo ni bloquea el scroll a propósito: la persona
 * sigue leyendo la página y decide cuándo mirarla.
 */
function Barra({
  popup,
  estatico,
  onCerrar,
  onCta,
  onEnviarMail,
}: Omit<Props, "posicion" | "animacion">) {
  return (
    <div
      role="region"
      aria-label={popup.titulo}
      className="popup-card relative mx-auto flex w-full max-w-[1120px] flex-col gap-4 overflow-hidden rounded-2xl p-4 pr-12 shadow-[0_18px_50px_rgba(0,0,0,0.45)] @3xl:flex-row @3xl:items-center @3xl:gap-5 @3xl:py-3.5 @3xl:pl-4 @3xl:pr-14"
      style={{
        background: "rgba(10,20,36,0.92)",
        border: "1px solid rgba(255,255,255,0.12)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <Canto />
      <Resplandor />
      <Cerrar onCerrar={onCerrar} estatico={estatico} />

      {/* La miniatura va AL LADO del texto también en celular, no encima.
          `@3xl:contents` disuelve este envoltorio en escritorio y deja a los dos
          como hijos directos de la fila. Apilada, la miniatura se comía un
          renglón entero de una pieza cuya única virtud es ocupar poco. */}
      <div className="relative flex min-w-0 flex-1 items-center gap-3 @3xl:contents">
        {popup.imagenUrl ? (
          <Imagen
            url={popup.imagenUrl}
            alt={popup.imagenAlt}
            className="relative h-12 w-12 shrink-0 rounded-xl @3xl:h-14 @3xl:w-14"
          />
        ) : null}

        <div className="relative min-w-0 flex-1">
          <Texto popup={popup} tamano="chico" />
        </div>
      </div>

      <div className="relative shrink-0">
        <Accion
          popup={popup}
          estatico={estatico}
          onCta={onCta}
          onEnviarMail={onEnviarMail}
          compacto
        />
      </div>
    </div>
  )
}

/* ── La pieza ─────────────────────────────────────────────────────────────── */

export function PopupPieza({
  popup,
  posicion = "fixed",
  estatico = false,
  onCerrar,
  onCta,
  onEnviarMail,
  animacion,
}: Props) {
  const esBarra = popup.formato === "barra"

  return (
    <div
      className={`popup-raiz @container ${posicion} inset-0 z-[120] ${esBarra ? "flex items-end" : ""}`}
      data-estado={animacion ?? "quieto"}
      // La barra no tapa la página: sin esto, su contenedor a pantalla completa
      // se comería todos los clics del sitio.
      style={esBarra ? { pointerEvents: "none" } : undefined}
    >
      {esBarra ? (
        <div className="w-full p-3 @3xl:p-4" style={{ pointerEvents: "auto" }}>
          <Barra popup={popup} estatico={estatico} onCerrar={onCerrar} onCta={onCta} onEnviarMail={onEnviarMail} />
        </div>
      ) : (
        <>
          {/* Clickear afuera cierra. Es lo que la gente intenta primero, y no
              tenerlo hace que el popup se sienta una trampa. */}
          <div
            className="popup-velo absolute inset-0"
            onClick={estatico ? undefined : onCerrar}
            style={{
              background: VELO,
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          />
          <div className="absolute inset-0 flex items-end justify-center overflow-y-auto @3xl:items-center @3xl:p-6">
            <div className="max-h-full w-full @3xl:w-auto @3xl:max-w-full">
              <Modal
                popup={popup}
                estatico={estatico}
                onCerrar={onCerrar}
                onCta={onCta}
                onEnviarMail={onEnviarMail}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
