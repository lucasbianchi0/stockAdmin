"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  /*
   * Un mail de recuperación mandado desde el panel de Supabase vuelve a la URL
   * del sitio (la raíz) con los tokens en el fragmento. El middleware manda la
   * raíz sin sesión acá y el navegador conserva el fragmento, así que desde acá
   * se lo pasa a la pantalla que pide la contraseña nueva.
   */
  useEffect(() => {
    const hash = window.location.hash
    const query = window.location.search
    if (hash.includes("type=recovery") || query.includes("type=recovery")) {
      window.location.replace(`/login/restablecer${query}${hash}`)
    }
  }, [])

  const recuperar = async () => {
    setError(null)
    setAviso(null)
    if (!email.trim()) {
      setError("Escribí tu email y volvé a tocar “Olvidé mi contraseña”.")
      return
    }
    const supabase = createSupabaseBrowser()
    // El origen sale de donde está abierta la app, no de la configuración de
    // Supabase: así el link nunca apunta a localhost desde producción.
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login/restablecer`,
    })
    // Mismo mensaje exista o no la cuenta: no revela qué emails están dados de alta.
    setAviso("Si el email tiene cuenta, te llega un link para elegir una contraseña nueva.")
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createSupabaseBrowser()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError("Email o contraseña incorrectos.")
      setLoading(false)
      return
    }

    router.push("/")
    router.refresh()
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy-950 px-4">
      {/* Fondo: dos focos de luz de marca muy abiertos y una grilla apenas
          visible. Es lo único decorativo de toda la app y va justamente donde
          no hay datos que leer. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(60rem 40rem at 50% -10%, rgba(43,106,200,0.28), transparent 65%), radial-gradient(50rem 30rem at 85% 110%, rgba(43,106,200,0.14), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(50rem 40rem at 50% 40%, black, transparent 75%)",
          WebkitMaskImage: "radial-gradient(50rem 40rem at 50% 40%, black, transparent 75%)",
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
            Iniciar sesión
          </h1>
          <p className="mt-1 text-[12.5px] text-ink-muted">
            Ingresá tus credenciales para continuar
          </p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-[12px] font-medium text-ink-secondary"
              >
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-[12px] font-medium text-ink-secondary"
              >
                Contraseña
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-danger-text" />
                <p className="text-[12px] font-medium text-danger-text">{error}</p>
              </div>
            )}
            {aviso && (
              <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
                <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-ink-muted" />
                <p className="text-[12px] text-ink-secondary">{aviso}</p>
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : "Ingresar"}
            </Button>
            <button
              type="button"
              onClick={recuperar}
              className="block w-full text-center text-[12px] text-ink-muted transition-colors hover:text-ink"
            >
              Olvidé mi contraseña
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-white/25">
          Accedra IT Solutions · Backoffice
        </p>
      </div>
    </div>
  )
}
