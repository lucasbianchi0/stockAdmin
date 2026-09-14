import { LoadingState } from "@/components/ui/states"

/**
 * Lo que se ve al navegar dentro de administración mientras la página siguiente
 * resuelve en el servidor. Las fichas leen su nombre en Supabase antes de
 * dibujar; sin esto el click parece no haber hecho nada hasta que responde.
 */
export default function AdminLoading() {
  return (
    <main className="flex min-h-full flex-col">
      <LoadingState />
    </main>
  )
}
