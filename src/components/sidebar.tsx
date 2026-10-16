"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Bot,
  ChevronRight,
  FileText,
  Globe,
  KanbanSquare,
  LogOut,
  Megaphone,
  Package,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react"

import { useChatbotOpcional } from "@/components/chatbot/provider"
import { DisparadorBuscador } from "@/components/buscador-global"
import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { borrarHistoriales } from "@/lib/chatbot/historial"
import { Avatar } from "@/components/ui/avatar"
import { claveDe, pedirJson } from "@/lib/admin/query"
import { URL_PENDIENTES_CRM } from "@/lib/comercial/crm"
import { cn } from "@/lib/utils"
import type { Modulo } from "@/lib/permisos"

type NavItem = {
  name: string
  /** Sin `href` el ítem no navega: es el rótulo de un submódulo y lo que se
   *  clickea son sus `hijos`. */
  href?: string
  available: boolean
  /** Sólo marca activo con coincidencia exacta. Para rutas padre como /marketing,
   *  que si no se quedarían encendidas dentro de /marketing/informes. */
  exact?: boolean
  /** Prefijos extra que también encienden el ítem (ej.: /product/ es Inventario). */
  also?: string[]
  /** Prefijos que lo apagan aunque su `href` coincida. Para el maestro que tiene
   *  una pantalla hermana colgando de su propia ruta —/admin/proveedores y
   *  /admin/proveedores/cuenta-corriente—: sin esto se encienden los dos y el
   *  menú deja de decir dónde estás. */
  salvo?: string[]
  /** Las pantallas que cuelgan de este submódulo. */
  hijos?: NavItem[]
  /** Un número al lado del nombre, que se pide aparte (ver `Contador`). */
  contador?: "crm"
  /** El número del árbol del contador —"2.3", "5.3.1"—, a la vista y tenue. */
  numero?: string
  /** Sólo para administradores. El ítem ni se dibuja para el resto. */
  soloAdmin?: boolean
}

type Grupo = {
  /** Clave del plegado. No es el permiso: dos grupos pueden colgar del mismo módulo. */
  id: string
  /** Quién lo ve: el grupo se dibuja si el usuario tiene este módulo. */
  modulo: Modulo
  titulo: string
  icon: LucideIcon
  items: NavItem[]
}

const GRUPOS: Grupo[] = [
  {
    id: "productos",
    modulo: "productos",
    titulo: "Productos",
    icon: Package,
    items: [
      { name: "Inventario", href: "/", available: true, exact: true, also: ["/product"] },
      { name: "Nuestros Productos", href: "/mis-productos", available: true },
      { name: "Pedidos", href: "/orders", available: true },
    ],
  },
  /*
   * Lo que cambia cómo se ve accedra.com.ar, separado de Marketing, que es medir
   * y promocionar. Cuelga del mismo permiso que Marketing —quien edita el sitio
   * hoy es el mismo que hace campañas— y las rutas siguen bajo /marketing para
   * no romper enlaces guardados. Eventos se queda en Marketing: las inscripciones
   * entran por el sitio, pero un evento es una acción comercial.
   */
  {
    id: "sitio",
    modulo: "marketing",
    titulo: "Sitio web",
    icon: Globe,
    items: [
      { name: "Landings y SEO", href: "/marketing/landings", available: true },
      { name: "Notas del sitio", href: "/marketing/notas", available: true },
      { name: "Popup del sitio", href: "/marketing/popup", available: true },
    ],
  },
  {
    id: "marketing",
    modulo: "marketing",
    titulo: "Marketing",
    icon: Megaphone,
    items: [
      /* Primero Resultados: es la única pantalla que se abre para saber cómo
         venimos. Informes va abajo porque es lo que se manda, no lo que se
         consulta. */
      { name: "Resultados", href: "/marketing/resultados", available: true },
      /* La base de gente. De acá sale lo que va al CRM de Comercial. */
      { name: "Contactos", href: "/marketing/contactos", available: true },
      { name: "Informes de campañas", href: "/marketing/informes", available: true },
      { name: "Brand Kit", href: "/marketing/brand", available: true },
      { name: "Plantillas de mensajes", href: "/marketing/mensajes", available: true },
      { name: "Brochures", href: "/marketing/brochures", available: true },
      { name: "Eventos y certificados", href: "/marketing/eventos", available: true },
      /* El flujo nuevo, en el orden en el que se usa: primero se genera y se
         revisa, después se programa. El camino anterior —los planes de 15 días
         y el Content Studio— queda fuera del menú por ahora; las páginas siguen
         enteras y se llega entrando a mano a /contenido/calendario y /contenido. */
      /* Imagen y texto son dos generadores separados a propósito: el pedido,
         los parámetros y lo que se descarga no tienen nada en común. */
      {
        name: "Generación de contenido",
        available: true,
        hijos: [
          { name: "Generar imagen", href: "/contenido/imagen", available: true },
          { name: "Generar texto", href: "/contenido/texto", available: true },
          { name: "Historial y templates", href: "/contenido/historial", available: true },
          { name: "Banco de piezas", href: "/contenido/generacion", available: true },
        ],
      },
      { name: "Calendario de contenido", href: "/contenido/agenda", available: true },
    ],
  },
  /*
   * Comercial va entre Marketing y Administración porque ese es el recorrido de
   * una venta: se promociona, se presupuesta, se factura. Quien presupuesta
   * entra acá todos los días y a Administración no entra nunca.
   */
  {
    id: "comercial",
    modulo: "comercial",
    titulo: "Comercial",
    icon: FileText,
    items: [
      /* Primero el CRM: es lo que se abre a la mañana para saber qué sigue. */
      { name: "CRM", href: "/comercial/crm", available: true, contador: "crm" },
      { name: "Presupuestos", href: "/comercial/presupuestos", available: true },
      /* La misma base de clientes que Administración, con otra puerta. No es
         una copia ni una sincronización: es la misma tabla. */
      { name: "Clientes", href: "/comercial/clientes", available: true },
      { name: "Reportes", href: "/comercial/reportes", available: true },
    ],
  },
  {
    id: "administracion",
    modulo: "administracion",
    titulo: "Administración",
    icon: SlidersHorizontal,
    /*
     * El árbol del contador, en su orden, con sus nombres y sus números.
     *
     * Es el que mandó el 14/10/2026 («así queda el árbol»). Cuando alguien dice
     * "el 2.3", tiene que haber un 2.3, y por eso el número está a la vista.
     *
     *   0 Datos maestros
     *   1 Tesorería     → caja y bancos · otros movimientos
     *   2 Proveedores   → maestro · cuenta corriente · compras · pagos · pendientes de pago
     *   3 Clientes      → maestro · cuenta corriente · ventas · cobros · pendientes de cobro
     *   4 Stock
     *   5 Contabilidad  → mayores · diario · subdiarios · asientos automáticos · sumas y saldos
     *
     * Dos cosas que no dice el árbol y se decidieron con el contador: «Otros
     * movimientos» va dentro de Tesorería (es plata que entra y sale de las
     * cuentas, no de un proveedor), y los dos reportes de pendientes que antes
     * compartían pantalla se separaron, cada uno en su módulo.
     */
    items: [
      { numero: "0", name: "Datos maestros", href: "/admin/maestros", available: true },
      {
        numero: "1",
        name: "Tesorería",
        available: true,
        hijos: [
          { numero: "1.1", name: "Caja y bancos", href: "/admin/cuentas", available: true },
          { numero: "1.2", name: "Otros movimientos", href: "/admin/movimientos", available: true },
        ],
      },
      {
        numero: "2",
        name: "Proveedores",
        available: true,
        hijos: [
          {
            numero: "2.1",
            name: "Proveedores",
            href: "/admin/proveedores",
            available: true,
            salvo: ["/admin/proveedores/cuenta-corriente", "/admin/proveedores/pendientes"],
          },
          {
            numero: "2.2",
            name: "Cuenta corriente",
            href: "/admin/proveedores/cuenta-corriente",
            available: true,
          },
          { numero: "2.3", name: "Facturas de compras", href: "/admin/compras", available: true },
          { numero: "2.4", name: "Pago de facturas", href: "/admin/pagos", available: true },
          {
            numero: "2.5",
            name: "Pendientes de pago",
            href: "/admin/proveedores/pendientes",
            available: true,
          },
        ],
      },
      {
        numero: "3",
        name: "Clientes",
        available: true,
        hijos: [
          {
            numero: "3.1",
            name: "Clientes",
            href: "/admin/clientes",
            available: true,
            salvo: ["/admin/clientes/cuenta-corriente", "/admin/clientes/pendientes"],
          },
          {
            numero: "3.2",
            name: "Cuenta corriente",
            href: "/admin/clientes/cuenta-corriente",
            available: true,
          },
          { numero: "3.3", name: "Facturas de ventas", href: "/admin/ventas", available: true },
          { numero: "3.4", name: "Cobro de facturas", href: "/admin/cobros", available: true },
          {
            numero: "3.5",
            name: "Pendientes de cobro",
            href: "/admin/clientes/pendientes",
            available: true,
          },
        ],
      },
      { numero: "4", name: "Stock", href: "/admin/stock", available: false, soloAdmin: true },
      {
        numero: "5",
        name: "Contabilidad",
        available: true,
        hijos: [
          { numero: "5.1", name: "Mayores", href: "/admin/contabilidad/mayor", available: true },
          /* Exacto: es la ruta madre de las otras vistas y si no se quedaría
             encendido en todas. */
          {
            numero: "5.2",
            name: "Libro diario",
            href: "/admin/contabilidad",
            available: true,
            exact: true,
            also: ["/admin/contabilidad/sin-asentar"],
          },
          {
            numero: "5.3",
            name: "Subdiarios",
            available: true,
            hijos: [
              {
                numero: "5.3.1",
                name: "IVA Ventas",
                href: "/admin/contabilidad/subdiarios/ventas",
                available: false,
              },
              {
                numero: "5.3.2",
                name: "IVA Compras",
                href: "/admin/contabilidad/subdiarios/compras",
                available: false,
              },
            ],
          },
          {
            numero: "5.4",
            name: "Asientos automáticos",
            available: true,
            hijos: [
              {
                numero: "5.4.1",
                name: "Ajuste por inflación",
                href: "/admin/contabilidad/asientos/ajuste-inflacion",
                available: false,
              },
              {
                numero: "5.4.2",
                name: "Apertura y cierre",
                href: "/admin/contabilidad/asientos/apertura-cierre",
                available: false,
              },
            ],
          },
          {
            numero: "5.5",
            name: "Sumas y saldos",
            href: "/admin/contabilidad/sumas-y-saldos",
            available: true,
          },
        ],
      },
    ],
  },
]

/** Saca lo que es sólo para administradores, en todos los niveles. */
function paraUsuario(items: NavItem[], admin: boolean): NavItem[] {
  return items
    .filter((i) => admin || !i.soloAdmin)
    .map((i) => (i.hijos ? { ...i, hijos: paraUsuario(i.hijos, admin) } : i))
}

function esActivo(item: NavItem, pathname: string): boolean {
  if (!item.available) return false
  if (item.hijos) return item.hijos.some((h) => esActivo(h, pathname))
  if (item.salvo?.some((p) => pathname.startsWith(p))) return false
  if (item.also?.some((p) => pathname.startsWith(p))) return true
  if (!item.href) return false
  return item.exact ? pathname === item.href : pathname.startsWith(item.href)
}

const grupoActivo = (grupo: Grupo, pathname: string) =>
  grupo.items.some((i) => esActivo(i, pathname))

/** Quién está adentro: el pie de la sidebar. */
export type UsuarioSesion = { id: string; nombre: string; email: string | null }

const NOMBRE_MODULO: Record<Modulo, string> = {
  productos: "Productos",
  marketing: "Marketing",
  comercial: "Comercial",
  administracion: "Administración",
}

interface SidebarProps {
  mobile?: boolean
  usuario?: UsuarioSesion | null
  admin?: boolean
  /** Módulos habilitados del usuario. Filtra qué grupos se dibujan. */
  modulos: Modulo[]
  /** Después de abrir los agentes. En el teléfono cierra el menú, que taparía el chat. */
  onAbrirAgentes?: () => void
  /** Abre el buscador. Sin esto el campo no se dibuja: un buscador que no busca
   *  es peor que no tenerlo. */
  onAbrirBuscador?: () => void
}

export function Sidebar({ mobile, modulos, usuario, admin, onAbrirAgentes, onAbrirBuscador }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const chat = useChatbotOpcional()

  /**
   * Estado inicial derivado del pathname, no de localStorage: se calcula igual en
   * servidor y cliente, así que no hay ni parpadeo ni mismatch de hidratación.
   * Abierto sólo el grupo donde estás — con todo abierto el plegado no sirve de nada.
   */
  // useMemo para que la identidad del array no cambie en cada render: sin eso
  // el efecto de abajo se dispara siempre y el linter tiene razón en quejarse.
  const grupos = useMemo(
    () =>
      GRUPOS.filter((g) => modulos.includes(g.modulo)).map((g) => ({
        ...g,
        items: paraUsuario(g.items, Boolean(admin)),
      })),
    [modulos, admin]
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
    // Antes de salir: lo que el asistente contestó no puede quedar en la
    // pestaña para quien entre después.
    borrarHistoriales()
    const supabase = createSupabaseBrowser()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const content = (
    <>
      {/* Vector en blanco sobre el navy: sin la placa blanca que hacía falta
          cuando el logo era un JPG con fondo opaco. */}
      <div className="px-5 pb-5 pt-7">
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

      {/* Arriba de todo, antes del menú: buscar es la alternativa a recorrerlo,
          así que tiene que verse antes de empezar a recorrerlo. Queda fuera del
          <nav> con scroll para que no se vaya de pantalla al bajar la lista. */}
      {onAbrirBuscador && (
        <div className="px-3 pb-4">
          <DisparadorBuscador onAbrir={onAbrirBuscador} />
        </div>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {/* La ticketera va primera y fuera de los grupos: no pertenece a ningún
            módulo —es el tablero del equipo entero— y es la pantalla con la que
            se empieza el día. Un ítem suelto y sin plegar, porque no tiene
            hermanas entre las que elegir.

            La condición es la misma regla que declara `/tickets` en permisos.ts
            —alcanza con tener algún módulo—, escrita acá para que el menú no
            prometa una puerta que el middleware no abre. Es cosmética, como
            todo el filtrado de la sidebar: la barrera real está allá. */}
        {modulos.length > 0 && (
        <Link
          href="/tickets"
          className={cn(
            "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-semibold tracking-[-0.005em] transition-colors duration-150",
            pathname.startsWith("/tickets")
              ? "bg-white/[0.09] text-white"
              : "text-white/75 hover:bg-white/[0.05] hover:text-white"
          )}
        >
          <KanbanSquare
            className={cn(
              "h-[18px] w-[18px] shrink-0 transition-colors",
              pathname.startsWith("/tickets")
                ? "text-white/85"
                : "text-white/50 group-hover:text-white/85"
            )}
            strokeWidth={1.85}
          />
          <span className="flex-1 truncate text-left">Ticketera</span>
        </Link>
        )}

        {/* Agentes no es una pantalla sino el chat a pantalla completa: no
            navega, así que la página de atrás queda donde estaba al cerrarlo. */}
        {chat && (
          <div className="mb-2 border-b border-white/[0.07] pb-2">
            <button
              type="button"
              onClick={() => {
                chat.abrirAgentes()
                onAbrirAgentes?.()
              }}
              aria-pressed={chat.abierto && chat.ampliado}
              className={cn(
                "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-semibold tracking-[-0.005em] transition-colors duration-150",
                chat.abierto && chat.ampliado
                  ? "bg-white/[0.09] text-white"
                  : "text-white/75 hover:bg-white/[0.05] hover:text-white"
              )}
            >
              <Bot
                className="h-[18px] w-[18px] shrink-0 text-white/50 transition-colors group-hover:text-white/85"
                strokeWidth={1.85}
              />
              <span className="flex-1 truncate text-left">Agentes</span>
              {chat.agentes.length > 1 && (
                <span className="shrink-0 rounded-full bg-brand-400/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-brand-300">
                  {chat.agentes.length}
                </span>
              )}
            </button>
          </div>
        )}

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

      {/* Quién está adentro. La tarjeta entera es la sesión: nombre, qué ve
          y la salida, sin un renglón de "Cerrar sesión" suelto debajo. */}
      <div className="mt-auto border-t border-white/[0.07] p-3">
        <div className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-white/[0.04]">
          <span className="relative shrink-0">
            <Avatar
              id={usuario?.id ?? null}
              nombre={usuario?.nombre ?? "?"}
              size="md"
              className="h-9 w-9 text-[12px] ring-2 ring-white/10"
            />
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-navy-950"
            />
          </span>
          <div className="min-w-0 flex-1" title={usuario?.email ?? undefined}>
            <p className="truncate text-[13px] font-semibold tracking-[-0.005em] text-white">
              {usuario?.nombre ?? "Backoffice"}
            </p>
            <p className="truncate text-[11.5px] text-white/45">
              {admin
                ? "Administrador"
                : modulos.length > 0
                  ? modulos.map((m) => NOMBRE_MODULO[m]).join(" · ")
                  : (usuario?.email ?? "Accedra IT Solutions")}
            </p>
          </div>
          <button
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="shrink-0 rounded-lg p-2 text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
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
              {grupo.items.map((item) =>
                item.hijos ? (
                  <SubGrupoNav key={item.name} item={item} pathname={pathname} />
                ) : (
                  <ItemNav key={item.name} item={item} pathname={pathname} />
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Un submódulo del organigrama —"2 Proveedores", "3 Clientes"— con sus pantallas
 * adentro, plegable como el grupo de arriba.
 *
 * Que se pliegue tiene un efecto que vale más que los cuatro renglones que
 * ahorra: **cerrados los dos, el menú es exactamente el organigrama.** Datos
 * maestros · Proveedores · Clientes · Caja y bancos · Contabilidad · Reportes,
 * los seis módulos del pliego y nada más. Abrir uno es entrar a ese módulo.
 *
 * Arranca cerrado salvo que la pantalla en la que estás esté adentro, igual que
 * el grupo: es la misma regla en los dos niveles, así que el menú se comporta de
 * una sola manera en vez de dos.
 *
 * El rótulo no navega: es el módulo entero, y la pantalla que lleva su mismo
 * nombre —el maestro— cuelga adentro. Así que el click abre y cierra en vez de
 * ir a ningún lado.
 */
function SubGrupoNav({
  item,
  pathname,
  nivel = 1,
}: {
  item: NavItem
  pathname: string
  /** 2 es un submódulo dentro de otro —5.3 Subdiarios dentro de Contabilidad—.
   *  Se dibuja como una pantalla más que se despliega, no como otro rótulo en
   *  mayúsculas: dos rótulos iguales apilados no dicen cuál cuelga de cuál. */
  nivel?: 1 | 2
}) {
  const activo = esActivo(item, pathname)
  const [abierto, setAbierto] = useState(activo)

  // Al navegar a una pantalla de adentro —desde el buscador, un link de otra
  // pantalla, un favorito— el submódulo se abre solo. Sin esto, el ítem activo
  // quedaría escondido y el menú mentiría sobre dónde estás.
  useEffect(() => {
    if (activo) setAbierto(true)
  }, [activo])

  const id = `nav-sub-${(item.numero ?? item.name).toLowerCase().replace(/[\s.]+/g, "-")}`

  return (
    <div className="pt-1 first:pt-0">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={id}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2.5 transition-colors",
          nivel === 1
            ? "py-1.5 text-[10px] font-bold uppercase tracking-[0.11em]"
            : "py-2 text-[12.5px] font-medium",
          nivel === 1
            ? activo
              ? "text-white/60"
              : "text-white/40"
            : activo
              ? "text-white/85"
              : "text-white/60",
          "hover:bg-white/[0.05] hover:text-white/80"
        )}
      >
        <Numero numero={item.numero} />
        <span className="flex-1 truncate text-left">{item.name}</span>

        {/* Plegado y con la pantalla activa adentro, un punto lo dice. Es el
            mismo recurso que usa el grupo, un escalón más chico. */}
        {activo && !abierto && (
          <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-brand-400" aria-hidden />
        )}

        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-white/25 transition-transform duration-200",
            abierto && "rotate-90"
          )}
          strokeWidth={2.4}
        />
      </button>

      <div
        id={id}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          abierto ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          {/* Las pantallas del submódulo van 18px más adentro que su rótulo, con
              su propia guía —más tenue que la del grupo, porque es un escalón
              menor—. Sin la sangría, "Facturas de compras" queda alineada con
              "Caja y bancos" y las dos se leen como hermanas cuando una está un
              nivel más abajo.

              La guía cae en 9px, que es exactamente donde ItemNav dibuja su
              marca de posición (-9px desde el borde del link, que arranca en
              18px): el tramo encendido del hilo es la propia guía, no un punto
              aparte flotando al lado. */}
          {/* En el tercer nivel la sangría es menor (12px, guía en 3px): con
              18 más el número "5.3.1", "IVA Ventas" ya no entra en los 268px
              de la barra. Sigue alineado con la marca de ItemNav (-9px). */}
          <div className="relative pt-0.5">
            <span
              aria-hidden
              className={cn(
                "absolute bottom-1 top-1.5 w-px bg-white/[0.07]",
                nivel === 1 ? "left-[9px]" : "left-[3px]"
              )}
            />
            <div className={cn("space-y-0.5", nivel === 1 ? "pl-[18px]" : "pl-[12px]")}>
              {item.hijos?.map((hijo) =>
                hijo.hijos ? (
                  <SubGrupoNav key={hijo.name} item={hijo} pathname={pathname} nivel={2} />
                ) : (
                  <ItemNav key={hijo.name} item={hijo} pathname={pathname} />
                )
              )}
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
        <Numero numero={item.numero} />
        <span className="flex-1 truncate text-[13px] text-white/35">{item.name}</span>
        <span className="shrink-0 rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white/40">
          Pronto
        </span>
      </div>
    )
  }

  return (
    <Link
      href={item.href ?? "#"}
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
      <Numero numero={item.numero} />
      <span className="flex-1 truncate">{item.name}</span>
      {item.contador === "crm" && <ContadorCrm />}
    </Link>
  )
}

/**
 * El número del árbol del contador, delante del nombre. Tenue y en cifras de
 * ancho fijo: sirve para ubicarse ("el 2.3"), no para leerse primero.
 */
function Numero({ numero }: { numero?: string }) {
  if (!numero) return null
  return (
    <span className="mr-1 shrink-0 font-mono text-[10.5px] font-medium tabular-nums tracking-normal text-white/30">
      {numero}
    </span>
  )
}

/**
 * Las próximas acciones del CRM propio vencidas o de hoy: lo que hay que hacer
 * ya, a la vista desde cualquier pantalla. Se refresca solo cada pocos minutos
 * y cada vez que el CRM cambia algo (ver `confirmar` en crm-client).
 */
function ContadorCrm() {
  const q = useQuery({
    queryKey: claveDe("comercial", URL_PENDIENTES_CRM),
    queryFn: ({ signal }) => pedirJson<{ pendientes: number }>(URL_PENDIENTES_CRM, { signal }),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })
  const n = q.data?.pendientes ?? 0
  if (n === 0) return null
  return (
    <span
      title={`${n} ${n === 1 ? "acción vencida o para hoy" : "acciones vencidas o para hoy"}`}
      className="ml-2 shrink-0 rounded-full bg-danger/90 px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none text-white animate-in fade-in-0 zoom-in-90 duration-200"
    >
      {n}
    </span>
  )
}
