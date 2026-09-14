"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { borrarHistoriales } from "@/lib/chatbot/historial"

export function CerrarSesion() {
  const router = useRouter()

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        // Antes de salir: lo que el asistente contestó no puede quedar en la
        // pestaña para quien entre después.
        borrarHistoriales()
        await createSupabaseBrowser().auth.signOut()
        router.push("/login")
        router.refresh()
      }}
    >
      <LogOut />
      Cerrar sesión
    </Button>
  )
}
