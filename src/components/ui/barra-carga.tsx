import { cn } from "@/lib/utils"

/**
 * Una línea fina que corre arriba de un panel mientras carga algo por detrás.
 *
 * Para las recargas de una tabla que ya tiene datos a la vista: avisa que
 * viene algo nuevo sin tapar ni atenuar lo que se está leyendo. Aparece y se
 * va con un fundido, nunca de golpe.
 */
export function BarraCarga({ activa }: { activa: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden transition-opacity duration-300",
        activa ? "opacity-100" : "opacity-0"
      )}
    >
      <div className="h-full w-1/3 animate-[barra-carga_1.1s_ease-in-out_infinite] rounded-full bg-brand-500" />
    </div>
  )
}
