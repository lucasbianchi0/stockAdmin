import { CerrarSesion } from "@/components/cerrar-sesion"

/**
 * Adónde cae un usuario autenticado que todavía no tiene ningún módulo.
 *
 * Existe para que el sistema falle de forma legible: sin esta pantalla, el
 * middleware redirigiría a un home que tampoco puede ver y el navegador entraría
 * en un bucle de redirecciones — el modo más confuso posible de decir "no tenés
 * permisos".
 */
export const metadata = { title: "Sin acceso · Accedra" }

export default function SinAccesoPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 px-4">
      <div className="w-full max-w-[400px] rounded-2xl border border-white/10 bg-surface p-7 shadow-e4">
        <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
          Tu usuario no tiene módulos asignados
        </h1>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
          La sesión está activa, pero todavía nadie te habilitó ninguna sección del
          backoffice. Pedile a un administrador que te asigne los módulos que
          necesitás y volvé a entrar.
        </p>
        <div className="mt-6">
          <CerrarSesion />
        </div>
      </div>
    </div>
  )
}
