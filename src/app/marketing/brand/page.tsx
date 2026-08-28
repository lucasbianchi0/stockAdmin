import type React from "react"
import Image from "next/image"
import {
  Ban,
  Check,
  Download,
  ExternalLink,
  Minus,
  X,
} from "lucide-react"

import { PageHeader } from "@/components/ui/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  BrandNav,
  ColorChip,
  CopyButton,
  LogoCard,
  PromptCard,
  PromptDisciplinaCard,
  type NavGrupo,
} from "@/components/marketing/brand-kit-ui"
import {
  BLOQUES_CONTEXTO,
  BOILERPLATE,
  CANALES,
  CASOS,
  CIFRAS,
  CLAIMS,
  CLIENTES,
  COLORES_SOLUCION,
  COMPOSICION,
  EMPRESA,
  FOTOGRAFIA,
  INDUSTRIAS,
  LOGOS,
  PALETA,
  PARTNERS,
  PERSONAS,
  POSICIONAMIENTO,
  PROMPT_COMPLETO,
  PROMPTS,
  REGLAS_LOGO,
  SERVICIOS,
  TIPOGRAFIA,
  TONO,
} from "@/lib/brand-kit"
import {
  MEDIDA_PORTADA,
  PORTADAS_LINKEDIN,
  promptPortada,
  REGLAS_PORTADA,
  ZONAS_PORTADA,
} from "@/lib/brand-portadas"

/**
 * Brand Kit de Accedra.
 *
 * Es un documento, no un dashboard: columna de lectura angosta, secciones
 * numeradas y un índice fijo. Lo que lo diferencia de un PDF es que cada dato
 * se puede copiar y cada logo bajar — un kit del que hay que pedirle el archivo
 * a alguien termina en piezas con el logo sacado de un mail viejo.
 */

export const metadata = { title: "Brand Kit · Accedra" }

const NAV: NavGrupo[] = [
  {
    titulo: "Prompts",
    items: [
      { id: "prompts", label: "Por disciplina" },
      { id: "bloques", label: "Bloques de contexto" },
    ],
  },
  {
    titulo: "Fundamentos",
    items: [
      { id: "posicionamiento", label: "Posicionamiento" },
      { id: "boilerplate", label: "Boilerplate y bios" },
      { id: "tono", label: "Tono de voz" },
      { id: "claims", label: "Claims y compliance" },
    ],
  },
  {
    titulo: "Identidad visual",
    items: [
      { id: "logos", label: "Logos" },
      { id: "paleta", label: "Paleta" },
      { id: "tipografia", label: "Tipografía" },
      { id: "fotografia", label: "Fotografía e iconos" },
      { id: "composicion", label: "Sistema de piezas" },
      { id: "portadas-linkedin", label: "Portadas LinkedIn" },
    ],
  },
  {
    titulo: "Mercado",
    items: [
      { id: "personas", label: "Buyer personas" },
      { id: "servicios", label: "Catálogo de servicios" },
      { id: "prueba-social", label: "Prueba social" },
      { id: "casos", label: "Casos de éxito" },
    ],
  },
  {
    titulo: "Operación",
    items: [
      { id: "canales", label: "Canales oficiales" },
      { id: "ficha", label: "Ficha de datos" },
    ],
  },
]

export default function BrandKitPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Brand Kit"
        description="Todo lo que define cómo se ve, cómo habla y qué puede prometer Accedra"
        back={{ href: "/marketing", label: "Marketing" }}
        actions={
          <CopyButton
            texto={PROMPT_COMPLETO}
            label="Copiar prompt completo"
            mensaje="Prompt completo copiado"
            variant="default"
            size="sm"
          />
        }
      />

      <div className="mx-auto flex w-full max-w-[1180px] gap-10 px-5 py-8 sm:px-8">
        <BrandNav grupos={NAV} />

        <div className="min-w-0 flex-1 space-y-14">
          <Prompts />
          <Bloques />
          <Portada />
          <Posicionamiento />
          <Boilerplate />
          <Tono />
          <Claims />
          <Logos />
          <Paleta />
          <Tipografia />
          <Fotografia />
          <Composicion />
          <PortadasLinkedIn />
          <Personas />
          <Servicios />
          <PruebaSocial />
          <Casos />
          <Canales />
          <Ficha />
        </div>
      </div>
    </main>
  )
}

/* ── Andamiaje ────────────────────────────────────────────────────────────── */

function Section({
  id,
  num,
  titulo,
  bajada,
  children,
}: {
  id: string
  num: string
  titulo: string
  bajada: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-5 border-b border-line pb-4">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[11px] tabular-nums text-ink-faint">{num}</span>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{titulo}</h2>
        </div>
        <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink-muted">{bajada}</p>
      </div>
      {children}
    </section>
  )
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-surface p-5 shadow-e1 ${className}`}>
      {children}
    </div>
  )
}

function Lista({
  items,
  tono,
}: {
  items: string[]
  tono: "si" | "no" | "neutro"
}) {
  const Icono = tono === "si" ? Check : tono === "no" ? X : Minus
  const color =
    tono === "si" ? "text-success-text" : tono === "no" ? "text-danger-text" : "text-ink-faint"

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-[12.5px] leading-[1.6] text-ink-secondary">
          <Icono className={`mt-[3px] h-3.5 w-3.5 shrink-0 ${color}`} strokeWidth={2.4} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

/* ── 00 · Portada ─────────────────────────────────────────────────────────── */

/** Un color de la paleta por nombre. La página que documenta la marca no puede
 *  tener los hex escritos a mano. */
const hex = (nombre: string) => PALETA.find((c) => c.nombre === nombre)!.hex

function Portada() {
  return (
    <div
      className="overflow-hidden rounded-2xl px-7 py-8 shadow-e2"
      style={{ background: hex("Navy fondo") }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
        {EMPRESA.razonSocial} · Brand Kit
      </p>
      <p className="mt-3 max-w-xl text-[19px] font-semibold leading-snug tracking-[-0.02em] text-white">
        {POSICIONAMIENTO.frase}
      </p>
      <p className="mt-2.5 max-w-2xl text-[13px] leading-relaxed opacity-60" style={{ color: hex("Gris texto") }}>
        {POSICIONAMIENTO.unaLinea}
      </p>

      <div className="mt-7 grid grid-cols-2 gap-4 border-t border-white/[0.08] pt-5 sm:grid-cols-4">
        {CIFRAS.map((c) => (
          <div key={c.label}>
            <p className="text-[22px] font-bold tabular-nums tracking-tight text-white">
              {c.valor}
            </p>
            <p className="mt-0.5 text-[11px] text-white/40">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── 01 · Prompts por disciplina ──────────────────────────────────────────── */

const NOMBRES_BLOQUE: Record<string, string> = Object.fromEntries(
  BLOQUES_CONTEXTO.map((b) => [b.id, b.nombre])
)

function Prompts() {
  return (
    <Section
      id="prompts"
      num="01"
      titulo="Prompts"
      bajada="Un prompt por disciplina, listo para pegar en cualquier modelo. Cada uno trae el conocimiento de marca que esa disciplina necesita y deja afuera el que no: al que diseña no le sirve el manejo de objeciones comerciales, y al que escribe un mail no le sirve la escala tipográfica. Copiás el tuyo y después le pedís lo que quieras."
    >
      <div className="space-y-2.5">
        {PROMPTS.map((p) => (
          <PromptDisciplinaCard key={p.id} prompt={p} nombresBloques={NOMBRES_BLOQUE} />
        ))}
      </div>
    </Section>
  )
}

/* ── 02 · Bloques ─────────────────────────────────────────────────────────── */

function Bloques() {
  return (
    <Section
      id="bloques"
      num="02"
      titulo="Bloques de contexto"
      bajada="Las piezas de las que están hechos los prompts de arriba. No se escriben a mano: se generan desde el resto del kit, así que cambiar un claim, un color o una persona en su sección cambia solo los siete prompts. Nunca hay dos versiones del mismo texto."
    >
      <div className="space-y-2.5">
        {BLOQUES_CONTEXTO.map((b) => (
          <PromptCard
            key={b.id}
            nombre={b.nombre}
            cuando={`Se genera desde la sección correspondiente del kit.`}
            texto={b.texto}
          />
        ))}
      </div>
    </Section>
  )
}

/* ── 03 · Posicionamiento ─────────────────────────────────────────────────── */

function Posicionamiento() {
  return (
    <Section
      id="posicionamiento"
      num="03"
      titulo="Posicionamiento"
      bajada="Qué es Accedra y por qué se la elige. El discurso viejo —soluciones integrales, misión crítica, alto valor agregado— lo puede firmar cualquier integrador del país; acá está reemplazado por hechos."
    >
      <div className="space-y-4">
        <Panel>
          <p className="eyebrow">Frase de marca</p>
          <p className="mt-2 text-[19px] font-semibold leading-snug tracking-[-0.02em] text-ink">
            {POSICIONAMIENTO.frase}
          </p>
          <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-ink-secondary">
            {POSICIONAMIENTO.parrafo}
          </p>
          <div className="mt-3.5">
            <CopyButton texto={POSICIONAMIENTO.parrafo} label="Copiar párrafo" />
          </div>
        </Panel>

        <div className="grid gap-3 sm:grid-cols-3">
          {POSICIONAMIENTO.diferenciales.map((d, i) => (
            <Panel key={d.titulo}>
              <span className="font-mono text-[11px] tabular-nums text-brand-600">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="mt-1.5 text-[13px] font-semibold leading-snug text-ink">{d.titulo}</p>
              <p className="mt-1.5 text-[12px] leading-[1.6] text-ink-muted">{d.detalle}</p>
            </Panel>
          ))}
        </div>

        <Panel>
          <p className="eyebrow">Qué dejar de decir</p>
          <div className="mt-3 space-y-2.5">
            {POSICIONAMIENTO.contraste.map((c) => (
              <div key={c.generico} className="grid gap-2 sm:grid-cols-2">
                <p className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12px] leading-relaxed text-danger-text line-through decoration-danger-text/40">
                  {c.generico}
                </p>
                <p className="rounded-lg border border-success-line bg-success-soft px-3 py-2 text-[12px] font-medium leading-relaxed text-success-text">
                  {c.afilado}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </Section>
  )
}

/* ── 04 · Boilerplate ─────────────────────────────────────────────────────── */

function Boilerplate() {
  return (
    <Section
      id="boilerplate"
      num="04"
      titulo="Boilerplate y bios"
      bajada="El párrafo oficial de Accedra en tres largos. Es lo que se pega en el «Acerca de» de LinkedIn, en una licitación, en una nota o al pie de una propuesta — y lo que evita que cada uno lo reescriba distinto."
    >
      <div className="space-y-3">
        {BOILERPLATE.map((b) => (
          <Panel key={b.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink">{b.nombre}</p>
                <p className="mt-0.5 text-[11.5px] text-ink-muted">{b.uso}</p>
              </div>
              <CopyButton texto={b.texto} mensaje={`Boilerplate ${b.id} copiado`} />
            </div>
            <p className="mt-3 whitespace-pre-line border-t border-line pt-3 text-[12.5px] leading-[1.7] text-ink-secondary">
              {b.texto}
            </p>
          </Panel>
        ))}
      </div>
    </Section>
  )
}

/* ── 05 · Tono ────────────────────────────────────────────────────────────── */

function Tono() {
  return (
    <Section
      id="tono"
      num="05"
      titulo="Tono de voz"
      bajada="Cómo escribe Accedra. Los cinco principios están sacados de los textos que ya funcionan en el sitio; los pares mal/bien son lo que más corrige a una IA o a un redactor nuevo."
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {TONO.principios.map((p, i) => (
            <Panel key={p.titulo}>
              <span className="font-mono text-[11px] tabular-nums text-brand-600">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="mt-1.5 text-[13px] font-semibold text-ink">{p.titulo}</p>
              <p className="mt-1.5 text-[12px] leading-[1.6] text-ink-muted">{p.detalle}</p>
            </Panel>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Panel>
            <p className="eyebrow mb-3 text-success-text">Decimos</p>
            <Lista items={TONO.decimos} tono="si" />
          </Panel>
          <Panel>
            <p className="eyebrow mb-3 text-danger-text">No decimos</p>
            <Lista items={TONO.noDecimos} tono="no" />
          </Panel>
        </div>

        <Panel>
          <p className="eyebrow">Antes y después</p>
          <div className="mt-3 space-y-4">
            {TONO.ejemplos.map((e) => (
              <div key={e.mal} className="border-t border-line pt-3.5 first:border-0 first:pt-0">
                <p className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12px] leading-relaxed text-danger-text">
                  {e.mal}
                </p>
                <p className="mt-1.5 rounded-lg border border-success-line bg-success-soft px-3 py-2 text-[12px] font-medium leading-relaxed text-success-text">
                  {e.bien}
                </p>
                <p className="mt-1.5 text-[11.5px] italic leading-relaxed text-ink-faint">
                  {e.porque}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </Section>
  )
}

/* ── 06 · Claims ──────────────────────────────────────────────────────────── */

function Claims() {
  return (
    <Section
      id="claims"
      num="06"
      titulo="Claims y compliance"
      bajada="Qué se puede prometer, qué necesita permiso y qué no se dice nunca. En banca, seguros y salud la confidencialidad es parte del contrato: una pieza impublicable no es un error de marketing, es un problema comercial."
    >
      <div className="space-y-4">
        <Panel>
          <p className="eyebrow mb-3 text-success-text">Se pueden usar sin pedir permiso</p>
          <Lista items={CLAIMS.libres} tono="si" />
        </Panel>

        <Panel>
          <p className="eyebrow mb-3 text-warning-text">Necesitan una condición</p>
          <div className="space-y-2.5">
            {CLAIMS.condicionados.map((c) => (
              <div key={c.claim} className="rounded-lg border border-line bg-surface-subtle p-3">
                <p className="text-[12.5px] font-semibold text-ink">{c.claim}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{c.condicion}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <p className="eyebrow mb-3 text-danger-text">No se dicen nunca</p>
          <div className="space-y-2.5">
            {CLAIMS.prohibidos.map((c) => (
              <div key={c.claim} className="flex gap-2.5">
                <Ban className="mt-[3px] h-3.5 w-3.5 shrink-0 text-danger-text" strokeWidth={2.2} />
                <div>
                  <p className="text-[12.5px] font-medium text-ink">{c.claim}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">{c.porque}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </Section>
  )
}

/* ── 07 · Logos ───────────────────────────────────────────────────────────── */

function Logos() {
  return (
    <Section
      id="logos"
      num="07"
      titulo="Logos"
      bajada="Seis variantes en vector. Cada una se baja en SVG (para diseño y web) o en PNG de 1600 px con fondo transparente (para presentaciones y Office). El JPG del sitio viejo queda descartado."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LOGOS.map((l) => (
          <LogoCard key={l.id} logo={l} />
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Panel>
          <p className="eyebrow mb-3 text-success-text">Reglas de uso</p>
          <Lista items={REGLAS_LOGO.si} tono="si" />
        </Panel>
        <Panel>
          <p className="eyebrow mb-3 text-danger-text">Nunca</p>
          <Lista items={REGLAS_LOGO.no} tono="no" />
        </Panel>
      </div>
    </Section>
  )
}

/* ── 08 · Paleta ──────────────────────────────────────────────────────────── */

function Paleta() {
  return (
    <Section
      id="paleta"
      num="08"
      titulo="Paleta"
      bajada="Un acento y una escala de neutros. Click en cualquier muestra para copiar el hex. La regla que sostiene todo el sistema: un solo color vivo por pieza — dos acentos compitiendo es lo que abarata una marca corporativa."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PALETA.map((c) => (
          <ColorChip
            key={c.hex}
            nombre={c.nombre}
            hex={c.hex}
            textoSobre={c.textoSobre}
            uso={c.uso}
            nota={c.nota}
          />
        ))}
      </div>

      <Panel className="mt-4">
        <p className="eyebrow">Colores por solución</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
          Cada landing de solución tiene su color de identidad. No es decoración: es lo que
          permite reconocer de qué solución habla una pieza sin leer el título. Se usa como
          acento dentro de esa solución, nunca como color de marca.
        </p>
        <div className="mt-3.5 flex flex-wrap gap-2">
          {COLORES_SOLUCION.map((c) => (
            <div
              key={c.hex}
              className="flex items-center gap-2 rounded-lg border border-line bg-surface-subtle py-1.5 pl-1.5 pr-3"
            >
              <span
                className="h-6 w-6 shrink-0 rounded-md"
                style={{ background: c.hex }}
                aria-hidden
              />
              <div>
                <p className="text-[12px] font-medium leading-tight text-ink">{c.nombre}</p>
                <p className="font-mono text-[10.5px] leading-tight text-ink-faint">{c.hex}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </Section>
  )
}

/* ── 09 · Tipografía ──────────────────────────────────────────────────────── */

function Tipografia() {
  return (
    <Section
      id="tipografia"
      num="09"
      titulo="Tipografía"
      bajada="Dos familias y nada más. Space Grotesk pone la voz en los títulos; Inter hace el trabajo pesado del cuerpo. Sumar una tercera es la forma más rápida de que una pieza deje de parecer de la misma empresa."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {[TIPOGRAFIA.display, TIPOGRAFIA.texto].map((f) => (
          <Panel key={f.nombre}>
            <p className="eyebrow">{f === TIPOGRAFIA.display ? "Display" : "Texto"}</p>
            <p className="mt-1.5 text-[24px] font-semibold tracking-[-0.02em] text-ink">
              {f.nombre}
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-secondary">{f.uso}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">{f.porque}</p>
            <p className="mt-3 border-t border-line pt-2.5 font-mono text-[11.5px] text-ink-faint">
              Pesos {f.pesos}
            </p>
          </Panel>
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Panel>
          <p className="eyebrow mb-3">Reglas</p>
          <Lista items={TIPOGRAFIA.reglas} tono="neutro" />
        </Panel>

        <Panel>
          <p className="eyebrow mb-3">Escala</p>
          <div className="space-y-2">
            {TIPOGRAFIA.escala.map((s) => (
              <div key={s.px} className="flex items-baseline gap-3 border-b border-line/60 pb-2 last:border-0">
                <span className="w-12 shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                  {s.px}
                </span>
                <span className="w-11 shrink-0 text-[11px] font-semibold text-ink-secondary">
                  {s.label}
                </span>
                <span className="text-[12px] text-ink-muted">{s.uso}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </Section>
  )
}

/* ── 10 · Fotografía ──────────────────────────────────────────────────────── */

function Fotografia() {
  return (
    <Section
      id="fotografia"
      num="10"
      titulo="Fotografía e iconos"
      bajada="La mitad del lenguaje visual que ningún manual escribe y que después se nota en cada pieza. Regla de fondo: la foto propia de una obra real le gana siempre al mejor stock del mundo."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Panel>
          <p className="eyebrow mb-3 text-success-text">Sí</p>
          <Lista items={FOTOGRAFIA.si} tono="si" />
        </Panel>
        <Panel>
          <p className="eyebrow mb-3 text-danger-text">Nunca</p>
          <Lista items={FOTOGRAFIA.no} tono="no" />
        </Panel>
      </div>

      <Panel className="mt-3">
        <div className="flex items-center gap-2">
          <p className="eyebrow">Iconografía</p>
          <Badge tone="neutral" size="sm">
            {FOTOGRAFIA.iconos.set}
          </Badge>
        </div>
        <div className="mt-3">
          <Lista items={FOTOGRAFIA.iconos.reglas} tono="neutro" />
        </div>
      </Panel>
    </Section>
  )
}

/* ── 11 · Composición ─────────────────────────────────────────────────────── */

function Composicion() {
  return (
    <Section
      id="composicion"
      num="11"
      titulo="Sistema de piezas"
      bajada="Cómo se arma un post, un banner o una placa. Y el prompt base para generar imágenes con IA, en inglés, que es donde los modelos rinden."
    >
      <div className="space-y-3">
        <Panel>
          <p className="eyebrow mb-3">Composición</p>
          <Lista items={COMPOSICION.reglas} tono="neutro" />
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3">
            <div>
              <p className="eyebrow">Mezcla</p>
              <p className="mt-0.5 text-[12px] text-ink-secondary">{COMPOSICION.estilo}</p>
            </div>
            <div>
              <p className="eyebrow">Referencias</p>
              <p className="mt-0.5 text-[12px] text-ink-secondary">{COMPOSICION.referencias}</p>
            </div>
          </div>
        </Panel>

        <PromptCard
          nombre="Prompt base de imagen"
          cuando="Se pega tal cual y después se le suma el sujeto de la pieza."
          texto={COMPOSICION.promptImagen}
          defaultOpen
        />
      </div>
    </Section>
  )
}

/* ── 12 · Portadas de LinkedIn ────────────────────────────────────────────── */

/**
 * Las tres portadas ya generadas, no un generador.
 *
 * Una portada de perfil la sube una persona una vez y le queda puesta durante
 * años. Si cada quien apretara un botón y se llevara la suya, en seis meses el
 * equipo tendría quince banners distintos — que es exactamente el problema que
 * este kit existe para evitar. Acá se elige entre tres archivos versionados y se
 * baja el elegido. El prompt está a la vista igual, para poder regenerarlos con
 * `scripts/portadas-linkedin.mjs` cuando la marca cambie.
 */
function PortadasLinkedIn() {
  return (
    <Section
      id="portadas-linkedin"
      num="12"
      titulo="Portadas de LinkedIn"
      bajada={`Tres modelos del mismo sistema para el perfil de cada persona del equipo, en ${MEDIDA_PORTADA.ancho} × ${MEDIDA_PORTADA.alto} px y con el logotipo oficial ya compuesto. Se baja una y se sube tal cual.`}
    >
      <div className="space-y-6">
        {PORTADAS_LINKEDIN.map((portada) => (
          <div key={portada.id} className="space-y-2">
            <figure className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
              {/* La proporción es la real: una portada que se previsualiza en
                  otro alto no muestra lo único que importa acá, que es cuánto
                  entra en una banda tan baja. */}
              <div className="relative">
                <Image
                  src={portada.archivo}
                  alt={`Portada de LinkedIn — ${portada.nombre}`}
                  width={MEDIDA_PORTADA.ancho}
                  height={MEDIDA_PORTADA.alto}
                  className="block w-full"
                  unoptimized
                />
                {/* Dónde cae la foto de perfil. Es la mitad del trabajo de esta
                    sección: sin la marca, cualquiera elige mirando una imagen
                    que LinkedIn le va a tapar. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-[6%] top-[38%] aspect-square w-[13%] rounded-full border border-dashed border-white/35"
                />
              </div>

              <figcaption className="flex flex-wrap items-start justify-between gap-3 border-t border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-ink">{portada.nombre}</p>
                  <p className="mt-0.5 max-w-xl text-[11.5px] leading-relaxed text-ink-muted">
                    {portada.cuando}
                  </p>
                </div>
                <Button asChild variant="outline" size="xs">
                  <a href={portada.archivo} download={portada.archivo.split("/").pop()}>
                    <Download />
                    JPG
                  </a>
                </Button>
              </figcaption>
            </figure>

            <PromptCard
              nombre={`Prompt · ${portada.nombre}`}
              cuando="El texto completo con el que se generó. Se regenera con scripts/portadas-linkedin.mjs."
              texto={promptPortada(portada)}
            />
          </div>
        ))}

        <Panel>
          <p className="eyebrow mb-3">Zonas que LinkedIn tapa</p>
          <ul className="space-y-2">
            {ZONAS_PORTADA.map((z) => (
              <li key={z.zona} className="flex gap-2.5 text-[12.5px] leading-[1.6]">
                <Ban className="mt-[3px] h-3.5 w-3.5 shrink-0 text-danger-text" strokeWidth={2.4} />
                <span className="text-ink-secondary">
                  <span className="font-medium text-ink">{z.zona}.</span> {z.porque}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="grid gap-3 sm:grid-cols-2">
          <Panel>
            <p className="eyebrow mb-3">Se hace</p>
            <Lista items={REGLAS_PORTADA.si} tono="si" />
          </Panel>
          <Panel>
            <p className="eyebrow mb-3">No se hace</p>
            <Lista items={REGLAS_PORTADA.no} tono="no" />
          </Panel>
        </div>
      </div>
    </Section>
  )
}

/* ── 13 · Personas ────────────────────────────────────────────────────────── */

function Personas() {
  return (
    <Section
      id="personas"
      num="13"
      titulo="Buyer personas"
      bajada="Tres personas, no una. En una venta B2B de infraestructura casi nunca decide quien la sufre, y quien la sufre casi nunca firma. Los dolores y las objeciones están tomados de los textos de las landings, que son los que ya se validaron contra clientes reales."
    >
      <div className="space-y-3">
        {PERSONAS.map((p) => (
          <Panel key={p.id}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[14px] font-semibold tracking-[-0.015em] text-ink">{p.rol}</h3>
              <Badge tone="brand" size="sm">
                {p.alias}
              </Badge>
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{p.contexto}</p>

            <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
              <div>
                <p className="eyebrow mb-2">Qué le duele</p>
                <Lista items={p.duele} tono="neutro" />
              </div>
              <div>
                <p className="eyebrow mb-2 text-danger-text">Qué lo frena</p>
                <Lista items={p.frena} tono="no" />
              </div>
              <div>
                <p className="eyebrow mb-2 text-success-text">Qué lo convence</p>
                <Lista items={p.convence} tono="si" />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-3.5">
              <div className="min-w-0">
                <p className="eyebrow">Dónde está</p>
                <p className="mt-0.5 text-[12px] text-ink-secondary">{p.donde}</p>
              </div>
              <div className="min-w-0">
                <p className="eyebrow">Mensaje que le sirve</p>
                <p className="mt-0.5 text-[12px] font-medium text-brand-700">“{p.mensaje}”</p>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </Section>
  )
}

/* ── 14 · Servicios ───────────────────────────────────────────────────────── */

function Servicios() {
  return (
    <Section
      id="servicios"
      num="14"
      titulo="Catálogo de servicios"
      bajada="El nombre canónico y la descripción aprobada de cada línea. Sin esto, cada post y cada landing inventa su forma de nombrar lo mismo — y son estas cinco soluciones cruzadas con seis industrias las que arman las 30 páginas del sitio."
    >
      <div className="space-y-3">
        {SERVICIOS.map((s) => (
          <Panel key={s.slug}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-[14px] font-semibold tracking-[-0.015em] text-ink">{s.nombre}</h3>
              <code className="font-mono text-[11px] text-ink-faint">/soluciones/{s.slug}</code>
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-secondary">{s.desc}</p>
            <p className="mt-2 text-[12.5px] font-medium italic text-brand-700">“{s.claim}”</p>

            <div className="mt-3.5 flex flex-wrap gap-1.5 border-t border-line pt-3">
              {s.items.map((i) => (
                <span
                  key={i}
                  className="rounded-md border border-line bg-surface-subtle px-2 py-1 text-[11px] text-ink-secondary"
                >
                  {i}
                </span>
              ))}
            </div>
            <p className="mt-2.5 text-[11.5px] text-ink-faint">
              <span className="font-medium text-ink-muted">Trabajamos con:</span> {s.tech.join(" · ")}
            </p>
          </Panel>
        ))}

        <Panel>
          <p className="eyebrow mb-3">Industrias</p>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {INDUSTRIAS.map((i) => (
              <div key={i.nombre} className="rounded-lg border border-line bg-surface-subtle p-3">
                <p className="text-[12.5px] font-semibold text-ink">{i.nombre}</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">{i.contexto}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </Section>
  )
}

/* ── 15 · Prueba social ───────────────────────────────────────────────────── */

function PruebaSocial() {
  return (
    <Section
      id="prueba-social"
      num="15"
      titulo="Prueba social"
      bajada="Los nombres que se pueden mencionar y con qué respaldo. Todo lo que está acá ya figura públicamente en accedra.com.ar: cualquier cliente que no esté en esta lista necesita autorización escrita antes de aparecer en una pieza."
    >
      <div className="space-y-3">
        <Panel>
          <div className="flex items-center gap-2">
            <p className="eyebrow">Clientes</p>
            <Badge tone="success" size="sm">
              Públicos
            </Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {CLIENTES.map((c) => (
              <span
                key={c}
                className="rounded-md border border-line bg-surface-subtle px-2.5 py-1.5 text-[12px] font-medium text-ink-secondary"
              >
                {c}
              </span>
            ))}
          </div>
        </Panel>

        <Panel>
          <p className="eyebrow">Partners</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
            Se comunican como “partner certificado y distribuidor autorizado”. El logo de un
            fabricante no es un sello de certificación propia: cada marca tiene su propio manual de
            uso y hay que respetarlo.
          </p>
          <div className="mt-3.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PARTNERS.map((p) => (
              <div key={p.nombre} className="rounded-lg border border-line bg-surface-subtle p-2.5">
                <p className="text-[12px] font-semibold text-ink">{p.nombre}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">{p.que}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </Section>
  )
}

/* ── 16 · Casos ───────────────────────────────────────────────────────────── */

function Casos() {
  return (
    <Section
      id="casos"
      num="16"
      titulo="Casos de éxito"
      bajada="Los tres casos publicables, con sus métricas verificables. Es el activo más fuerte que tiene la marca: un número con nombre propio convence más que cualquier eslogan. Las cifras de acá son las únicas que se pueden publicar."
    >
      <div className="space-y-3">
        {CASOS.map((c) => (
          <Panel key={c.cliente}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[14px] font-semibold tracking-[-0.015em] text-ink">{c.cliente}</h3>
              <Badge tone="neutral" size="sm">
                {c.industria}
              </Badge>
            </div>
            <p className="mt-1 text-[13px] font-medium text-brand-700">{c.titulo}</p>

            <div className="mt-3.5 grid grid-cols-3 gap-3 rounded-lg border border-line bg-surface-subtle p-3.5">
              {c.metricas.map((m) => (
                <div key={m.label}>
                  <p className="text-[18px] font-bold tabular-nums tracking-tight text-ink">
                    {m.valor}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-tight text-ink-muted">{m.label}</p>
                </div>
              ))}
            </div>

            <dl className="mt-3.5 space-y-2.5">
              <div>
                <dt className="eyebrow">El desafío</dt>
                <dd className="mt-0.5 text-[12.5px] leading-relaxed text-ink-secondary">
                  {c.desafio}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Qué hicimos</dt>
                <dd className="mt-0.5 text-[12.5px] leading-relaxed text-ink-secondary">
                  {c.solucion}
                </dd>
              </div>
            </dl>
          </Panel>
        ))}
      </div>
    </Section>
  )
}

/* ── 17 · Canales ─────────────────────────────────────────────────────────── */

const TONO_CANAL = {
  prioritario: "brand",
  activo: "success",
  secundario: "neutral",
  pendiente: "warning",
  dormido: "neutral",
} as const

function Canales() {
  return (
    <Section
      id="canales"
      num="17"
      titulo="Canales oficiales"
      bajada="Dónde vive la marca y qué rol cumple cada canal. Suena administrativo hasta que aparecen dos domicilios distintos entre la web y LinkedIn: una lista única es lo que lo previene."
    >
      <div className="space-y-2">
        {CANALES.map((c) => (
          <Panel key={c.nombre}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] font-semibold text-ink">{c.nombre}</p>
              <Badge tone={TONO_CANAL[c.estado]} size="sm">
                {c.estado}
              </Badge>
              {c.url ? (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 font-mono text-[11.5px] text-brand-600 hover:underline"
                >
                  {c.handle}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="ml-auto font-mono text-[11.5px] text-ink-faint">{c.handle}</span>
              )}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">{c.rol}</p>
          </Panel>
        ))}
      </div>
    </Section>
  )
}

/* ── 18 · Ficha ───────────────────────────────────────────────────────────── */

function Ficha() {
  const filas: { label: string; valor: string; copiar?: boolean }[] = [
    { label: "Razón social", valor: EMPRESA.razonSocial, copiar: true },
    { label: "Nombre comercial", valor: EMPRESA.nombreComercial },
    { label: "CUIT", valor: EMPRESA.cuit, copiar: true },
    { label: "Fundación", valor: `${EMPRESA.fundacion} · ${EMPRESA.antiguedad}` },
    { label: "Tamaño", valor: EMPRESA.tamano },
    { label: "Rubro", valor: EMPRESA.rubro },
    { label: "Actividad AFIP", valor: EMPRESA.actividadAfip },
    { label: "Email", valor: EMPRESA.email, copiar: true },
    { label: "Teléfono", valor: EMPRESA.telefono, copiar: true },
    { label: "WhatsApp", valor: EMPRESA.whatsapp, copiar: true },
    { label: "Sitio", valor: EMPRESA.sitio, copiar: true },
    { label: "Horario", valor: EMPRESA.horario },
    { label: "Área servida", valor: EMPRESA.areaServida },
    { label: "Domicilio", valor: EMPRESA.domicilio, copiar: true },
  ]

  return (
    <Section
      id="ficha"
      num="18"
      titulo="Ficha de datos"
      bajada="Los datos duros, en un solo lugar. Tienen que ser idénticos en la web, en LinkedIn y en Google Business: cualquier variación resta señal de SEO local."
    >
      <Panel className="p-0">
        <dl className="divide-y divide-line">
          {filas.map((f) => (
            <div key={f.label} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5">
              <dt className="w-44 shrink-0 text-[12px] text-ink-muted">{f.label}</dt>
              <dd className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-[12.5px] text-ink-secondary">{f.valor}</span>
                {f.copiar && (
                  <CopyButton
                    texto={f.valor}
                    label=""
                    mensaje={`${f.label} copiado`}
                    variant="ghost"
                    className="ml-auto h-6 w-6 p-0"
                  />
                )}
              </dd>
            </div>
          ))}
        </dl>

        <div className="border-t border-line bg-surface-subtle px-5 py-3.5">
          <p className="eyebrow mb-2">Conducción</p>
          {EMPRESA.direccion.map((d) => (
            <p key={d.nombre} className="text-[12.5px] text-ink-secondary">
              <span className="font-medium text-ink">{d.nombre}</span>
              <span className="text-ink-muted"> · {d.rol}</span>
            </p>
          ))}
        </div>
      </Panel>
    </Section>
  )
}
