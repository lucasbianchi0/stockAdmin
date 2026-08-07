"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertCircle, Loader2 } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : "Ingresar"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-white/25">
          Accedra IT Solutions · Backoffice
        </p>
      </div>
    </div>
  )
}
