"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertCircle, Loader2 } from "lucide-react"

type Estado = "verificando" | "listo" | "invalido" | "guardando"

const MINIMO = 8

/**
 * Donde aterriza el link del mail de recuperación de contraseña.
 *
 * El link puede traer la sesión de tres formas según quién mandó el mail: en el
 * fragmento (`#access_token…&type=recovery`, el que se manda desde el panel de
 * Supabase), como `?code=` (flujo PKCE, pedido desde la app) o como
 * `?token_hash=…&type=recovery` (plantilla de mail personalizada). El cliente de
 * Supabase resuelve solo el `code`; los otros dos se cargan acá.
 *
 * Vive bajo `/login` para ser pública en el middleware sin tocar la lista de
 * rutas públicas.
 */
export default function RestablecerPage() {
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>("verificando")
  const [password, setPassword] = useState("")
  const [repetida, setRepetida] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createSupabaseBrowser()
    let cancelado = false

    async function verificar() {
      const params = new URLSearchParams(window.location.search)
      const fragmento = new URLSearchParams(window.location.hash.slice(1))

      // `getSession` espera a que el cliente termine de leer la URL: con
      // `?code=` ahí ya queda la sesión.
      const { data } = await supabase.auth.getSession()
      if (data.session) return true

      const tokenHash = params.get("token_hash")
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })
        return !error
      }

      // Los tokens en el fragmento los rechaza el cliente, porque está en modo
      // PKCE y ese formato es del flujo implícito; se cargan a mano.
      const access_token = fragmento.get("access_token")
      const refresh_token = fragmento.get("refresh_token")
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token })
        return !error
      }
      return false
    }

    verificar().then((ok) => {
      if (cancelado) return
      // Saca los tokens de la barra de direcciones: no tienen que quedar en el
      // historial ni viajar si alguien copia la URL.
      window.history.replaceState(null, "", window.location.pathname)
      setEstado(ok ? "listo" : "invalido")
    })

    return () => {
      cancelado = true
    }
  }, [])

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < MINIMO) {
      setError(`La contraseña tiene que tener al menos ${MINIMO} caracteres.`)
      return
    }
    if (password !== repetida) {
      setError("Las contraseñas no coinciden.")
      return
    }

    setEstado("guardando")
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(
        error.message.toLowerCase().includes("different")
          ? "La contraseña nueva tiene que ser distinta de la anterior."
          : "No se pudo guardar la contraseña. Pedí un link nuevo e intentá otra vez."
      )
      setEstado("listo")
      return
    }

    router.push("/")
    router.refresh()
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy-950 px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(60rem 40rem at 50% -10%, rgba(43,106,200,0.28), transparent 65%), radial-gradient(50rem 30rem at 85% 110%, rgba(43,106,200,0.14), transparent 60%)",
        }}
      />

      <div className="relative w-full max-w-[380px]">
        <Image
          src="/brand/accedra-logo-blanco.svg"
          alt="Accedra IT Solutions"
          width={1073}
          height={160}
          className="mx-auto mb-8 h-[26px] w-auto"
          priority
          unoptimized
        />

        <div className="rounded-2xl border border-white/10 bg-surface p-7 shadow-e4">
          <h1 className="text-[19px] font-semibold tracking-[-0.025em] text-ink">
            Nueva contraseña
          </h1>

          {estado === "verificando" ? (
            <div className="mt-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
            </div>
          ) : estado === "invalido" ? (
            <>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                El link venció o ya se usó. Pedí uno nuevo desde la pantalla de ingreso.
              </p>
              <Button size="lg" className="mt-6 w-full" onClick={() => router.push("/login")}>
                Ir al ingreso
              </Button>
            </>
          ) : (
            <>
              <p className="mt-1 text-[12.5px] text-ink-muted">
                Elegí la contraseña con la que vas a ingresar
              </p>
              <form onSubmit={guardar} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-[12px] font-medium text-ink-secondary">
                    Contraseña nueva
                  </label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={MINIMO}
                    autoFocus
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="repetida" className="block text-[12px] font-medium text-ink-secondary">
                    Repetila
                  </label>
                  <Input
                    id="repetida"
                    type="password"
                    value={repetida}
                    onChange={(e) => setRepetida(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-danger-text" />
                    <p className="text-[12px] font-medium text-danger-text">{error}</p>
                  </div>
                )}

                <Button type="submit" size="lg" className="w-full" disabled={estado === "guardando"}>
                  {estado === "guardando" ? <Loader2 className="animate-spin" /> : "Guardar contraseña"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
