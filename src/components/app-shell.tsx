"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"

import { Sidebar } from "./sidebar"
import { ChatbotProvider } from "./chatbot/provider"
import { DisparadorBuscador, PaletaBusqueda, useAtajoBusqueda } from "./buscador-global"
import type { Acceso } from "@/lib/permisos"

export function AppShell({
  children,
  acceso,
  usuarioId,
}: {
  children: React.ReactNode
  acceso: Acceso
  usuarioId: string | null
}) {
  const { modulos } = acceso
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [buscadorAbierto, setBuscadorAbierto] = useState(false)
  const pathname = usePathname()

  // Al llegar a destino se cierran los dos: el menú del teléfono taparía la
  // pantalla nueva, y el buscador ya hizo su trabajo.
  useEffect(() => {
    setSidebarOpen(false)
    setBuscadorAbierto(false)
  }, [pathname])

  // useCallback: el atajo la usa como dependencia de su listener y una función
  // nueva en cada render lo desengancharía y volvería a enganchar siempre.
  const abrirBuscador = useCallback(() => setBuscadorAbierto(true), [])
  useAtajoBusqueda(abrirBuscador)

  // Las hojas de certificados se imprimen: la sidebar y el shell clavado al
  // viewport, con su overflow, cortarían todo menos la primera hoja.
  const esImpresion = /^\/marketing\/eventos\/[^/]+\/certificados$/.test(pathname)

  if (pathname === "/login" || pathname === "/sin-acceso" || esImpresion) {
    return <>{children}</>
  }

  /*
   * `fixed inset-0` y no `h-screen`.
   *
   * El síntoma que arregla: la pantalla "se rompía hacia abajo" —la barra
   * lateral terminaba en el medio y abajo quedaba una franja de fondo vacío—.
   * Pasaba en facturas de compra y en cualquier otra pantalla, sin un patrón
   * claro, que es lo que lo hacía difícil de creer.
   *
   * La causa: `h-screen` mide 100vh, pero nada impedía que el DOCUMENTO
   * creciera más que eso. Cualquier nodo suelto colgado del `<body>` —el
   * contenedor de los avisos, un portal, el overlay de desarrollo— le suma alto
   * al documento, y entonces la ventana scrollea por su cuenta: el shell, que
   * mide exactamente una pantalla, se va para arriba y deja ver el fondo abajo.
   * El scroll de adentro —el que corresponde— seguía funcionando, así que
   * parecía que la página "se movía sola".
   *
   * Clavado al viewport el problema no puede volver a existir, venga de donde
   * venga el nodo que estira el documento: el shell tapa la pantalla entera
   * siempre. Medido en el navegador, el scroll fantasma pasa de 260 px a 0.
   *
   * No afecta a las pantallas que se imprimen ni al login: esas salen antes,
   * por el `return` de arriba, y no pasan por acá.
   */
  const shell = (
    <div className="fixed inset-0 flex overflow-hidden bg-background">
      <Sidebar modulos={modulos} onAbrirBuscador={abrirBuscador} />

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-navy-950/70 backdrop-blur-sm animate-in fade-in-0 duration-200"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full shadow-e4 animate-in slide-in-from-left-full duration-250">
            <Sidebar
              mobile
              modulos={modulos}
              onAbrirAgentes={() => setSidebarOpen(false)}
              onAbrirBuscador={() => {
                // El menú se va: el popup se abre encima y volver a encontrarlo
                // abierto detrás, al cerrar, desorienta.
                setSidebarOpen(false)
                abrirBuscador()
              }}
            />
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
            className="absolute right-4 top-4 rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Barra superior mobile */}
        <header className="flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-navy-900 px-3 py-2.5 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Image
            src="/brand/accedra-logo-blanco.svg"
            alt="Accedra IT Solutions"
            width={1073}
            height={160}
            className="h-[18px] w-auto"
            unoptimized
          />
          <DisparadorBuscador onAbrir={abrirBuscador} compacto />
        </header>

        {/* El scroll vive acá, no en <body>: así la cabecera sticky de cada
            página se ancla al área de contenido y no al viewport completo. */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
      </div>

      <PaletaBusqueda
        abierto={buscadorAbierto}
        onCerrar={() => setBuscadorAbierto(false)}
        acceso={acceso}
      />
    </div>
  )

  if (!usuarioId || modulos.length === 0) return shell

  /* El asistente envuelve el shell y no vive en una página: el shell no se
     remonta al navegar, así que la conversación sigue ahí al cambiar de
     pantalla, y la barra lateral lo alcanza para abrir "Agentes". La `key` es
     el usuario —si en la misma pestaña entra otra persona, arranca de cero— y
     no cambia al navegar. */
  return (
    <ChatbotProvider key={usuarioId} usuarioId={usuarioId} acceso={acceso}>
      {shell}
    </ChatbotProvider>
  )
}
