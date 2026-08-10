import type { SVGProps } from "react"
import { SiFacebook, SiInstagram, SiTiktok } from "@icons-pack/react-simple-icons"

/**
 * Marcas de las plataformas.
 *
 * Tres salen de Simple Icons con su trazado oficial. LinkedIn no: pidió que lo
 * sacaran del paquete, así que va dibujado acá con el mismo peso y el mismo
 * viewBox de 24 que los otros — si uno de los cuatro fuera un ícono de contorno
 * y los demás sólidos, la fila se vería armada a pedazos.
 */
export function LinkedInIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}

export type IconoPlataforma = (props: SVGProps<SVGSVGElement>) => React.ReactNode

/** Glifo y color de marca de cada plataforma. */
export const MARCA: Record<string, { Icon: IconoPlataforma; hex: string }> = {
  instagram: { Icon: SiInstagram as IconoPlataforma, hex: "#E4405F" },
  tiktok: { Icon: SiTiktok as IconoPlataforma, hex: "#111111" },
  linkedin: { Icon: LinkedInIcon, hex: "#0A66C2" },
  facebook: { Icon: SiFacebook as IconoPlataforma, hex: "#0866FF" },
}

/**
 * Canales del calendario → marcas que los componen.
 *
 * No es lo mismo que `MARCA`: el calendario trata a Instagram y Facebook como
 * un único canal `meta` porque se publica la misma pieza en los dos. Un canal
 * que son dos redes se dibuja con las dos marcas; poner el logo de Meta en su
 * lugar sería exacto y a la vez ilegible — nadie reconoce dónde va a salir su
 * post mirando el infinito azul.
 */
export const MARCAS_DE_CANAL: Record<string, string[]> = {
  linkedin: ["linkedin"],
  meta: ["instagram", "facebook"],
  instagram: ["instagram"],
  facebook: ["facebook"],
  tiktok: ["tiktok"],
}

/** Los glifos de un canal, en color de marca. */
export function MarcaCanal({
  canal,
  className = "h-4 w-4",
}: {
  canal: string
  className?: string
}) {
  const marcas = MARCAS_DE_CANAL[canal] ?? []
  if (marcas.length === 0) return null

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {marcas.map((id) => {
        const { Icon, hex } = MARCA[id]
        return <Icon key={id} className={className} style={{ color: hex }} />
      })}
    </span>
  )
}
