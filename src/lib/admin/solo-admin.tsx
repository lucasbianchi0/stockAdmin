import { Lock } from "lucide-react"

import { EmptyState } from "@/components/ui/states"
import { accesoDeUsuario } from "@/lib/permisos"
import { createSupabaseServer } from "@/lib/supabase-server"

/** ¿La sesión actual es de un administrador? Para las páginas que sólo ven ellos. */
export async function esAdmin(): Promise<boolean> {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return accesoDeUsuario(user).admin
}

export function SoloAdministradores() {
  return (
    <EmptyState
      icon={Lock}
      title="Sólo para administradores"
      description="El stock lo ven únicamente quienes administran el sistema. Si lo necesitás, pedile acceso a un administrador."
    />
  )
}
