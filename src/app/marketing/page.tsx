import Link from "next/link"
import {
  Palette,
  BarChart3,
  Target,
  ListChecks,
  MessageSquareQuote,
  PenLine,
  Globe,
  ArrowRight,
  type LucideIcon,
} from "lucide-react"

import { PageBody, PageHeader } from "@/components/ui/page-header"
import { cn } from "@/lib/utils"

/**
 * Hub de Marketing: una card por área, todas con la misma estructura y alto.
 *
 * `estado` distingue lo que ya funciona de lo que está por venir: una card sin
 * marcar que lleva a una pantalla vacía se siente rota, y marcada se lee como
 * hoja de ruta. La diferencia se hace con el emblema y el pie de la card, no
 * con el borde ni el tamaño, para que la grilla se mantenga pareja.
 */

type Estado = "listo" | "proximo"

type Card = {
  kicker: string
  titulo: string
  descripcion: string
  href: string
  icon: LucideIcon
  estado: Estado
}

const CARDS: Card[] = [
  {
    kicker: "Reportes",
    titulo: "Informes de campañas",
    descripcion:
      "El rendimiento mes a mes de Google Ads y el histórico 2017–2025 de la cuenta. Es lo que se le muestra a los socios.",
    href: "/marketing/informes",
    icon: BarChart3,
    estado: "listo",
  },
  {
    kicker: "Contenido",
    titulo: "Creación de contenido",
    descripcion:
      "Planificación y redacción de posts para redes, con la voz de la marca.",
    href: "/contenido",
    icon: PenLine,
    estado: "listo",
  },
  {
    kicker: "Marca",
    titulo: "Brand Kit",
    descripcion:
      "Logos, paleta, tono de voz, buyer personas y el prompt maestro. Todo lo que define cómo se ve y cómo habla Accedra.",
    href: "/marketing/brand",
    icon: Palette,
    estado: "listo",
  },
  {
    kicker: "Mensajes",
    titulo: "Plantillas de mensajes",
    descripcion:
      "Lo que el equipo escribe todos los días —presupuestos, seguimientos, cobranzas— escrito una sola vez y bien. Cualquiera crea y corrige.",
    href: "/marketing/mensajes",
    icon: MessageSquareQuote,
    estado: "listo",
  },
  {
    kicker: "Comercial",
    titulo: "Pipeline de leads",
    descripcion:
      "Las consultas que entran, su estado comercial y el monto del contrato. Sin esto no hay costo por cliente.",
    href: "/marketing/leads",
    icon: Target,
    estado: "proximo",
  },
  {
    kicker: "Bitácora",
    titulo: "Acciones y decisiones",
    descripcion:
      "Qué cambiamos cada mes y qué esperábamos que pasara. Es lo que después demuestra que las mejoras no fueron casualidad.",
    href: "/marketing/acciones",
    icon: ListChecks,
    estado: "proximo",
  },
  {
    kicker: "Sitio",
    titulo: "Landings y SEO",
    descripcion:
      "Las 30 páginas por solución e industria: qué información tienen para buscadores y para IA, y cuánto puntúan.",
    href: "/marketing/landings",
    icon: Globe,
    estado: "listo",
  },
]

export default function MarketingPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader title="Marketing" description="Campañas, marca y contenido de Accedra" />

      <PageBody width="narrow" className="max-w-5xl">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card) => (
            <CardArea key={card.titulo} card={card} />
          ))}
        </div>
      </PageBody>
    </main>
  )
}

function CardArea({ card }: { card: Card }) {
  const disponible = card.estado === "listo"

  const contenido = (
    <>
      <Emblema icon={card.icon} disponible={disponible} />

      <p className="eyebrow mt-4">{card.kicker}</p>
      <h3 className="mt-1 text-[14.5px] font-semibold tracking-[-0.015em] text-ink">
        {card.titulo}
      </h3>

      <p className="mt-1.5 text-[12.5px] leading-[1.65] text-ink-muted">{card.descripcion}</p>

      <div className="mt-auto pt-4">
        <div className="h-px bg-line" />
        <div className="pt-3">
          {disponible ? (
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-brand-600">
              Abrir
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          ) : (
            <span className="eyebrow">Próximo</span>
          )}
        </div>
      </div>
    </>
  )

  const base = "flex h-full flex-col rounded-xl border p-5 transition-all duration-200"

  if (!disponible) {
    return (
      <div className={cn(base, "select-none border-line bg-surface/60")}>{contenido}</div>
    )
  }

  return (
    <Link
      href={card.href}
      className={cn(
        base,
        "group border-line bg-surface shadow-e1",
        "hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-e2"
      )}
    >
      {contenido}
    </Link>
  )
}

/**
 * Emblema de la card: cuadrado sólido con el glifo en blanco para lo que ya
 * funciona, y en gris de línea para lo que está por venir. Un solo color en
 * toda la grilla — el arcoíris de pasteles era justo lo que la abarataba.
 */
function Emblema({
  icon: Icon,
  disponible,
}: {
  icon: LucideIcon
  disponible: boolean
}) {
  if (disponible) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[inset_0_1px_0_0_oklch(1_0_0/0.25),var(--elevation-1)] transition-transform duration-200 group-hover:scale-105">
        <Icon className="h-[17px] w-[17px]" strokeWidth={1.9} />
      </div>
    )
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-[11px] border border-line bg-surface-muted text-ink-faint">
      <Icon className="h-[17px] w-[17px]" strokeWidth={1.7} />
    </div>
  )
}
