import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { AppShell } from "@/components/app-shell"
import { Toaster } from "sonner"

/**
 * Geist es la única familia del sistema. Se carga con todos los pesos porque la
 * jerarquía de la app se apoya en el peso más que en el tamaño: 400 para texto,
 * 500 para etiquetas y navegación, 600 para títulos y cifras, 700 sólo en KPIs.
 *
 * Geist Mono no es decorativo: códigos, SKU e importes van en mono para que las
 * columnas de las tablas alineen carácter a carácter.
 */
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Accedra · Backoffice",
  description: "Sistema de gestión de inventario y precios — Accedra IT Solutions",
}

export const viewport: Viewport = {
  themeColor: "#0B1628",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <AppShell>{children}</AppShell>
        <Toaster
          position="top-center"
          richColors
          toastOptions={{
            classNames: {
              toast:
                "!rounded-xl !border-line !shadow-e3 !font-sans !text-[13px]",
            },
          }}
        />
      </body>
    </html>
  )
}
