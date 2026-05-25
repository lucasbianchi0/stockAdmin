import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AppShell } from "@/components/app-shell"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Accedra · Backoffice",
  description: "Sistema de gestión de inventario y precios — Accedra IT Solutions",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body className={inter.className} suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}

