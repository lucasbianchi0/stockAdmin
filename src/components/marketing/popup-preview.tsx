"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { Inter, Space_Grotesk } from "next/font/google"
import { Monitor, Smartphone } from "lucide-react"

import { PopupPieza, type PiezaPopup } from "@/components/marketing/popup-pieza"
import { cn } from "@/lib/utils"

/**
 * La vista previa: el popup dibujado como se va a ver en accedra.com.ar.
 *
 * No es una aproximación. Adentro corre el MISMO componente que el sitio
 * (popup-pieza.tsx, espejado en los dos repos) sobre las mismas tipografías del
 * sitio, no sobre las del backoffice. Una vista previa "parecida" es peor que no
 * tener ninguna: se aprueba mirando algo que no es lo que se publica.
 *
 * ── COMO SE LOGRA QUE EL CELULAR SEA UN CELULAR ──────────────────────────────
 *
 * La pieza responde con consultas de contenedor, no con breakpoints de ventana.
 * Entonces alcanza con meterla en un marco de 390 px de ancho para que se dibuje
 * exactamente como en un celular —hoja pegada abajo, botón a lo ancho— sin
 * achicar la ventana del navegador.
 *
 * El marco de escritorio sí se escala: se dibuja a 1180 px de ancho reales y se
 * reduce con `transform` hasta que entra en el panel. El escalado es uniforme,
 * así que las proporciones son las verdaderas; lo único que no es real es el
 * tamaño en centímetros del texto. La alternativa —dibujarlo al ancho que haya—
 * mostraría el layout de celular en un panel de 600 px y haría aprobar el
 * diseño equivocado.
 */

/* Las tipografías del SITIO, no las del backoffice. Es lo que hace que el
   título se vea con el mismo peso y el mismo ancho de letra que va a tener
   publicado: Geist es más angosta y un título que acá entraba en dos renglones
   allá entraba en tres. */
const inter = Inter({ subsets: ["latin"], variable: "--pv-sans", display: "swap" })
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--pv-display", display: "swap" })

export type Dispositivo = "escritorio" | "celular"

/** Medidas reales del marco, en px. 1180 es un portátil típico; 390 es un
 *  iPhone de los últimos años, que es el piso con el que hay que quedar bien. */
const MARCO: Record<Dispositivo, { ancho: number; alto: number }> = {
  escritorio: { ancho: 1180, alto: 700 },
  celular: { ancho: 390, alto: 760 },
}

export function PopupPreview({
  popup,
  dispositivo,
  onDispositivo,
}: {
  popup: PiezaPopup
  dispositivo: Dispositivo
  onDispositivo: (d: Dispositivo) => void
}) {
  const contenedor = useRef<HTMLDivElement>(null)
  const [escala, setEscala] = useState(1)

  const { ancho, alto } = MARCO[dispositivo]

  /**
   * El marco entra por ancho Y por alto.
   *
   * Lo del ancho es obvio. Lo del alto no, y es lo que arruinaba el marco de
   * celular: 760 px de alto real no entran en la mitad de abajo de un portátil,
   * así que la vista previa quedaba cortada justo donde está el botón —lo único
   * que hay que mirar antes de publicar—. Se escala por el más chico de los dos
   * factores.
   *
   * El ancho se mide con ResizeObserver y no con el de la ventana: el panel
   * cambia de tamaño también cuando se pliega la barra lateral, y de eso un
   * listener de `resize` no se entera. El alto disponible sí sale de la ventana,
   * porque es la ventana la que lo limita.
   */
  useEffect(() => {
    const el = contenedor.current
    if (!el) return

    const medir = () => {
      // Lo que queda debajo del borde superior del marco, menos el aire para la
      // barra de acciones que va abajo.
      const disponible = window.innerHeight - el.getBoundingClientRect().top - 150
      setEscala(Math.min(1, el.clientWidth / ancho, Math.max(0.4, disponible) / alto))
    }
    medir()

    const ro = new ResizeObserver(medir)
    ro.observe(el)
    window.addEventListener("resize", medir)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", medir)
    }
  }, [ancho, alto])

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
          Así se ve en el sitio
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-muted p-0.5">
          <BotonDispositivo
            activo={dispositivo === "escritorio"}
            onClick={() => onDispositivo("escritorio")}
            icon={<Monitor className="h-3.5 w-3.5" />}
            label="Escritorio"
          />
          <BotonDispositivo
            activo={dispositivo === "celular"}
            onClick={() => onDispositivo("celular")}
            icon={<Smartphone className="h-3.5 w-3.5" />}
            label="Celular"
          />
        </div>
      </div>

      <div
        ref={contenedor}
        className="relative overflow-hidden rounded-xl border border-line bg-surface-sunken"
        // El alto lo fija el marco escalado: sin esto el contenedor conserva el
        // alto real (700 px) y deja un hueco enorme abajo cuando se reduce.
        style={{ height: alto * escala }}
      >
        <div
          className={cn("relative shrink-0 overflow-hidden", inter.variable, spaceGrotesk.variable)}
          style={{
            width: ancho,
            height: alto,
            transform: `scale(${escala})`,
            transformOrigin: "top left",
            // El marco escalado ocupa su tamaño real en el layout aunque se vea
            // chico; sacarlo del flujo evita que empuje al panel.
            position: "absolute",
            left: "50%",
            marginLeft: (-ancho * escala) / 2,
            fontFamily: "var(--pv-sans)",
            // La pieza busca `--font-display` para el título. Acá se la damos
            // apuntando a la fuente del sitio.
            ["--font-display" as string]: "var(--pv-display)",
            borderRadius: dispositivo === "celular" ? 28 : 0,
          }}
        >
          <PaginaFalsa dispositivo={dispositivo} />
          <PopupPieza popup={popup} posicion="absolute" estatico />
        </div>
      </div>
    </div>
  )
}

function BotonDispositivo({
  activo,
  onClick,
  icon,
  label,
}: {
  activo: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11.5px] font-medium transition-colors duration-150",
        activo
          ? "bg-surface text-ink shadow-e1"
          : "text-ink-muted hover:text-ink"
      )}
    >
      {icon}
      {label}
    </button>
  )
}

/**
 * El sitio de atrás, insinuado.
 *
 * Sirve para lo único que no se puede juzgar mirando el popup solo: cuánto tapa,
 * cuánto contrasta el velo, si la barra inferior queda encima de algo. Va en
 * grises muy bajos a propósito —es contexto, no contenido— para que nadie
 * confunda esto con una vista previa del sitio.
 */
function PaginaFalsa({ dispositivo }: { dispositivo: Dispositivo }) {
  const movil = dispositivo === "celular"

  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0a1424 0%, #07101d 100%)" }}
    >
      {/* El resplandor del hero */}
      <span
        className="absolute inset-x-0 top-0 h-1/2"
        style={{
          background:
            "radial-gradient(80% 100% at 30% 0%, rgba(43,111,212,0.20) 0%, rgba(43,111,212,0) 70%)",
        }}
      />

      {/* Barra de navegación */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-6 py-4">
        <div className="h-3 w-24 rounded-full bg-white/20" />
        {!movil && (
          <div className="flex gap-4">
            {[52, 44, 60, 38].map((w, i) => (
              <div key={i} className="h-2 rounded-full bg-white/10" style={{ width: w }} />
            ))}
          </div>
        )}
        {movil && <div className="h-3 w-5 rounded bg-white/15" />}
      </div>

      {/* Cuerpo */}
      <div className={cn("absolute inset-x-0", movil ? "top-24 px-6" : "top-40 px-16")}>
        <div className={cn("rounded bg-white/12", movil ? "h-5 w-[85%]" : "h-7 w-[46%]")} />
        <div className={cn("mt-3 rounded bg-white/12", movil ? "h-5 w-[62%]" : "h-7 w-[34%]")} />
        <div className="mt-6 space-y-2.5">
          {[92, 84, 70].map((w, i) => (
            <div
              key={i}
              className="h-2 rounded-full bg-white/[0.07]"
              style={{ width: `${movil ? w : w / 2}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
