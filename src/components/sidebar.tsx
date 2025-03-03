"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Package, Settings, ShoppingCart, Users } from "lucide-react"

export function Sidebar() {
  const pathname = usePathname()

  const navigation = [
    { name: "Inicio", href: "/", icon: Home },
    { name: "Productos", href: "/products", icon: Package },
    { name: "Pedidos", href: "/orders", icon: ShoppingCart },
    { name: "Clientes", href: "/customers", icon: Users },
    { name: "Configuración", href: "/settings", icon: Settings },
  ]

  return (
    <div className="hidden md:flex md:w-64 md:flex-col">
      <div className="flex flex-col flex-grow bg-gray-900 pt-5 pb-4 overflow-y-auto">
        <div className="flex items-center flex-shrink-0 px-4">
          <h1 className="text-xl font-bold text-white">E-commerce Admin</h1>
        </div>
        <div className="mt-5 flex-1 flex flex-col">
          <nav className="flex-1 px-2 space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`${
                    isActive ? "bg-gray-800 text-white" : "text-gray-300 hover:bg-gray-700 hover:text-white"
                  } group flex items-center px-2 py-2 text-sm font-medium rounded-md`}
                >
                  <item.icon
                    className={`${
                      isActive ? "text-white" : "text-gray-400 group-hover:text-gray-300"
                    } mr-3 flex-shrink-0 h-6 w-6`}
                    aria-hidden="true"
                  />
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>
    </div>
  )
}

