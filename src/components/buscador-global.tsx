"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { CornerDownLeft, Search } from "lucide-react"

import { agrupar, buscar, type Destino } from "@/lib/buscador"
import { cn } from "@/lib/utils"
import type { Acceso } from "@/lib/permisos"

/**
 * BUSCADOR GLOBAL — llegar a una pantalla escribiendo su nombre.
 *
 * El menú tiene tres módulos, submenús plegables y una treintena de pantallas:
 * encontrar algo exige saber de antemano en qué grupo lo guardó otro. Acá se
 * escribe "mail" y aparece el pie de firma.
 *
 * Es un diálogo propio y no Radix ni cmdk: las ~18 ventanas del backoffice
 * están hechas a mano con este mismo idioma —capa fija, fondo navy con blur,
 * Escape por listener— y meter una librería sólo para esta rompería la unidad
 * y sumaría 20 kB al bundle de todas las páginas.
 */

/** ⌘K en Mac, Ctrl+K en el resto. */
export function useAtajoBusqueda(abrir: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return
      /* Si hay una ventana abierta encima, el atajo no corresponde: el buscador
         navegaría a otra pantalla y se perdería lo que se estaba cargando. */
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      e.preventDefault()
      abrir()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [abrir])
}

/**
 * Lo que se ve en el menú. Finge ser un campo de texto —el que busca tiene que
 * ver dónde escribir, no adivinar un atajo—, pero es un botón: escribir pasa en
 * el popup, no acá. En el teléfono, donde la sidebar está guardada detrás del
 * menú, se reduce a la lupa de la barra de arriba.
 */
export function DisparadorBuscador({
  onAbrir,
  compacto,
}: {
  onAbrir: () => void
  compacto?: boolean
}) {
  const [atajo, setAtajo] = useState("")

  // Después de montar: el user agent no existe en el servidor y pintar "⌘K" de
  // entrada rompería la hidratación en Windows.
  useEffect(() => {
    setAtajo(/mac/i.test(navigator.platform) ? "⌘K" : "Ctrl K")
  }, [])

  if (compacto) {
    return (
      <button
        type="button"
        onClick={onAbrir}
        aria-label="Buscar en el panel"
        className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
      >
        <Search className="h-5 w-5" strokeWidth={1.9} />
      </button>
    )
  }

  /* Sobre el navy de la sidebar los tokens de superficie no sirven: un campo
     blanco acá sería una mancha. El hueco se sugiere con un velo de blanco al
     4% y un borde apenas visible, igual que el resto de la barra. */
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex w-full items-center gap-2.5 rounded-lg border border-white/[0.09] bg-white/[0.04] px-3 py-2 transition-colors duration-150 hover:border-white/[0.14] hover:bg-white/[0.07]"
    >
      <Search className="h-[16px] w-[16px] shrink-0 text-white/45" strokeWidth={1.9} />
      <span className="flex-1 truncate text-left text-[13px] text-white/50">Buscar…</span>
      {atajo && (
        <kbd className="shrink-0 rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-white/40">
          {atajo}
        </kbd>
      )}
    </button>
  )
}

export function PaletaBusqueda({
  abierto,
  onCerrar,
  acceso,
}: {
  abierto: boolean
  onCerrar: () => void
  acceso: Acceso
}) {
  const router = useRouter()
  const pathname = usePathname()
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  const [consulta, setConsulta] = useState("")
  const [seleccion, setSeleccion] = useState(0)

  const resultados = useMemo(() => buscar(consulta, acceso), [consulta, acceso])
  const grupos = useMemo(() => agrupar(resultados), [resultados])

  // Cada vez que se abre arranca limpio: la consulta anterior ya llevó a donde
  // tenía que llevar, y encontrarla escrita obliga a borrarla antes de buscar.
  useEffect(() => {
    if (!abierto) return
    setConsulta("")
    setSeleccion(0)
    inputRef.current?.focus()
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [abierto, onCerrar])

  // La opción marcada tiene que quedar a la vista cuando se baja con el teclado.
  useEffect(() => {
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-indice="${seleccion}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [seleccion])

  if (!abierto) return null

  const ir = (destino: Destino) => {
    onCerrar()
    const [ruta, ancla] = destino.href.split("#")

    /* Ya estamos en la página y el destino es una sección de adentro: `push` no
       haría nada —misma ruta— y el click se sentiría roto. */
    if (ancla && (ruta || "/") === pathname) {
      document.getElementById(ancla)?.scrollIntoView({ behavior: "smooth" })
      return
    }
    router.push(destino.href)
  }

  const onTeclaInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSeleccion((s) => (resultados.length ? (s + 1) % resultados.length : 0))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSeleccion((s) =>
        resultados.length ? (s - 1 + resultados.length) % resultados.length : 0
      )
    } else if (e.key === "Enter") {
      e.preventDefault()
      const destino = resultados[seleccion]
      if (destino) ir(destino)
    }
  }

  // Contador de render: la lista se dibuja agrupada pero el teclado la recorre
  // como una sola, así que cada fila necesita su posición en el total.
  let indice = -1

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Buscar en el panel"
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={onCerrar}
      />

      <div className="relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-top-2 fade-in-0 duration-200">
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-4">
          <Search className="h-[18px] w-[18px] shrink-0 text-ink-faint" strokeWidth={1.9} />
          <input
            ref={inputRef}
            value={consulta}
            onChange={(e) => {
              setConsulta(e.target.value)
              setSeleccion(0)
            }}
            onKeyDown={onTeclaInput}
            placeholder="Buscar una pantalla: mail, saldo, certificados…"
            aria-label="Buscar una pantalla"
            /* `shadow-none` apaga el halo global de foco, y es la única vez que
               se justifica: el halo existe para señalar dónde está el cursor
               entre varios campos, y acá hay uno solo —el popup se abrió para
               escribir en él—. Encima, sobre un input sin borde el halo dibuja
               un marco adentro del marco del diálogo. */
            className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint focus-visible:shadow-none"
          />
          <kbd className="hidden shrink-0 rounded border border-line bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-ink-faint sm:block">
            Esc
          </kbd>
        </div>

        {resultados.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-ink-muted">
            Nada coincide con <span className="font-medium text-ink">{consulta}</span>.
          </p>
        ) : (
          <div ref={listaRef} className="min-h-0 flex-1 overflow-y-auto p-2">
            {grupos.map((grupo) => (
              <div key={grupo.seccion} className="mb-1 last:mb-0">
                <p className="eyebrow px-2 pb-1 pt-2">{grupo.seccion}</p>
                {grupo.destinos.map((destino) => {
                  indice += 1
                  const activo = indice === seleccion
                  return (
                    <button
                      key={destino.href}
                      type="button"
                      data-indice={indice}
                      onClick={() => ir(destino)}
                      onMouseMove={() => setSeleccion(indice)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                        activo ? "bg-brand-50" : "hover:bg-surface-muted"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">
                          {destino.titulo}
                        </p>
                        {destino.descripcion && (
                          <p className="truncate text-[11.5px] text-ink-muted">
                            {destino.descripcion}
                          </p>
                        )}
                      </div>
                      {activo && (
                        <CornerDownLeft
                          className="h-3.5 w-3.5 shrink-0 text-brand-600"
                          strokeWidth={2}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
