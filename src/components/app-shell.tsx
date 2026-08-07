"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"

import { Sidebar } from "./sidebar"

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  if (pathname === "/login") {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-navy-950/70 backdrop-blur-sm animate-in fade-in-0 duration-200"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full shadow-e4 animate-in slide-in-from-left-full duration-250">
            <Sidebar mobile />
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
          <div className="w-8" />
        </header>

        {/* El scroll vive acá, no en <body>: así la cabecera sticky de cada
            página se ancla al área de contenido y no al viewport completo. */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
      </div>
    </div>
  )
}
