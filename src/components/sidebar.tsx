"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutGrid, ShoppingCart, Users, BarChart3, Settings, LogOut } from "lucide-react"
import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { useRouter } from "next/navigation"

const navigation = [
  { name: "Inventario", href: "/", icon: LayoutGrid, available: true },
  { name: "Pedidos", href: "/orders", icon: ShoppingCart, available: false },
  { name: "Clientes", href: "/customers", icon: Users, available: false },
  { name: "Reportes", href: "/reports", icon: BarChart3, available: false },
  { name: "Configuración", href: "/settings", icon: Settings, available: false },
]

interface SidebarProps {
  mobile?: boolean
}

export function Sidebar({ mobile }: SidebarProps = {}) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createSupabaseBrowser()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const content = (
    <>
      <div className="px-4 pt-6 pb-5">
        <div className="bg-white rounded-xl px-4 py-3 shadow-sm">
          <Image
            src="/logo-accedra.jpg"
            alt="Accedra IT Solutions"
            width={130}
            height={34}
            className="object-contain w-full h-auto"
            priority
          />
        </div>
      </div>

      <div className="mx-4 border-t border-white/[0.07]" />

      <p className="px-4 pt-5 pb-2 text-[10px] font-semibold tracking-[0.12em] uppercase text-slate-500">
        General
      </p>

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {navigation.map((item) => {
          const active = pathname === item.href && item.available

          if (!item.available) {
            return (
              <div
                key={item.name}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg opacity-40 cursor-not-allowed select-none"
              >
                <span className="shrink-0 w-1 h-5 rounded-full bg-transparent" />
                <item.icon className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="text-[13px] font-medium text-slate-400 flex-1">{item.name}</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-white/[0.08] px-1.5 py-0.5 rounded-full">
                  Próximo
                </span>
              </div>
            )
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 group ${
                active
                  ? "bg-[#2B6AC8]/15 text-white"
                  : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.05]"
              }`}
            >
              <span className={`shrink-0 w-1 h-5 rounded-full transition-all duration-150 ${active ? "bg-[#2B6AC8]" : "bg-transparent"}`} />
              <item.icon className={`h-4 w-4 shrink-0 transition-colors ${active ? "text-[#2B6AC8]" : "text-slate-500 group-hover:text-slate-300"}`} />
              {item.name}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-5 mt-auto border-t border-white/[0.07]">
        <p className="text-[11px] font-semibold text-slate-500 tracking-wide">BACKOFFICE</p>
        <p className="text-[11px] text-slate-600 mt-0.5">Accedra IT Solutions</p>
        <button
          onClick={handleLogout}
          className="mt-4 flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors w-full"
        >
          <LogOut className="h-3.5 w-3.5" />
          Cerrar sesión
        </button>
      </div>
    </>
  )

  if (mobile) {
    return (
      <aside className="flex flex-col bg-[#0B1628] w-[220px] h-full">
        {content}
      </aside>
    )
  }

  return (
    <aside className="hidden md:flex md:w-[220px] md:flex-col bg-[#0B1628] shrink-0">
      {content}
    </aside>
  )
}
