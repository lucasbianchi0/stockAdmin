"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { createSupabaseBrowser } from "@/lib/supabase-browser"

export function CerrarSesion() {
  const router = useRouter()

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
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
