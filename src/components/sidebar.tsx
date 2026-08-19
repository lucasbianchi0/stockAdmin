"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  ChevronRight,
  LogOut,
  Megaphone,
  Package,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react"

import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { cn } from "@/lib/utils"
import type { Modulo } from "@/lib/permisos"

type NavItem = {
  name: string
  href: string
  available: boolean
  /** Sólo marca activo con coincidencia exacta. Para rutas padre como /marketing,
   *  que si no se quedarían encendidas dentro de /marketing/informes. */
  exact?: boolean
  /** Prefijos extra que también encienden el ítem (ej.: /product/ es Inventario). */
  also?: string[]
}

type Grupo = {
  id: Modulo
  titulo: string
  icon: LucideIcon
  items: NavItem[]
}

const GRUPOS: Grupo[] = [
  {
    id: "productos",
    titulo: "Productos",
    icon: Package,
    items: [
      { name: "Inventario", href: "/", available: true, exact: true, also: ["/product"] },
      { name: "Nuestros Productos", href: "/mis-productos", available: true },
      { name: "Pedidos", href: "/orders", available: true },
    ],
  },
  {
    id: "marketing",
    titulo: "Marketing",
    icon: Megaphone,
    items: [
      { name: "Panel", href: "/marketing", available: true, exact: true },
      { name: "Informes de campañas", href: "/marketing/informes", available: true },
      { name: "Brand Kit", href: "/marketing/brand", available: true },
      { name: "Plantillas de mensajes", href: "/marketing/mensajes", available: true },
      { name: "Brochures", href: "/marketing/brochures", available: true },
      { name: "Landings y SEO", href: "/marketing/landings", available: true },
      { name: "Calendario de contenido", href: "/contenido/calendario", available: true },
      { name: "Content Studio", href: "/contenido", available: true, exact: true },
    ],
  },
  {
    id: "administracion",
    titulo: "Administración",
    icon: SlidersHorizontal,
    /* Las dos primeras son las dos puertas de entrada del módulo, y por eso
       están arriba: todo lo demás —el proveedor, la deuda, el asiento, lo que
       hay que pagar— entra al sistema cargando una factura. Los maestros van
       después porque hoy casi no hace falta abrirlos: la carga da de alta la
       ficha que no existe. */
    items: [
      { name: "Facturas de compra", href: "/admin/compras", available: true },
      { name: "Facturas de venta", href: "/admin/ventas", available: true },
      { name: "Proveedores", href: "/admin/proveedores", available: true },
      { name: "Clientes", href: "/admin/clientes", available: true },
      { name: "Pagos a proveedores", href: "/admin/pagos", available: true },
      { name: "Cobros", href: "/admin/cobros", available: true },
      { name: "Caja y bancos", href: "/admin/cuentas", available: true },
      { name: "Contabilidad", href: "/admin/contabilidad", available: true },
      { name: "Reportes", href: "/admin/reportes", available: true },
    ],
  },
]

function esActivo(item: NavItem, pathname: string) {
  if (!item.available) return false
  if (item.also?.some((p) => pathname.startsWith(p))) return true
  return item.exact ? pathname === item.href : pathname.startsWith(item.href)
}

const grupoActivo = (grupo: Grupo, pathname: string) =>
  grupo.items.some((i) => esActivo(i, pathname))

interface SidebarProps {
  mobile?: boolean
  /** Módulos habilitados del usuario. Filtra qué grupos se dibujan. */
  modulos: Modulo[]
}

export function Sidebar({ mobile, modulos }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  /**
   * Estado inicial derivado del pathname, no de localStorage: se calcula igual en
   * servidor y cliente, así que no hay ni parpadeo ni mismatch de hidratación.
   * Abierto sólo el grupo donde estás — con todo abierto el plegado no sirve de nada.
   */
  // useMemo para que la identidad del array no cambie en cada render: sin eso
  // el efecto de abajo se dispara siempre y el linter tiene razón en quejarse.
  const grupos = useMemo(
    () => GRUPOS.filter((g) => modulos.includes(g.id)),
    [modulos]
  )

  const [abiertos, setAbiertos] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(grupos.map((g) => [g.id, grupoActivo(g, pathname)]))
  )

  // Al navegar, el grupo de destino se abre solo. No cierra los otros: si el
  // usuario los abrió a mano, cerrárselos en cada click se siente hostil.
  useEffect(() => {
    const activo = grupos.find((g) => grupoActivo(g, pathname))
    if (activo) setAbiertos((prev) => (prev[activo.id] ? prev : { ...prev, [activo.id]: true }))
  }, [pathname, grupos])

  const handleLogout = async () => {
    const supabase = createSupabaseBrowser()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const content = (
    <>
      {/* Vector en blanco sobre el navy: sin la placa blanca que hacía falta
          cuando el logo era un JPG con fondo opaco. */}
      <div className="px-5 pb-7 pt-7">
        <Image
          src="/brand/accedra-logo-blanco.svg"
          alt="Accedra IT Solutions"
          width={1073}
          height={160}
          className="h-[25px] w-auto"
          priority
          unoptimized
        />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {grupos.map((grupo) => (
          <GrupoNav
            key={grupo.id}
            grupo={grupo}
            pathname={pathname}
            abierto={abiertos[grupo.id]}
            onToggle={() =>
              setAbiertos((prev) => ({ ...prev, [grupo.id]: !prev[grupo.id] }))
            }
          />
        ))}
      </nav>

      <div className="mt-auto border-t border-white/[0.07] px-5 py-5">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-white/45">
          Backoffice
        </p>
        <p className="mt-0.5 text-[12px] text-white/35">Accedra IT Solutions</p>
        <button
          onClick={handleLogout}
          className="-ml-2.5 mt-4 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/90"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </>
  )

  /* El degradado vertical le da profundidad al panel sin leerse como gradiente:
     son cuatro puntos de luminosidad entre arriba y abajo. */
  const shell =
    "flex h-full w-[268px] shrink-0 flex-col bg-gradient-to-b from-navy-850 to-navy-950"

  if (mobile) return <aside className={shell}>{content}</aside>

  return <aside className={cn(shell, "hidden md:flex")}>{content}</aside>
}

function GrupoNav({
  grupo,
  pathname,
  abierto,
  onToggle,
}: {
  grupo: Grupo
  pathname: string
  abierto: boolean
  onToggle: () => void
}) {
  const tieneActivo = grupoActivo(grupo, pathname)
  const todoPendiente = grupo.items.every((i) => !i.available)

  return (
    <div>
      <button
        onClick={onToggle}
        aria-expanded={abierto}
        aria-controls={`nav-${grupo.id}`}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-semibold tracking-[-0.005em] transition-colors duration-150",
          todoPendiente
            ? "text-white/35 hover:bg-white/[0.03] hover:text-white/50"
            : "text-white/75 hover:bg-white/[0.05] hover:text-white"
        )}
      >
        <grupo.icon
          className={cn(
            "h-[18px] w-[18px] shrink-0 transition-colors",
            todoPendiente ? "text-white/25" : "text-white/50 group-hover:text-white/85"
          )}
          strokeWidth={1.85}
        />
        <span className="flex-1 truncate text-left">{grupo.titulo}</span>

        {/* Con el grupo plegado, un punto avisa que la sección activa está adentro.
            Sin esto se pierde la ubicación al colapsar. */}
        {tieneActivo && !abierto && (
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-brand-400" aria-hidden />
        )}

        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-white/30 transition-transform duration-200",
            abierto && "rotate-90"
          )}
          strokeWidth={2.1}
        />
      </button>

      {/* grid-rows 0fr→1fr anima hasta el alto real del contenido sin max-height
          inventado, que siempre termina cortando o dejando aire de más. */}
      <div
        id={`nav-${grupo.id}`}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          abierto ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          {/* La guía cae en el centro del ícono del grupo (12 nav + 12 padding
              + 9 medio ícono = 33px) y los hijos alinean su texto con el rótulo
              del grupo (12 + 30 pl + 10 padding del link = 52px). */}
          <div className="relative mb-1.5 mt-1">
            <span
              aria-hidden
              className="absolute bottom-1.5 left-[21px] top-1.5 w-px bg-white/[0.10]"
            />
            <div className="space-y-0.5 pl-[30px]">
              {grupo.items.map((item) => (
                <ItemNav key={item.name} item={item} pathname={pathname} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ItemNav({ item, pathname }: { item: NavItem; pathname: string }) {
  const activo = esActivo(item, pathname)

  if (!item.available) {
    return (
      <div className="flex cursor-not-allowed select-none items-center gap-2 rounded-md px-2.5 py-2">
        <span className="flex-1 truncate text-[13px] text-white/35">{item.name}</span>
        <span className="shrink-0 rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white/40">
          Pronto
        </span>
      </div>
    )
  }

  return (
    <Link
      href={item.href}
      aria-current={activo ? "page" : undefined}
      className={cn(
        "relative flex items-center rounded-md px-2.5 py-2 text-[13px] transition-colors duration-150",
        activo
          ? "bg-white/[0.09] font-semibold text-white"
          : "font-medium text-white/60 hover:bg-white/[0.05] hover:text-white/95"
      )}
    >
      {/* El tramo activo de la guía: la marca de posición es el propio hilo
          encendido, no un punto extra. Cae sobre la guía (-9px desde el borde
          del link, que arranca en 42px). */}
      <span
        aria-hidden
        className={cn(
          "absolute -left-[9px] top-1/2 h-[18px] w-[2px] -translate-y-1/2 rounded-full bg-brand-400 transition-opacity duration-150",
          activo ? "opacity-100" : "opacity-0"
        )}
      />
      <span className="truncate">{item.name}</span>
    </Link>
  )
}
