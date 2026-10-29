import { LoadingState } from "@/components/ui/states"

/**
 * Lo que se ve mientras el servidor lee el equipo o la ficha. Sin esto el clic
 * en el menú parece no haber hecho nada hasta que llegan los datos.
 */
export default function AgentesLoading() {
  return (
    <main className="flex min-h-full flex-col">
      <LoadingState label="Llamando al equipo" />
    </main>
  )
}
